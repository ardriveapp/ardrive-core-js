import { createWriteStream, mkdirSync, readdirSync, readFileSync, Stats, statSync } from 'fs';
import { basename, dirname, join as joinPath, relative as relativePath } from 'path';
import { Duplex, pipeline, Readable } from 'stream';
import { promisify } from 'util';
import {
	ByteCount,
	DataContentType,
	UnixTime,
	FileID,
	FolderID,
	MANIFEST_CONTENT_TYPE,
	Manifest,
	ManifestPathMap,
	TransactionID
} from '../types';
import { encryptedDataSize, extToMime } from '../utils/common';
import { BulkFileBaseCosts, MetaDataBaseCosts, errorOnConflict, skipOnConflicts, upsertOnConflicts } from '../types';
import { alphabeticalOrder } from '../utils/sort_functions';
import { ArFSPrivateFile, ArFSPublicFile, ArFSPublicFileOrFolderWithPaths, ArFSWithPath } from './arfs_entities';

const pipelinePromise = promisify(pipeline);

type BaseFileName = string;
type FilePath = string;

/**
 *  Fs + Node implementation file size limitations -- tested on MacOS Sep 27, 2021
 *
 *  Public : 2147483647 bytes
 *  Private: 2147483646 bytes
 */
const maxFileSize = new ByteCount(2_147_483_646);

export interface FileInfo {
	dataContentType: DataContentType;
	lastModifiedDateMS: UnixTime;
	fileSize: ByteCount;
}

/**
 * Reads stats of a file or folder  and constructs a File or Folder wrapper class
 *
 * @remarks import and use `isFolder` type-guard to later determine whether a folder or file
 *
 * @example
 *
 * const fileOrFolder = wrapFileOrFolder(myFilePath);
 *
 * if (isFolder(fileOrFolder)) {
 * 	// Type is: Folder
 * } else {
 * 	// Type is: File
 * }
 *
 */
export function wrapFileOrFolder(fileOrFolderPath: FilePath): ArFSFileToUpload | ArFSFolderToUpload {
	const entityStats = statSync(fileOrFolderPath);

	if (entityStats.isDirectory()) {
		return new ArFSFolderToUpload(fileOrFolderPath, entityStats);
	}

	return new ArFSFileToUpload(fileOrFolderPath, entityStats);
}

/** Type-guard function to determine if returned class is a File or Folder */
export function isFolder(fileOrFolder: ArFSFileToUpload | ArFSFolderToUpload): fileOrFolder is ArFSFolderToUpload {
	return fileOrFolder instanceof ArFSFolderToUpload;
}
export abstract class ArFSEntityToUpload {
	abstract gatherFileInfo(): FileInfo;
	abstract getFileDataBuffer(): Buffer;
	abstract getBaseFileName(): BaseFileName;

	abstract lastModifiedDate: UnixTime;
	abstract size: ByteCount;
	existingId?: FileID;
	newFileName?: string;
	conflictResolution?: FileConflictResolution;

	public get destinationBaseName(): string {
		return this.newFileName ?? this.getBaseFileName();
	}
}

export class ArFSManifestToUpload extends ArFSEntityToUpload {
	manifest: Manifest;
	lastModifiedDateMS: UnixTime;

