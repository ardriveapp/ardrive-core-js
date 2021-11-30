import { createWriteStream, mkdirSync, readdirSync, readFileSync, Stats, statSync, utimesSync } from 'fs';
import { basename, dirname, join as joinPath } from 'path';
import { Duplex, pipeline, Readable } from 'stream';
import { promisify } from 'util';
import { ByteCount, DataContentType, UnixTime, FileID, FolderID } from '../types';
import { BulkFileBaseCosts, MetaDataBaseCosts } from '../types';
import { extToMime } from '../utils/common';
import { EntityNamesAndIds } from '../utils/mapper_functions';
import {
	ArFSFileOrFolderEntity,
	ArFSPrivateFile,
	ArFSPrivateFileOrFolderWithPaths,
	ArFSPrivateFolder,
	ArFSPublicFile,
	ArFSPublicFileOrFolderWithPaths,
	ArFSPublicFolder
} from './arfs_entities';
import { FolderHierarchy } from './folderHierarchy';

const pipelinePromise = promisify(pipeline);

type BaseFileName = string;
type FilePath = string;

/**
 *  Fs + Node implementation file size limitations -- tested on MacOS Sep 27, 2021
 *
 *  Public : 2147483647 bytes
 *  Private: 2147483646 bytes
 */
const maxFileSize = new ByteCount(2147483646);

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

export class ArFSFileToUpload {
	constructor(public readonly filePath: FilePath, public readonly fileStats: Stats) {
		if (+this.fileStats.size >= +maxFileSize) {
			throw new Error(`Files greater than "${maxFileSize}" bytes are not yet supported!`);
		}
	}

	baseCosts?: BulkFileBaseCosts;
	existingId?: FileID;
	existingFolderAtDestConflict = false;
	hasSameLastModifiedDate = false;

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
		return new ByteCount((this.fileStats.size / 16 + 1) * 16);
	}
}

export class ArFSFolderToUpload {
	files: ArFSFileToUpload[] = [];
	folders: ArFSFolderToUpload[] = [];

	baseCosts?: MetaDataBaseCosts;
	existingId?: FolderID;
	destinationName?: string;
	existingFileAtDestConflict = false;

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

	public async checkAndAssignExistingNames(
		getExistingNamesFn: (parentFolderId: FolderID) => Promise<EntityNamesAndIds>
	): Promise<void> {
		if (!this.existingId) {
			// Folder has no existing ID to check
			return;
		}

		const existingEntityNamesAndIds = await getExistingNamesFn(this.existingId);

		for await (const file of this.files) {
			const baseFileName = file.getBaseFileName();

			const existingFolderAtDestConflict = existingEntityNamesAndIds.folders.find(
				({ folderName }) => folderName === baseFileName
			);

			if (existingFolderAtDestConflict) {
				// Folder name cannot conflict with a file name
				file.existingFolderAtDestConflict = true;
				continue;
			}

			const existingFileAtDestConflict = existingEntityNamesAndIds.files.find(
				({ fileName }) => fileName === baseFileName
			);

			// Conflicting file name creates a REVISION by default
			if (existingFileAtDestConflict) {
				file.existingId = existingFileAtDestConflict.fileId;

				if (existingFileAtDestConflict.lastModifiedDate.valueOf() === file.lastModifiedDate.valueOf()) {
					// Check last modified date and set to true to resolve upsert conditional
					file.hasSameLastModifiedDate = true;
				}
			}
		}

		for await (const folder of this.folders) {
			const baseFolderName = folder.getBaseFileName();

			const existingFileAtDestConflict = existingEntityNamesAndIds.files.find(
				({ fileName }) => fileName === baseFolderName
			);

			if (existingFileAtDestConflict) {
				// Folder name cannot conflict with a file name
				this.existingFileAtDestConflict = true;
				continue;
			}

			const existingFolderAtDestConflict = existingEntityNamesAndIds.folders.find(
				({ folderName }) => folderName === baseFolderName
			);

			// Conflicting folder name uses EXISTING folder by default
			if (existingFolderAtDestConflict) {
				// Assigns existing id for later use
				folder.existingId = existingFolderAtDestConflict.folderId;

				// Recurse into existing folder on folder name conflict
				await folder.checkAndAssignExistingNames(getExistingNamesFn);
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
		readonly fileEntity: ArFSFileOrFolderEntity,
		readonly dataStream: Readable,
		readonly localFilePath: string
	) {
		if (!fileEntity || fileEntity.entityType !== 'file') {
			throw new Error(`Can only download the data of file entities, but got ${fileEntity.entityType}`);
		}
	}

	abstract write(): Promise<void>;

	protected setLastModifiedDate = (): void => {
		// debugger;
		// update the last-modified-date
		const remoteFileLastModifiedDate = Math.ceil(+this.fileEntity.lastModifiedDate / 1000);
		const accessTime = Date.now();
		utimesSync(this.localFilePath, accessTime, remoteFileLastModifiedDate);
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

export abstract class ArFSFolderToDownload {
	abstract readonly rootFolderWithPaths: ArFSPublicFileOrFolderWithPaths | ArFSPrivateFileOrFolderWithPaths;

	constructor(protected readonly hierarchy: FolderHierarchy) {}

	getPathRelativeToSubtree(entity: ArFSPublicFileOrFolderWithPaths | ArFSPrivateFileOrFolderWithPaths): string {
		debugger;
		const rootFolderParentPath = dirname(this.rootFolderWithPaths.path);
		const relativePath = entity.path.replace(new RegExp(`^${rootFolderParentPath}/`), '');
		return relativePath;
	}

	ensureFolderExistence(folderPath: string, recursive = true): void {
		try {
			const stat = statSync(folderPath);
			if (!stat.isDirectory()) {
				throw new Error(`Path is not a directory: "${folderPath}"`);
			}
		} catch {
			mkdirSync(folderPath, { recursive });
		}
	}
}

export class ArFSPublicFolderToDownload extends ArFSFolderToDownload {
	readonly rootFolderWithPaths: ArFSPublicFileOrFolderWithPaths;

	constructor(rootFolderEntity: ArFSPublicFolder, hierarchy: FolderHierarchy) {
		super(hierarchy);
		this.rootFolderWithPaths = new ArFSPublicFileOrFolderWithPaths(rootFolderEntity, this.hierarchy);
	}
}

export class ArFSPrivateFolderToDownload extends ArFSFolderToDownload {
	readonly rootFolderWithPaths: ArFSPrivateFileOrFolderWithPaths;

	constructor(folders: ArFSPrivateFolder[], hierarchy: FolderHierarchy) {
		super(hierarchy);
		const entityId = this.hierarchy.rootNode.folderId;
		const rootFolderEntitiy = folders.find((entity) => entity.entityId === entityId);
		if (!rootFolderEntitiy) {
			throw new Error(`The root folder was not provided!`);
		}
		this.rootFolderWithPaths = new ArFSPrivateFileOrFolderWithPaths(rootFolderEntitiy, this.hierarchy);
	}
}
