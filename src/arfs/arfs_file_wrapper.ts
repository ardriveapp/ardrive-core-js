import * as fs from 'fs';
import { basename, join } from 'path';
import { Duplex, PassThrough } from 'stream';
import { ArDrive } from '../ardrive';
import { ArDriveAnonymous } from '../ardrive_anonymous';
import {
	ByteCount,
	DataContentType,
	UnixTime,
	FileID,
	FolderID,
	CipherIVQueryResult,
	CipherIV,
	DriveKey
} from '../types';
import { BulkFileBaseCosts, MetaDataBaseCosts } from '../types';
import { extToMime } from '../utils/common';
import { EntityNamesAndIds } from '../utils/mapper_functions';
import { ArFSAnyFileOrFolderWithPaths, ArFSPrivateFile } from './arfs_entities';

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
	const entityStats = fs.statSync(fileOrFolderPath);

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
	constructor(public readonly filePath: FilePath, public readonly fileStats: fs.Stats) {
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
		return fs.readFileSync(this.filePath);
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

	constructor(public readonly filePath: FilePath, public readonly fileStats: fs.Stats) {
		const entitiesInFolder = fs.readdirSync(this.filePath);

		for (const entityPath of entitiesInFolder) {
			const absoluteEntityPath = join(this.filePath, entityPath);
			const entityStats = fs.statSync(absoluteEntityPath);

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

export class ArFSFileToDownload {
	private _length = 0;

	constructor(
		private readonly ardrive: ArDriveAnonymous,
		readonly fileEntity: ArFSAnyFileOrFolderWithPaths,
		private readonly driveKey?: DriveKey,
		private readonly cipherIv?: CipherIV
	) {
		if (fileEntity.entityType !== 'file') {
			throw new Error(`Can only download data of file entities, but got ${fileEntity.entityType}`);
		}
	}

	get length(): number {
		return this._length;
	}

	async getDataStream(): Promise<Duplex> {
		const { data, length } = await this.ardrive.getDataStream(this.fileEntity.entity as ArFSPrivateFile);
		this._length = length;
		return data;
	}

	async getDecryptingStream(): Promise<Duplex> {
		if (this.cipherIv && this.driveKey) {
			const decryptingStream = await (this.ardrive as ArDrive).getDecryptingStream(
				this.fileEntity.entity as ArFSPrivateFile,
				this.driveKey,
				this.cipherIv
			);
			return decryptingStream;
		}
		// returns a dummy stream
		return new PassThrough();
	}
}

export class ArFSFolderToDownload {
	private readonly _folders: ArFSAnyFileOrFolderWithPaths[] = [];
	private readonly _files: ArFSFileToDownload[] = [];

	constructor(
		private readonly ardrive: ArDriveAnonymous,
		readonly rootFolderWithPaths: ArFSAnyFileOrFolderWithPaths
	) {
		if (rootFolderWithPaths.entityType !== 'folder') {
			throw new Error(`Entity of type ${rootFolderWithPaths.entityType} is not a folder`);
		}
	}

	public get folders(): ArFSAnyFileOrFolderWithPaths[] {
		return this._folders.slice();
	}

	public get files(): ArFSFileToDownload[] {
		return this._files.slice();
	}

	private get basePath(): string {
		return this.rootFolderWithPaths.path.replace(/\/[^/]+$/, '');
	}

	async hidratate(
		folderEntityDump: ArFSAnyFileOrFolderWithPaths[],
		driveKey?: DriveKey,
		cipherIVs?: CipherIVQueryResult[]
	): Promise<void> {
		for (const entityWithPaths of folderEntityDump) {
			if (entityWithPaths.entityType === 'folder') {
				this._folders.push(entityWithPaths);
			} else if (entityWithPaths.entityType === 'file') {
				const cipherIvResult = cipherIVs?.find((result) => result.txId === entityWithPaths.dataTxId);
				if (cipherIvResult && driveKey) {
					this._files.push(
						new ArFSFileToDownload(this.ardrive, entityWithPaths, driveKey, cipherIvResult.cipherIV)
					);
				} else {
					this._files.push(new ArFSFileToDownload(this.ardrive, entityWithPaths));
				}
			} else {
				throw new Error(`Unsupported entity type: ${entityWithPaths.entityType}`);
			}
		}
	}

	getRelativePath(entity: ArFSAnyFileOrFolderWithPaths): string {
		const relativePath = entity.path.replace(new RegExp(`^${this.basePath}/`), '');
		return relativePath;
	}
}