	constructor(
		public readonly folderToGenManifest: ArFSPublicFileOrFolderWithPaths[],
		public readonly destManifestName: string
	) {
		super();

		const sortedChildren = folderToGenManifest.sort((a, b) => alphabeticalOrder(a.path, b.path));
		const baseFolderPath = sortedChildren[0].path;

		// TODO: Fix base types so deleting un-used values is not necessary; Tickets: PE-525 + PE-556
		const castedChildren = sortedChildren as Partial<ArFSPublicFileOrFolderWithPaths>[];
		castedChildren.map((fileOrFolderMetaData) => {
			if (fileOrFolderMetaData.entityType === 'folder') {
				delete fileOrFolderMetaData.lastModifiedDate;
				delete fileOrFolderMetaData.size;
				delete fileOrFolderMetaData.dataTxId;
				delete fileOrFolderMetaData.dataContentType;
			}
		});

		// TURN SORTED CHILDREN INTO MANIFEST
		const pathMap: ManifestPathMap = {};
		castedChildren.forEach((child) => {
			if (child.dataTxId && child.path && child.dataContentType !== MANIFEST_CONTENT_TYPE) {
				const path = child.path
					// Slice off base folder path and the leading "/" so manifest URLs path correctly
					.slice(baseFolderPath.length + 1)
					// Replace spaces with underscores for sharing links
					.replace(/ /g, '_');

				pathMap[path] = { id: `${child.dataTxId}` };
			}
		});

		if (Object.keys(pathMap).length === 0) {
			throw new Error('Cannot construct a manifest of a folder that has no file entities!');
		}

		// Use index.html in the specified folder if it exists, otherwise show first file found
		const indexPath = Object.keys(pathMap).includes(`index.html`) ? `index.html` : Object.keys(pathMap)[0];

		this.manifest = {
			manifest: 'arweave/paths',
			version: '0.1.0',
			index: {
				path: indexPath
			},
			paths: pathMap
		};

		// Create new current unix, as we just created this manifest
		this.lastModifiedDateMS = new UnixTime(Math.round(Date.now() / 1000));
	}

	public getLinksOutput(dataTxId: TransactionID): string[] {
		const allPaths = Object.keys(this.manifest.paths);

		const encodedPaths = allPaths.map((path) =>
			path
				// Split each path by `/` to avoid encoding the separation between folders and files
				.split('/')
				// Encode file/folder names for URL safe links
				.map((path) => encodeURIComponent(path))
				// Rejoin the paths
				.join('/')
		);

		const pathsToFiles = encodedPaths.map((encodedPath) => `https://arweave.net/${dataTxId}/${encodedPath}`);
		const pathToManifestTx = `https://arweave.net/${dataTxId}`;

		return [pathToManifestTx, ...pathsToFiles];
	}

	public gatherFileInfo(): FileInfo {
		const dataContentType = MANIFEST_CONTENT_TYPE;

		return { dataContentType, lastModifiedDateMS: this.lastModifiedDateMS, fileSize: this.size };
	}

	public getBaseFileName(): BaseFileName {
		return this.newFileName ?? this.destManifestName;
	}

	public getFileDataBuffer(): Buffer {
		return Buffer.from(JSON.stringify(this.manifest));
	}

	public get size(): ByteCount {
		return new ByteCount(Buffer.byteLength(JSON.stringify(this.manifest)));
	}

	public get lastModifiedDate(): UnixTime {
		return this.lastModifiedDateMS;
	}
}

export type FolderConflictResolution = typeof skipOnConflicts | undefined;
export type FileConflictResolution = FolderConflictResolution | typeof upsertOnConflicts | typeof errorOnConflict;

export class ArFSFileToUpload extends ArFSEntityToUpload {
	constructor(public readonly filePath: FilePath, public readonly fileStats: Stats) {
		super();
		if (+this.fileStats.size > +maxFileSize) {
			throw new Error(`Files greater than "${maxFileSize}" bytes are not yet supported!`);
		}
	}

	baseCosts?: BulkFileBaseCosts;

	public gatherFileInfo(): FileInfo {
		const dataContentType = this.contentType;
		const lastModifiedDateMS = this.lastModifiedDate;
		const fileSize = this.size;

		return { dataContentType, lastModifiedDateMS, fileSize };
	}

	public get size(): ByteCount {
		return new ByteCount(this.fileStats.size);
	}

	public get lastModifiedDate(): UnixTime {
		return new UnixTime(Math.floor(this.fileStats.mtimeMs));
	}

	public getBaseCosts(): BulkFileBaseCosts {
		if (!this.baseCosts) {
			throw new Error('Base costs on file were never set!');
		}
		return this.baseCosts;
	}

	public getFileDataBuffer(): Buffer {
		return readFileSync(this.filePath);
	}

	public get contentType(): DataContentType {
		return extToMime(this.filePath);
	}

	public getBaseFileName(): BaseFileName {
		return basename(this.filePath);
	}

	/** Computes the size of a private file encrypted with AES256-GCM */
	public encryptedDataSize(): ByteCount {
		return encryptedDataSize(this.size);
	}
}

export class ArFSFolderToUpload {
	files: ArFSFileToUpload[] = [];
	folders: ArFSFolderToUpload[] = [];

