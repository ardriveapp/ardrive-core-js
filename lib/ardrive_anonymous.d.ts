import { ArFSPublicDrive, ArFSPublicFolder, ArFSPublicFile, ArFSDriveEntity, ArFSPublicFileOrFolderWithPaths } from './arfs/arfs_entities';
import { ArFSDAOType, ArFSDAOAnonymous } from './arfs/arfsdao_anonymous';
import { DriveID, ArweaveAddress } from './types';
import { GetPublicDriveParams, GetPublicFolderParams, GetPublicFileParams, GetAllDrivesForAddressParams, ListPublicFolderParams } from './types';
export declare abstract class ArDriveType {
    protected abstract readonly arFsDao: ArFSDAOType;
}
export declare class ArDriveAnonymous extends ArDriveType {
    protected readonly arFsDao: ArFSDAOAnonymous;
    constructor(arFsDao: ArFSDAOAnonymous);
    getOwnerForDriveId(driveId: DriveID): Promise<ArweaveAddress>;
    getPublicDrive({ driveId, owner }: GetPublicDriveParams): Promise<ArFSPublicDrive>;
    getPublicFolder({ folderId, owner }: GetPublicFolderParams): Promise<ArFSPublicFolder>;
    getPublicFile({ fileId, owner }: GetPublicFileParams): Promise<ArFSPublicFile>;
    getAllDrivesForAddress({ address, privateKeyData }: GetAllDrivesForAddressParams): Promise<ArFSDriveEntity[]>;
    /**
     * Lists the children of certain public folder
     * @param {FolderID} folderId the folder ID to list children of
     * @returns {ArFSPublicFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPublicFolder({ folderId, maxDepth, includeRoot, owner }: ListPublicFolderParams): Promise<ArFSPublicFileOrFolderWithPaths[]>;
}
