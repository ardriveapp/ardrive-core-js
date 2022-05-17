import {
	TransactionID,
	AnyEntityID,
	MakeOptional,
	ArweaveAddress,
	Winston,
	FolderID,
	DriveID,
	FileID,
	FileConflictPrompts,
	FileNameConflictResolution,
	FolderConflictPrompts,
	DriveKey
} from '.';
import { WithDriveKey } from '../arfs/arfs_entity_result_factory';
import { ArFSFolderToUpload, ArFSFileToUpload, ArFSDataToUpload } from '../arfs/arfs_file_wrapper';
import { PrivateDriveKeyData } from '../arfs/arfsdao';
import { PrivateKeyData } from '../arfs/private_key_data';
import { ArFSCreateFileMetaDataV2Plan, ArFSListPublicFolderParams } from './arfsdao_types';
import { EntityKey } from './entity_key';
import { EntityName, SourceUri } from './types';
import { CustomMetaDataTagInterface } from './gql_Types';

export type ArFSEntityDataType = 'drive' | 'folder' | 'file' | 'bundle';

export interface ArFSEntityData {
	type: ArFSEntityDataType;
	sourceUri?: SourceUri;
	entityName?: EntityName;
	bundleTxId?: TransactionID;
	metadataTxId?: TransactionID;
	bundledIn?: TransactionID;
	dataTxId?: TransactionID;
	entityId?: AnyEntityID;
	key?: EntityKey;
}

export type ListPublicFolderParams = MakeOptional<ArFSListPublicFolderParams, 'maxDepth' | 'includeRoot' | 'owner'>;
export type ListPrivateFolderParams = ListPublicFolderParams & WithDriveKey;

export interface TipData {
	txId: TransactionID;
	recipient: ArweaveAddress;
	winston: Winston;
}

export interface TipResult {
	tipData: TipData;
	reward: Winston;
}

export type ArFSFees = { [key: string]: Winston };

export interface ArFSResult {
	created: ArFSEntityData[];
	tips: TipData[];
	fees: ArFSFees;
}

export interface ArFSManifestResult extends ArFSResult {
	manifest: Manifest | Record<string, never>;
	links: string[];
}

export const emptyArFSResult: ArFSResult = {
	created: [],
	tips: [],
	fees: {}
};

export const emptyManifestResult: ArFSManifestResult = {
	...emptyArFSResult,
	manifest: {},
	links: []
};
export interface MetaDataBaseCosts {
	metaDataBaseReward: Winston;
}

export interface RecursivePublicBulkUploadParams {
	parentFolderId: FolderID;
	wrappedFolder: ArFSFolderToUpload;
	driveId: DriveID;
	owner: ArweaveAddress;
}
export type RecursivePrivateBulkUploadParams = RecursivePublicBulkUploadParams & WithDriveKey;

export interface UploadPublicManifestParams {
	folderId: FolderID;
	maxDepth?: number;
	destManifestName?: string;
	conflictResolution?: FileNameConflictResolution;
	prompts?: FileConflictPrompts;
}

export interface CreatePublicManifestParams extends Required<UploadPublicManifestParams> {
	driveId: DriveID;
	owner: ArweaveAddress;
}

export interface CreatePublicFolderParams {
	folderName: string;
	parentFolderId: FolderID;
	/** @deprecated ArFS cache makes passing driveId here redundant. This parameter makes the api confusing and will no longer used */
	driveId?: DriveID;
}
export type CreatePrivateFolderParams = CreatePublicFolderParams & WithDriveKey;

export interface UploadParams {
	parentFolderId: FolderID;
	conflictResolution?: FileNameConflictResolution;
}

/** Upload stats required for uploading entities with the ArDrive class */
export interface ArDriveUploadStats<T = ArFSDataToUpload | ArFSFolderToUpload> {
	wrappedEntity: T;
	destFolderId: FolderID;
	destName?: string;
	driveKey?: DriveKey;
}

/** Upload stats as determined by the ArDrive class */
export interface UploadStats<T = ArFSDataToUpload | ArFSFolderToUpload> extends ArDriveUploadStats<T> {
	destDriveId: DriveID;
	owner: ArweaveAddress;
}

export type FileUploadStats = UploadStats<ArFSDataToUpload> & { customMetaData: CustomMetaDataTagInterface[] };
export type FolderUploadStats = UploadStats<ArFSFolderToUpload>;

export interface UploadAllEntitiesParams {
	entitiesToUpload: ArDriveUploadStats[];
	conflictResolution?: FileNameConflictResolution;
	prompts?: FolderConflictPrompts;
}

