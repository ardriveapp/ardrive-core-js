import { ArFSFileMetadataTransactionData } from './arfs_tx_data_types';
import { DriveID, FolderID, FileID, FileKey, DriveKey, TransactionID, Winston, EntityType } from '../types';

export interface ArFSBundleWriteResult {
	bundleTxId: TransactionID;
	bundleTxReward: Winston;
	metaDataTxId: TransactionID;
}

export function isBundleResult(
	arFSResult: ArFSWriteResult | ArFSBundleWriteResult
): arFSResult is ArFSBundleWriteResult {
	return Object.keys(arFSResult).includes('bundleTxId');
}

export interface ArFSWriteResult {
	metaDataTxId: TransactionID;
	metaDataTxReward: Winston;
}

export interface ArFSDriveResult {
	rootFolderTxId: TransactionID;
	driveId: DriveID;
	rootFolderId: FolderID;
}

export type ArFSCreateBundledDriveResult = ArFSBundleWriteResult & ArFSDriveResult;

export interface ArFSCreateDriveResult extends ArFSWriteResult, ArFSDriveResult {
	rootFolderTxReward: Winston;
}

export interface ArFSCreateFolderResult extends ArFSWriteResult {
	folderId: FolderID;
}

export interface ArFSUploadFileResult extends ArFSWriteResult {
	dataTxId: TransactionID;
	dataTxReward: Winston;
	fileId: FileID;
}

export type ArFSMoveEntityResult = ArFSWriteResult;

export interface ArFSMoveFileResult extends ArFSMoveEntityResult {
	dataTxId: TransactionID;
}

export type ArFSRenameEntityResult = ArFSWriteResult;

export interface ArFSRenameFileResult extends ArFSRenameEntityResult {
	type: EntityType;
	entityId: FileID;
}

export type WithDriveKey = { driveKey: DriveKey };
type WithFileKey = { fileKey: FileKey };

export type ArFSCreatePublicDriveResult = ArFSCreateDriveResult;
export type ArFSCreatePrivateDriveResult = ArFSCreateDriveResult & WithDriveKey;

export type ArFSCreatePublicBundledDriveResult = ArFSCreateBundledDriveResult;
export type ArFSCreatePrivateBundledDriveResult = ArFSCreateBundledDriveResult & WithDriveKey;

export type ArFSCreatePublicFolderResult = ArFSCreateFolderResult;
export type ArFSCreatePrivateFolderResult = ArFSCreateFolderResult & WithDriveKey;

export type ArFSUploadPublicFileResult = ArFSUploadFileResult;
export type ArFSUploadPrivateFileResult = ArFSUploadFileResult & WithFileKey;

export type ArFSMovePublicFolderResult = ArFSMoveEntityResult;
export type ArFSMovePrivateFolderResult = ArFSMoveEntityResult & WithDriveKey;

export type ArFSMovePublicFileResult = ArFSMoveFileResult;
export type ArFSMovePrivateFileResult = ArFSMoveFileResult & WithFileKey;

export type ArFSRenamePublicFileResult = ArFSRenameFileResult;
export type ArFSRenamePrivateFileResult = ArFSRenameFileResult & WithFileKey;

// Result factory function types
export type ArFSMoveEntityResultFactory<R extends ArFSMoveEntityResult> = (result: ArFSMoveEntityResult) => R;
export type ArFSCreateDriveResultFactory<R extends ArFSCreateDriveResult> = (result: ArFSCreateDriveResult) => R;
export type ArFSCreateFolderResultFactory<R extends ArFSCreateFolderResult> = (result: ArFSCreateFolderResult) => R;
export type ArFSUploadFileResultFactory<R extends ArFSUploadFileResult, D extends ArFSFileMetadataTransactionData> = (
	result: ArFSUploadFileResult,
	txData: D
) => R;
