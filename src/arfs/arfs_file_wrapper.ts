import { createWriteStream, mkdirSync, readdirSync, readFileSync, Stats, statSync } from 'fs';
import { basename, dirname, join as joinPath, relative as relativePath, resolve as resolveAbsolutePath } from 'path';
import { Duplex, pipeline, Readable } from 'stream';
import { promisify } from 'util';
import {
	ByteCount,
	DataContentType,
	UnixTime,
	MANIFEST_CONTENT_TYPE,
	Manifest,
	ManifestPathMap,
	TransactionID,
	EntityID,
	EntityType,
	PRIVATE_CONTENT_TYPE
} from '../types';
import { encryptedDataSize, extToMime } from '../utils/common';
import { errorOnConflict, skipOnConflicts, upsertOnConflicts } from '../types';
import { alphabeticalOrder } from '../utils/sort_functions';
import { ArFSPrivateFile, ArFSPublicFile, ArFSWithPath } from './arfs_entities';
import { ArFSPublicFileWithPaths, ArFSPublicFolderWithPaths, SourceUri } from '../exports';
import { defaultArweaveGatewayPath } from '../utils/constants';

const pipelinePromise = promisify(pipeline);

type BaseName = string;
type LocalEntityPath = string;

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

export function resolveEntityPathToLocalSourceUri(entityPath: LocalEntityPath): SourceUri {
	return `file://${resolveAbsolutePath(entityPath)}`;
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
export function wrapFileOrFolder(
	fileOrFolderPath: LocalEntityPath,
	customContentType?: DataContentType
): ArFSFileToUpload | ArFSFolderToUpload {
	const entityStats = statSync(fileOrFolderPath);

	if (entityStats.isDirectory()) {
		return new ArFSFolderToUpload(fileOrFolderPath, entityStats);
	}

	return new ArFSFileToUpload(fileOrFolderPath, entityStats, customContentType);
}

/** Type-guard function to determine if returned class is a File or Folder */
export function isFolder(fileOrFolder: ArFSDataToUpload | ArFSFolderToUpload): fileOrFolder is ArFSFolderToUpload {
	return fileOrFolder instanceof ArFSFolderToUpload;
}

export abstract class ArFSBaseEntityToUpload {
	abstract getBaseName(): BaseName;
	abstract readonly entityType: EntityType;

	// Source URI is optional when an upload has no local or remote source (manifest use case). It remains
	// non-abstract so classes can choose not have to implement it, which will default the value to undefined
	readonly sourceUri?: SourceUri;

	destName?: string;
	existingId?: EntityID;

	public get destinationBaseName(): string {
		return this.destName ?? this.getBaseName();
	}
}

export abstract class ArFSDataToUpload extends ArFSBaseEntityToUpload {
	abstract gatherFileInfo(): FileInfo;
	abstract getFileDataBuffer(): Buffer;

	abstract readonly contentType: DataContentType;
	abstract readonly lastModifiedDate: UnixTime;
	abstract readonly size: ByteCount;

	conflictResolution?: FileConflictResolution;
	readonly customContentType?: DataContentType;

	readonly entityType = 'file';
}

export class ArFSManifestToUpload extends ArFSDataToUpload {
	manifest: Manifest;
	lastModifiedDateMS: UnixTime;

	constructor(
		public readonly folderToGenManifest: (ArFSPublicFolderWithPaths | ArFSPublicFileWithPaths)[],
		public readonly destManifestName: string
	) {
		super();

		const sortedChildren = folderToGenManifest.sort((a, b) => alphabeticalOrder(a.path, b.path));
		const baseFolderPath = sortedChildren[0].path;

		// TODO: Fix base types so deleting un-used values is not necessary; Tickets: PE-525 + PE-556
		const castedChildren = sortedChildren as Partial<ArFSPublicFolderWithPaths | ArFSPublicFileWithPaths>[];
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

	public getLinksOutput(dataTxId: TransactionID, gateway = new URL(defaultArweaveGatewayPath)): string[] {
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

		const pathsToFiles = encodedPaths.map((encodedPath) => `${gateway.href}${dataTxId}/${encodedPath}`);
		const pathToManifestTx = `${gateway.href}${dataTxId}`;

		return [pathToManifestTx, ...pathsToFiles];
	}

	public gatherFileInfo(): FileInfo {
		return { dataContentType: this.contentType, lastModifiedDateMS: this.lastModifiedDateMS, fileSize: this.size };
	}

	public get contentType(): DataContentType {
		return this.customContentType ?? MANIFEST_CONTENT_TYPE;
	}

	public getBaseName(): BaseName {
		return this.destName ?? this.destManifestName;
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

export type FolderConflictResolution = typeof skipOnConflicts | typeof errorOnConflict | undefined;
export type FileConflictResolution = FolderConflictResolution | typeof upsertOnConflicts;

export class ArFSFileToUpload extends ArFSDataToUpload {
	constructor(
		public readonly filePath: LocalEntityPath,
		public readonly fileStats: Stats,
		public readonly customContentType?: DataContentType
	) {
		super();
		if (+this.fileStats.size > +maxFileSize) {
			throw new Error(`Files greater than "${maxFileSize}" bytes are not yet supported!`);
		}
	}

	public readonly sourceUri = resolveEntityPathToLocalSourceUri(this.filePath);

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

	public getFileDataBuffer(): Buffer {
		return readFileSync(this.filePath);
	}

	public get contentType(): DataContentType {
		if (this.customContentType) {
			return this.customContentType;
		}

		const mimeType = extToMime(this.filePath);

		if (mimeType === 'unknown') {
			// If mime type cannot be derived from the file extension, use octet stream content type
			return PRIVATE_CONTENT_TYPE;
		}
		return mimeType;
	}

	public getBaseName(): BaseName {
		return basename(this.filePath);
	}

	/** Computes the size of a private file encrypted with AES256-GCM */
	public encryptedDataSize(): ByteCount {
		return encryptedDataSize(this.size);
	}
}

export class ArFSFolderToUpload extends ArFSBaseEntityToUpload {
	files: ArFSFileToUpload[] = [];
	folders: ArFSFolderToUpload[] = [];

	conflictResolution: FolderConflictResolution = undefined;

	public readonly entityType = 'folder';
	public readonly sourceUri = resolveEntityPathToLocalSourceUri(this.filePath);

	constructor(public readonly filePath: LocalEntityPath, public readonly fileStats: Stats) {
		super();

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
				if (childFile.getBaseName() !== '.DS_Store') {
					this.files.push(childFile);
				}
			}
		}
	}

	public getBaseName(): BaseName {
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
