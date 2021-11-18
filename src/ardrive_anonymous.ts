import {
	ArFSPublicDrive,
	ArFSPublicFolder,
	ArFSPublicFile,
	ArFSDriveEntity,
	ArFSPublicFileOrFolderWithPaths
} from './arfs/arfs_entities';
import { ArFSDAOType, ArFSDAOAnonymous } from './arfs/arfsdao_anonymous';
import { DriveID, ArweaveAddress, upsertOnConflicts, FileNameConflictResolution, FolderID } from './types';
import {
	GetPublicDriveParams,
	GetPublicFolderParams,
	GetPublicFileParams,
	GetAllDrivesForAddressParams,
	ListPublicFolderParams
} from './types';
import { join as joinPath } from 'path';
import { proceedWritingFile, proceedWritingFolder } from './utils/local_storage_conflict_resolution';
import { promisify } from 'util';
import { createWriteStream, mkdir, utimes } from 'fs';
import { pipeline } from 'stream';

const mkdirPromise = promisify(mkdir);
const utimesPromise = promisify(utimes);
const pipelinePromise = promisify(pipeline);

export abstract class ArDriveType {
	protected abstract readonly arFsDao: ArFSDAOType;
}

export class ArDriveAnonymous extends ArDriveType {
	constructor(protected readonly arFsDao: ArFSDAOAnonymous) {
		super();
	}

	public async getOwnerForDriveId(driveId: DriveID): Promise<ArweaveAddress> {
		return this.arFsDao.getOwnerForDriveId(driveId);
	}

	public async getPublicDrive({ driveId, owner }: GetPublicDriveParams): Promise<ArFSPublicDrive> {
		if (!owner) {
			owner = await this.getOwnerForDriveId(driveId);
		}

		return this.arFsDao.getPublicDrive(driveId, owner);
	}

	public async getPublicFolder({ folderId, owner }: GetPublicFolderParams): Promise<ArFSPublicFolder> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
		}

		return this.arFsDao.getPublicFolder(folderId, owner);
	}

	public async getPublicFile({ fileId, owner }: GetPublicFileParams): Promise<ArFSPublicFile> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFileId(fileId);
		}

		return this.arFsDao.getPublicFile(fileId, owner);
	}

	public async getAllDrivesForAddress({
		address,
		privateKeyData
	}: GetAllDrivesForAddressParams): Promise<ArFSDriveEntity[]> {
		return this.arFsDao.getAllDrivesForAddress(address, privateKeyData);
	}

	/**
	 * Lists the children of certain public folder
	 * @param {FolderID} folderId the folder ID to list children of
	 * @returns {ArFSPublicFileOrFolderWithPaths[]} an array representation of the children and parent folder
	 */
	public async listPublicFolder({
		folderId,
		maxDepth = 0,
		includeRoot = false,
		owner
	}: ListPublicFolderParams): Promise<ArFSPublicFileOrFolderWithPaths[]> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
		}

		const children = await this.arFsDao.listPublicFolder({ folderId, maxDepth, includeRoot, owner });
		return children;
	}

	/**
	 *
	 * @param folderId - the ID of the folder to be download
	 * @returns - the array of streams to write
	 */
	async downloadPublicFolder(
		folderId: FolderID,
		maxDepth: number,
		path: string,
		conflictResolutionStrategy: FileNameConflictResolution = upsertOnConflicts
	): Promise<void> {
		const folderEntityDump = await this.listPublicFolder({ folderId, maxDepth, includeRoot: true });
		const rootFolder = folderEntityDump[0];
		const rootFolderPath = rootFolder.path;
		const basePath = rootFolderPath.replace(/\/[^/]+$/, '');
		for (const entity of folderEntityDump) {
			const relativePath = entity.path.replace(new RegExp(`^${basePath}/`), '');
			const fullPath = joinPath(path, relativePath);
			if (entity.entityType === 'folder') {
				const proceedWriting = await proceedWritingFolder(fullPath, conflictResolutionStrategy);
				if (proceedWriting) {
					await mkdirPromise(fullPath);
				}
			} else if (entity.entityType === 'file') {
				await this.downloadPublicFile(entity.getEntity(), fullPath, conflictResolutionStrategy);
			} else {
				throw new Error(`Unsupported entity type: ${entity.entityType}`);
			}
		}
	}

	async downloadPublicFile(
		privateFile: ArFSPublicFile,
		path: string,
		conflictResolutionStrategy: FileNameConflictResolution = upsertOnConflicts
	): Promise<void> {
		const remoteFileLastModifiedDate = Math.ceil(+privateFile.lastModifiedDate / 1000);
		const proceedWriting = await proceedWritingFile(path, privateFile, conflictResolutionStrategy);
		if (proceedWriting) {
			const fileTxId = privateFile.dataTxId;
			const encryptedDataStream = await this.arFsDao.downloadFileData(fileTxId);
			const writeStream = createWriteStream(path);
			return pipelinePromise(encryptedDataStream, writeStream).finally(() => {
				// update the last-modified-date
				console.debug(`Updating the utimes for ${path}: ${remoteFileLastModifiedDate}`);
				return utimesPromise(path, Date.now(), remoteFileLastModifiedDate);
			});
		}
	}
}