	baseCosts?: MetaDataBaseCosts;
	existingId?: FolderID;
	newFolderName?: string;
	conflictResolution: FolderConflictResolution = undefined;

	constructor(public readonly filePath: FilePath, public readonly fileStats: Stats) {
		const entitiesInFolder = readdirSync(this.filePath);

		for (const entityPath of entitiesInFolder) {
			const absoluteEntityPath = joinPath(this.filePath, entityPath);
			const entityStats = statSync(absoluteEntityPath);

			if (entityStats.isDirectory()) {
				// Child is a folder, build a new folder which will construct it's own children
				const childFolder = new ArFSFolderToUpload(absoluteEntityPath, entityStats);
				this.folders.push(childFolder);
			} else {
				// Child is a file, build a new file
				const childFile = new ArFSFileToUpload(absoluteEntityPath, entityStats);
				if (childFile.getBaseFileName() !== '.DS_Store') {
					this.files.push(childFile);
				}
			}
		}
	}

	public getBaseCosts(): MetaDataBaseCosts {
		if (!this.baseCosts) {
			throw new Error('Base costs on folder were never set!');
		}
		return this.baseCosts;
	}

	public getBaseFileName(): BaseFileName {
		return basename(this.filePath);
	}

	getTotalByteCount(encrypted = false): ByteCount {
		let totalByteCount = 0;

		for (const file of this.files) {
			totalByteCount += encrypted ? +file.encryptedDataSize() : file.fileStats.size;
		}
		for (const folder of this.folders) {
			totalByteCount += +folder.getTotalByteCount(encrypted);
		}

		return new ByteCount(totalByteCount);
	}
}

export abstract class ArFSFileToDownload {
	constructor(
		readonly fileEntity: ArFSPublicFile | ArFSPrivateFile,
		readonly dataStream: Readable,
		readonly localFilePath: string
	) {}

	abstract write(): Promise<void>;

	// FIXME: make it compatible with Windows
	protected setLastModifiedDate = (): void => {
		// update the last-modified-date
		// const remoteFileLastModifiedDate = Math.ceil(+this.fileEntity.lastModifiedDate / 1000);
		// const accessTime = Date.now();
		// utimesSync(this.localFilePath, accessTime, remoteFileLastModifiedDate);
	};
}

export class ArFSPublicFileToDownload extends ArFSFileToDownload {
	constructor(fileEntity: ArFSPublicFile, dataStream: Readable, localFilePath: string) {
		super(fileEntity, dataStream, localFilePath);
	}

	async write(): Promise<void> {
		const writeStream = createWriteStream(this.localFilePath); // TODO: wrap 'fs' in a browser-safe class
		const writePromise = pipelinePromise(this.dataStream, writeStream);
		writePromise.finally(this.setLastModifiedDate);
	}
}

export class ArFSPrivateFileToDownload extends ArFSFileToDownload {
	constructor(
		fileEntity: ArFSPrivateFile,
		dataStream: Readable,
		localFilePath: string,
		private readonly decryptingStream: Duplex
	) {
		super(fileEntity, dataStream, localFilePath);
	}

	async write(): Promise<void> {
		const writeStream = createWriteStream(this.localFilePath); // TODO: wrap 'fs' in a browser-safe class
		const writePromise = pipelinePromise(this.dataStream, this.decryptingStream, writeStream);
		return writePromise.finally(this.setLastModifiedDate);
	}
}

export class ArFSFolderToDownload<P extends ArFSWithPath> {
	constructor(readonly folderWithPaths: P, protected readonly customBaseName?: string) {}

	getRelativePathOf(childPath: string): string {
		const treeRootPath = this.folderWithPaths.path;
		const treeRootParentPath = dirname(treeRootPath);
		if (this.customBaseName) {
			return joinPath(this.customBaseName, relativePath(treeRootPath, childPath));
		} else {
			return relativePath(treeRootParentPath, childPath);
		}
	}

	ensureFolderExistence(folderPath: string, recursive = false): void {
		try {
			const stat = statSync(folderPath);
			if (!stat.isDirectory()) {
				// FIXME: this error will be caught by the try..catch
				throw new Error(`Path is not a directory: "${folderPath}"`);
			}
		} catch {
			mkdirSync(folderPath, { recursive });
		}
	}
}
