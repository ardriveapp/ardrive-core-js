import {
	ArFSPublicDrive,
	ArFSPublicFolder,
	ArFSPublicFile,
	ArFSDriveEntity,
	ArFSPublicFileOrFolderWithPaths,
	ArFSPrivateFile
} from './arfs/arfs_entities';
import { ArFSDAOType, ArFSDAOAnonymous } from './arfs/arfsdao_anonymous';
import { DriveID, ArweaveAddress, FolderID } from './types';
import {
	GetPublicDriveParams,
	GetPublicFolderParams,
	GetPublicFileParams,
	GetAllDrivesForAddressParams,
	ListPublicFolderParams
} from './types';
import { Duplex } from 'stream';
import { ArFSFolderToDownload } from './arfs/arfs_file_wrapper';

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
	 * Downloads the data of a public folder tree into certain existing folder in the local storage
	 * @param folderId - the ID of the folder to be download
	 * @param maxDepth - the max depht in the file hierarchy
	 * @param path - a path in local storage
	 * @param driveKey - the key of the drive the folder is contained in
	 * @param conflictResolutionStrategy - the conflicting-name resolution algorithm for conflicting file/folder in the local storage
	 * @returns {Promise<void>}
	 */
	async downloadPublicFolder(folderId: FolderID, maxDepth: number): Promise<ArFSFolderToDownload> {
		const folderEntityDump = await this.listPublicFolder({ folderId, maxDepth, includeRoot: true });
		const rootFolder = folderEntityDump[0];
		const folderToDownload = new ArFSFolderToDownload(this, rootFolder);
		folderToDownload.hidratate(folderEntityDump);
		return folderToDownload;
	}

	/**
	 * Downloads the data of a public file into certain existing folder in the local storage
	 * @param file - the file entity to be download
	 * @param path - a path in local storage
	 * @param conflictResolutionStrategy - the conflicting-name resolution algorithm for conflicting file/folder in the local storage
	 * @returns {Promise<void>}
	 */
	async getDataStream(file: ArFSPublicFile | ArFSPrivateFile): Promise<{ data: Duplex; length: number }> {
		const fileTxId = file.dataTxId;
		const { data, length } = await this.arFsDao.downloadFileData(fileTxId);
		return { data, length };
	}
}
