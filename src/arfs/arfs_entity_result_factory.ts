import { DriveID, FolderID, FileID, FileKey, DriveKey, TransactionID, Winston, CommunityTipSettings } from '../types';

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

export interface ArFSUploadEntitiesResult {
	fileResults: FileResult[];
	folderResults: FolderResult[];
	bundleResults: BundleResult[];
}

export interface FolderResult {
	folderTxId: TransactionID;
	folderId: FolderID;
	folderMetaDataReward?: Winston;
	driveKey?: DriveKey;
}

export interface FileResult {
	fileDataTxId: TransactionID;
	metaDataTxId: TransactionID;
	fileId: FileID;
	fileDataReward?: Winston;
	fileMetaDataReward?: Winston;
	communityTipSettings?: CommunityTipSettings;
	fileKey?: FileKey;
}

export interface BundleResult {
	bundleTxId: TransactionID;
	bundleReward: Winston;
	communityTipSettings?: CommunityTipSettings;
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

export interface ArFSFileResult {
	fileId: FileID;
	dataTxId: TransactionID;
}
export interface ArFSUploadFileV2TxResult extends ArFSWriteResult, ArFSFileResult {
	dataTxReward: Winston;
}
export type ArFSUploadBundledFileResult = ArFSBundleWriteResult & ArFSFileResult;
export type ArFSUploadFileResult = ArFSUploadFileV2TxResult | ArFSUploadBundledFileResult;

export interface ArFSCreateFolderResult extends ArFSWriteResult {
	folderId: FolderID;
}

export type ArFSMoveEntityResult = ArFSWriteResult;

export interface ArFSMoveFileResult extends ArFSMoveEntityResult {
	dataTxId: TransactionID;
}

export type WithDriveKey = { driveKey: DriveKey };
export type WithFileKey = { fileKey: FileKey };

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

export type ArFSMoveEntityResultFactory<R extends ArFSMoveEntityResult> = (result: ArFSMoveEntityResult) => R;
