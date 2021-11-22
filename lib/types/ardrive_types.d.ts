import { TransactionID, AnyEntityID, MakeOptional, ArweaveAddress, Winston, FolderID, DriveID, FileID } from '.';
import { WithDriveKey } from '../arfs/arfs_entity_result_factory';
import { ArFSFolderToUpload, ArFSFileToUpload } from '../arfs/arfs_file_wrapper';
import { PrivateDriveKeyData } from '../arfs/arfsdao';
import { ArFSListPublicFolderParams } from '../arfs/arfsdao_anonymous';
import { PrivateKeyData } from '../arfs/private_key_data';
export declare type ArFSEntityDataType = 'drive' | 'folder' | 'file';
export interface ArFSEntityData {
    type: ArFSEntityDataType;
    metadataTxId: TransactionID;
    dataTxId?: TransactionID;
    entityId: AnyEntityID;
    key?: string;
}
export declare type ListPublicFolderParams = MakeOptional<ArFSListPublicFolderParams, 'maxDepth' | 'includeRoot' | 'owner'>;
export declare type ListPrivateFolderParams = ListPublicFolderParams & WithDriveKey;
export interface TipData {
    txId: TransactionID;
    recipient: ArweaveAddress;
    winston: Winston;
}
export interface TipResult {
    tipData: TipData;
    reward: Winston;
}
export declare type ArFSFees = {
    [key: string]: Winston;
};
export interface ArFSResult {
    created: ArFSEntityData[];
    tips: TipData[];
    fees: ArFSFees;
}
export interface ArFSManifestResult extends ArFSResult {
    links: string[];
}
export declare const emptyArFSResult: ArFSResult;
export interface MetaDataBaseCosts {
    metaDataBaseReward: Winston;
}
export interface BulkFileBaseCosts extends MetaDataBaseCosts {
    fileDataBaseReward: Winston;
}
export interface FileUploadBaseCosts extends BulkFileBaseCosts {
    communityWinstonTip: Winston;
}
export interface DriveUploadBaseCosts {
    driveMetaDataBaseReward: Winston;
    rootFolderMetaDataBaseReward: Winston;
}
export interface RecursivePublicBulkUploadParams {
    parentFolderId: FolderID;
    wrappedFolder: ArFSFolderToUpload;
    driveId: DriveID;
    owner: ArweaveAddress;
    conflictResolution: FileNameConflictResolution;
}
export declare type RecursivePrivateBulkUploadParams = RecursivePublicBulkUploadParams & WithDriveKey;
export interface UploadPublicManifestParams {
    driveId?: DriveID;
    folderId?: FolderID;
    maxDepth?: number;
    destManifestName?: string;
}
export interface CreatePublicFolderParams {
    folderName: string;
    driveId: DriveID;
    parentFolderId: FolderID;
}
export declare type CreatePrivateFolderParams = CreatePublicFolderParams & WithDriveKey;
export declare const skipOnConflicts = "skip";
export declare const replaceOnConflicts = "replace";
export declare const upsertOnConflicts = "upsert";
export declare type FileNameConflictResolution = typeof skipOnConflicts | typeof replaceOnConflicts | typeof upsertOnConflicts;
export interface UploadParams {
    parentFolderId: FolderID;
    conflictResolution?: FileNameConflictResolution;
}
export interface BulkPublicUploadParams extends UploadParams {
    wrappedFolder: ArFSFolderToUpload;
    destParentFolderName?: string;
}
export declare type BulkPrivateUploadParams = BulkPublicUploadParams & WithDriveKey;
export interface UploadPublicFileParams extends UploadParams {
    wrappedFile: ArFSFileToUpload;
    destinationFileName?: string;
}
export declare type UploadPrivateFileParams = UploadPublicFileParams & WithDriveKey;
export interface CommunityTipParams {
    communityWinstonTip: Winston;
    assertBalance?: boolean;
}
interface MoveParams {
    newParentFolderId: FolderID;
}
export interface MovePublicFileParams extends MoveParams {
    fileId: FileID;
}
export declare type MovePrivateFileParams = MovePublicFileParams & WithDriveKey;
export interface MovePublicFolderParams extends MoveParams {
    folderId: FolderID;
}
export declare type MovePrivateFolderParams = MovePublicFolderParams & WithDriveKey;
export interface CreatePublicDriveParams {
    driveName: string;
}
export interface CreatePrivateDriveParams extends CreatePublicDriveParams {
    newPrivateDriveData: PrivateDriveKeyData;
}
interface GetEntityParams {
    owner?: ArweaveAddress;
}
export interface GetPublicDriveParams extends GetEntityParams {
    driveId: DriveID;
}
export declare type GetPrivateDriveParams = GetPublicDriveParams & WithDriveKey;
export interface GetPublicFolderParams extends GetEntityParams {
    folderId: FolderID;
}
export declare type GetPrivateFolderParams = GetPublicFolderParams & WithDriveKey;
export interface GetPublicFileParams extends GetEntityParams {
    fileId: FileID;
}
export declare type GetPrivateFileParams = GetPublicFileParams & WithDriveKey;
export interface GetAllDrivesForAddressParams {
    address: ArweaveAddress;
    privateKeyData: PrivateKeyData;
}
export interface ManifestPathMap {
    [index: string]: {
        id: string;
    };
}
export interface Manifest {
    manifest: 'arweave/paths';
    version: '0.1.0';
    index?: {
        path: string;
    };
    paths: ManifestPathMap;
}
export {};
