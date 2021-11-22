import { ArFSFileMetadataTransactionData } from './arfs_trx_data_types';
import { DriveID, FolderID, FileID, FileKey, DriveKey, TransactionID, Winston } from '../types';
export interface ArFSWriteResult {
    metaDataTrxId: TransactionID;
    metaDataTrxReward: Winston;
}
export interface ArFSCreateDriveResult extends ArFSWriteResult {
    rootFolderTrxId: TransactionID;
    rootFolderTrxReward: Winston;
    driveId: DriveID;
    rootFolderId: FolderID;
}
export interface ArFSCreateFolderResult extends ArFSWriteResult {
    folderId: FolderID;
}
export interface ArFSUploadFileResult extends ArFSWriteResult {
    dataTrxId: TransactionID;
    dataTrxReward: Winston;
    fileId: FileID;
}
export declare type ArFSMoveEntityResult = ArFSWriteResult;
export interface ArFSMoveFileResult extends ArFSMoveEntityResult {
    dataTrxId: TransactionID;
}
export declare type WithDriveKey = {
    driveKey: DriveKey;
};
declare type WithFileKey = {
    fileKey: FileKey;
};
export declare type ArFSCreatePublicDriveResult = ArFSCreateDriveResult;
export declare type ArFSCreatePrivateDriveResult = ArFSCreateDriveResult & WithDriveKey;
export declare type ArFSCreatePublicFolderResult = ArFSCreateFolderResult;
export declare type ArFSCreatePrivateFolderResult = ArFSCreateFolderResult & WithDriveKey;
export declare type ArFSUploadPublicFileResult = ArFSUploadFileResult;
export declare type ArFSUploadPrivateFileResult = ArFSUploadFileResult & WithFileKey;
export declare type ArFSMovePublicFolderResult = ArFSMoveEntityResult;
export declare type ArFSMovePrivateFolderResult = ArFSMoveEntityResult & WithDriveKey;
export declare type ArFSMovePublicFileResult = ArFSMoveFileResult;
export declare type ArFSMovePrivateFileResult = ArFSMoveFileResult & WithFileKey;
export declare type ArFSMoveEntityResultFactory<R extends ArFSMoveEntityResult> = (result: ArFSMoveEntityResult) => R;
export declare type ArFSCreateDriveResultFactory<R extends ArFSCreateDriveResult> = (result: ArFSCreateDriveResult) => R;
export declare type ArFSCreateFolderResultFactory<R extends ArFSCreateFolderResult> = (result: ArFSCreateFolderResult) => R;
export declare type ArFSUploadFileResultFactory<R extends ArFSUploadFileResult, D extends ArFSFileMetadataTransactionData> = (result: ArFSUploadFileResult, trxData: D) => R;
export {};
