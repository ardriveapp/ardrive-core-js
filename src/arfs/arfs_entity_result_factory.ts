import {
	DriveID,
	FolderID,
	FileID,
	FileKey,
	TransactionID,
	Winston,
	CommunityTipSettings,
	SourceUri,
	EntityName,
	EntityID,
	DriveKey
} from '../types';
import { TurboCachesResponse } from './turbo';

export interface ArFSBundleWriteResult extends TurboCachesResponse {
	bundleTxId: TransactionID;
	bundleTxReward?: Winston;
	metaDataTxId: TransactionID;
}

export function isBundleResult(
	arFSResult: ArFSWriteResult | ArFSBundleWriteResult
): arFSResult is ArFSBundleWriteResult {
	return Object.keys(arFSResult).includes('bundleTxId');
}

export interface ArFSWriteResult extends TurboCachesResponse {
	metaDataTxId: TransactionID;
	metaDataTxReward?: Winston;
}

export interface ArFSUploadEntitiesResult {
	fileResults: FileResult[];
	folderResults: FolderResult[];
	bundleResults: BundleResult[];
}

export interface BaseArFSUploadResult extends TurboCachesResponse {
	entityName: EntityName;
	bundledIn?: TransactionID;
	sourceUri?: SourceUri;
	entityId: EntityID;
}

export interface FolderResult extends BaseArFSUploadResult {
	folderTxId: TransactionID;
	folderMetaDataReward?: Winston;
	driveKey?: DriveKey;
}

export interface FileResult extends BaseArFSUploadResult {
	fileDataTxId: TransactionID;
	metaDataTxId: TransactionID;
	fileDataReward?: Winston;
	fileMetaDataReward?: Winston;
	communityTipSettings?: CommunityTipSettings;
	fileKey?: FileKey;
}

export interface BundleResult {
	bundleTxId: TransactionID;
	bundleReward?: Winston;
	communityTipSettings?: CommunityTipSettings;
}

export interface ArFSDriveResult {
	rootFolderTxId: TransactionID;
	driveId: DriveID;
	rootFolderId: FolderID;
}
export type ArFSCreateBundledDriveResult = ArFSBundleWriteResult & ArFSDriveResult;
export type ArFSCreateDriveToTurboResult = Omit<ArFSCreateBundledDriveResult, 'bundleTxReward'>;
export interface ArFSCreateDriveResult extends ArFSWriteResult, ArFSDriveResult {
	rootFolderTxReward?: Winston;
}

export interface ArFSV2PublicRetryResult {
	fileDataReward: Winston;
	communityTipSettings: CommunityTipSettings;
	newMetaDataInfo?: NewFileMetaDataCreated;
}

export interface NewFileMetaDataCreated {
	fileId: FileID;
	metaDataTxId: TransactionID;
	fileMetaDataReward: Winston;
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

export type ArFSRenameEntityResult = ArFSWriteResult;

export interface ArFSRenameFileResult extends ArFSRenameEntityResult {
	entityId: FileID;
}

export interface ArFSRenameFolderResult extends ArFSRenameEntityResult {
	entityId: FolderID;
}

export interface ArFSRenameDriveResult extends ArFSRenameEntityResult {
	entityId: DriveID;
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

export type ArFSRenamePublicFileResult = ArFSRenameFileResult;
export type ArFSRenamePrivateFileResult = ArFSRenameFileResult & WithFileKey;

export type ArFSRenamePublicFolderResult = ArFSRenameFolderResult;
export type ArFSRenamePrivateFolderResult = ArFSRenameFolderResult & WithDriveKey;

export type ArFSRenamePublicDriveResult = ArFSRenameDriveResult;
export type ArFSRenamePrivateDriveResult = ArFSRenameDriveResult & WithDriveKey;

// Result factory function types
export type ArFSMoveEntityResultFactory<R extends ArFSMoveEntityResult> = (result: ArFSMoveEntityResult) => R;