export interface ResolveBulkConflictsParams extends UploadAllEntitiesParams {
	entitiesToUpload: UploadStats[];
	conflictResolution: FileNameConflictResolution;
}

export interface BulkPublicUploadParams extends UploadParams {
	wrappedFolder: ArFSFolderToUpload;
	parentFolderId: FolderID;
	prompts?: FolderConflictPrompts;
	destParentFolderName?: string;
}
export type BulkPrivateUploadParams = BulkPublicUploadParams & WithDriveKey;

export interface UploadPublicFileParams extends UploadParams {
	wrappedFile: ArFSFileToUpload;
	prompts?: FileConflictPrompts;
	destinationFileName?: string;
}
export type UploadPrivateFileParams = UploadPublicFileParams & WithDriveKey;

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
export type MovePrivateFileParams = MovePublicFileParams & WithDriveKey;

export interface MovePublicFolderParams extends MoveParams {
	folderId: FolderID;
}
export type MovePrivateFolderParams = MovePublicFolderParams & WithDriveKey;

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
export type GetPrivateDriveParams = GetPublicDriveParams & {
	withKeys?: boolean;
} & WithDriveKey;

export interface GetPublicFolderParams extends GetEntityParams {
	folderId: FolderID;
}
export type GetPrivateFolderParams = GetPublicFolderParams & {
	withKeys?: boolean;
} & WithDriveKey;

export interface GetPublicFileParams extends GetEntityParams {
	fileId: FileID;
}
export type GetPrivateFileParams = GetPublicFileParams & {
	withKeys?: boolean;
} & WithDriveKey;

export interface GetAllDrivesForAddressParams {
	address: ArweaveAddress;
	privateKeyData: PrivateKeyData;
}

// The manifest interfaces below are taken from arweave-deploy

// A path object is labeled by its path, file name
// and extension, and then an arweave transaction id
export interface ManifestPathMap {
	[index: string]: { id: string };
}
export interface Manifest {
	/** manifest must be 'arweave/paths' */
	manifest: 'arweave/paths';
	/** version must be 0.1.0 */
	version: '0.1.0';
	/** index contains the default path that will redirected when the user access the manifest transaction itself */
	index: {
		path: string;
	};
	/** paths is an object of path objects */
	paths: ManifestPathMap;
}

export interface DownloadPublicFileParameters {
	fileId: FileID;
	destFolderPath: string;
	defaultFileName?: string;
	// progressCB?: (pctTotal: number, pctFile: number, curFileName: string, curFilePath: string) => void
}

export type DownloadPrivateFileParameters = DownloadPublicFileParameters & WithDriveKey;

export interface DownloadPublicFolderParameters {
	folderId: FolderID;
	destFolderPath: string;
	customFolderName?: string;
	maxDepth: number;
	owner?: ArweaveAddress;
}

export type DownloadPrivateFolderParameters = DownloadPublicFolderParameters & WithDriveKey;

export interface DownloadPublicDriveParameters {
	driveId: DriveID;
	destFolderPath: string;
	customFolderName?: string;
	maxDepth: number;
	owner?: ArweaveAddress;
}

export type DownloadPrivateDriveParameters = DownloadPublicDriveParameters & WithDriveKey;

export interface RenamePublicFileParams {
	fileId: FileID;
	newName: string;
}

export type RenamePrivateFileParams = RenamePublicFileParams & WithDriveKey;

export interface RenamePublicFolderParams {
	folderId: FolderID;
	newName: string;
}

export type RenamePrivateFolderParams = RenamePublicFolderParams & WithDriveKey;

export interface RenamePublicDriveParams {
	driveId: DriveID;
	newName: string;
}

export type RenamePrivateDriveParams = RenamePublicDriveParams & WithDriveKey;

export interface BasePublicFileRetryParams {
	wrappedFile: ArFSFileToUpload;
	dataTxId: TransactionID;
}
export interface RetryPublicArFSFileByFileIdParams extends BasePublicFileRetryParams {
	fileId: FileID;
}

export interface RetryPublicArFSFileByDestFolderIdParams extends BasePublicFileRetryParams {
	conflictResolution?: FileNameConflictResolution;
	destinationFolderId: FolderID;
}

export interface RetryPublicArFSFileParams extends BasePublicFileRetryParams {
	createMetaDataPlan?: ArFSCreateFileMetaDataV2Plan;
	metaDataTxId?: TransactionID;
	fileId?: FileID;
}
