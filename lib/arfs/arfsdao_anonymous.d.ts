import Arweave from 'arweave';
import { DriveID, FolderID, FileID, AnyEntityID, ArweaveAddress } from '../types';
import { ArFSDriveEntity, ArFSPublicDrive, ArFSPublicFile, ArFSPublicFileOrFolderWithPaths, ArFSPublicFolder } from './arfs_entities';
import { PrivateKeyData } from './private_key_data';
export declare const graphQLURL = "https://arweave.net/graphql";
export interface ArFSAllPublicFoldersOfDriveParams {
    driveId: DriveID;
    owner: ArweaveAddress;
    latestRevisionsOnly: boolean;
}
export interface ArFSListPublicFolderParams {
    folderId: FolderID;
    maxDepth: number;
    includeRoot: boolean;
    owner: ArweaveAddress;
}
export declare abstract class ArFSDAOType {
    protected abstract readonly arweave: Arweave;
    protected abstract readonly appName: string;
    protected abstract readonly appVersion: string;
}
/**
 * Performs all ArFS spec operations that do NOT require a wallet for signing or decryption
 */
export declare class ArFSDAOAnonymous extends ArFSDAOType {
    protected readonly arweave: Arweave;
    protected appName: string;
    protected appVersion: string;
    constructor(arweave: Arweave, appName?: string, appVersion?: string);
    getOwnerForDriveId(driveId: DriveID): Promise<ArweaveAddress>;
    getDriveIDForEntityId(entityId: AnyEntityID, gqlTypeTag: 'File-Id' | 'Folder-Id'): Promise<DriveID>;
    getDriveOwnerForFolderId(folderId: FolderID): Promise<ArweaveAddress>;
    getDriveOwnerForFileId(fileId: FileID): Promise<ArweaveAddress>;
    getDriveIdForFileId(fileId: FileID): Promise<DriveID>;
    getDriveIdForFolderId(folderId: FolderID): Promise<DriveID>;
    getPublicDrive(driveId: DriveID, owner: ArweaveAddress): Promise<ArFSPublicDrive>;
    getPublicFolder(folderId: FolderID, owner: ArweaveAddress): Promise<ArFSPublicFolder>;
    getPublicFile(fileId: FileID, owner: ArweaveAddress): Promise<ArFSPublicFile>;
    getAllDrivesForAddress(address: ArweaveAddress, privateKeyData: PrivateKeyData, latestRevisionsOnly?: boolean): Promise<ArFSDriveEntity[]>;
    getPublicFilesWithParentFolderIds(folderIDs: FolderID[], owner: ArweaveAddress, latestRevisionsOnly?: boolean): Promise<ArFSPublicFile[]>;
    getAllFoldersOfPublicDrive({ driveId, owner, latestRevisionsOnly }: ArFSAllPublicFoldersOfDriveParams): Promise<ArFSPublicFolder[]>;
    /**
     * Lists the children of certain public folder
     * @param {FolderID} folderId the folder ID to list children of
     * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
     * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
     * @returns {ArFSPublicFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPublicFolder({ folderId, maxDepth, includeRoot, owner }: ArFSListPublicFolderParams): Promise<ArFSPublicFileOrFolderWithPaths[]>;
}
