import { DataItem } from '@dha-team/arbundles';
import Transaction from 'arweave/node/lib/transaction';
import { FolderID, DriveID, RewardSettings, GQLTagInterface, FileID, ArweaveAddress } from '.';
import {
	ArFSObjectMetadataPrototype,
	CreateDriveMetaDataFactory,
	ArFSFolderMetaDataPrototype,
	ArFSDriveMetaDataPrototype,
	ArFSFolderTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPrivateFolderTransactionData,
	PrivateDriveKeyData,
	ArFSFileOrFolderEntity,
	ArFSObjectTransactionData,
	ArFSDataToUpload,
	WithDriveKey,
	ArFSPublicFile,
	ArFSPrivateFile,
	ArFSFileDataPrototype,
	ArFSFileMetaDataPrototype,
	FileKey,
	DriveKey,
	FolderHierarchy,
	ArFSPublicFolder,
	ArFSPrivateFolder,
	ArFSPublicDrive,
	ArFSPrivateDrive,
	ArFSPrivateFileWithPaths,
	ArFSPrivateFolderWithPaths,
	ArFSFileToUpload
} from '../exports';
import { CreateDriveRewardSettings, UploadFileRewardSettings } from './upload_planner_types';
import { TransactionID } from './transaction_id';
import { Winston } from './winston';

/** Generic closure type that uses prepareArFSObjectTransaction (V2) or prepareArFSDataItem (bundle) */
export type PrepareArFSObject<T, U extends ArFSObjectMetadataPrototype> = (metaDataPrototype: U) => Promise<T>;

export interface ArFSPrepareFolderParams<T> {
	folderPrototypeFactory: (folderId: FolderID) => ArFSFolderMetaDataPrototype;
	prepareArFSObject: PrepareArFSObject<T, ArFSFolderMetaDataPrototype>;
}

export interface PartialPrepareFileParams {
	wrappedFile: ArFSDataToUpload;
	dataPrototypeFactoryFn: (fileData: Buffer, fileId: FileID) => Promise<ArFSFileDataPrototype>;
	metadataTxDataFactoryFn: (fileId: FileID, dataTxId: TransactionID) => Promise<ArFSFileMetaDataPrototype>;
}

export interface ArFSPrepareFileParams<T = DataItem | Transaction, U = DataItem | Transaction>
	extends PartialPrepareFileParams {
	prepareArFSObject: PrepareArFSObject<T, ArFSFileDataPrototype>;
	prepareMetaDataArFSObject: PrepareArFSObject<U, ArFSFileMetaDataPrototype>;
}

export interface PartialPrepareDriveParams {
	generateDriveIdFn: () => DriveID;
	drivePrototypeFactory: CreateDriveMetaDataFactory;
	rootFolderPrototypeFactory: (rootFolderId: FolderID, driveId: DriveID) => ArFSFolderMetaDataPrototype;
}

export interface ArFSPrepareDriveParams<T> extends PartialPrepareDriveParams {
	prepareArFSObject: PrepareArFSObject<T, ArFSFolderMetaDataPrototype | ArFSDriveMetaDataPrototype>;
}

export type ArFSFolderPrototypeFactory = (folderId: FolderID) => ArFSFolderMetaDataPrototype;

export interface ArFSPrepareResult<T> {
	arFSObjects: T[];
}

export interface ArFSPrepareFolderResult<T> extends ArFSPrepareResult<T> {
	folderId: FolderID;
}

export interface ArFSPrepareDriveResult<T> extends ArFSPrepareResult<T> {
	rootFolderId: FolderID;
	driveId: DriveID;
}

export interface ArFSPrepareFileResult<T, U> {
	fileId: FileID;
	fileKey?: FileKey;
	arFSObjects: [T, U];
}

export interface ArFSCreateFolderParams<T extends ArFSFolderTransactionData> {
	driveId: DriveID;
	rewardSettings?: RewardSettings;
	parentFolderId: FolderID;
	folderData: T;
}
export type ArFSPublicCreateFolderParams = ArFSCreateFolderParams<ArFSPublicFolderTransactionData>;
export type ArFSPrivateCreateFolderParams = ArFSCreateFolderParams<ArFSPrivateFolderTransactionData>;

export interface ArFSCreatePublicDriveParams {
	driveName: string;
	rewardSettings: CreateDriveRewardSettings;
}
export interface ArFSCreatePrivateDriveParams extends ArFSCreatePublicDriveParams {
	newDriveData: PrivateDriveKeyData;
}

/** Generic result type for bundled and v2 transactions */
export type ArFSTxResult<R> = {
	result: R;
	transactions: Transaction[];
};

/** Generic parameters for move file and move folder ArFSDAO methods */
export interface ArFSMoveParams<
	O extends ArFSFileOrFolderEntity<'file' | 'folder'>,
	T extends ArFSObjectTransactionData
> {
	originalMetaData: O;
	newParentFolderId: FolderID;
	metaDataBaseReward?: RewardSettings;
	transactionData: T;
}

export interface ArFSUploadPublicFileParams {
	parentFolderId: FolderID;
	wrappedFile: ArFSDataToUpload;
	driveId: DriveID;
	rewardSettings: UploadFileRewardSettings;
	communityTipSettings?: CommunityTipSettings;
}

export type ArFSUploadPrivateFileParams = ArFSUploadPublicFileParams & WithDriveKey;

/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead  */
export interface ArFSPrepareObjectParams {
	/** @deprecated -- Field no longer fully respected. Provide ['ArFS'] to designate File Data transactions */
	excludedTagNames?: string[];
	/** @deprecated -- This field no longer used */
	otherTags?: GQLTagInterface[];
}
/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead  */
export interface ArFSPrepareDataItemsParams extends ArFSPrepareObjectParams {
	objectMetaData: ArFSObjectMetadataPrototype;
}

/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead  */
export interface ArFSPrepareObjectTransactionParams extends ArFSPrepareDataItemsParams {
	rewardSettings: RewardSettings;
	communityTipSettings?: CommunityTipSettings;
}
/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead  */
export interface ArFSPrepareObjectBundleParams extends Omit<ArFSPrepareObjectTransactionParams, 'objectMetaData'> {
	dataItems: DataItem[];
}

export interface ArFSListPublicFolderParams {
	folderId: FolderID;
	maxDepth: number;
	includeRoot: boolean;
	owner: ArweaveAddress;
	withKeys?: boolean;
	withPathsFactory?: (
		entity: ArFSPrivateFile | ArFSPrivateFolder,
		hierarchy: FolderHierarchy,
		driveKey: DriveKey
	) => ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths;
}
export type ArFSListPrivateFolderParams = ArFSListPublicFolderParams & WithDriveKey;

export interface ArFSAllPublicFoldersOfDriveParams {
	driveId: DriveID;
	owner: ArweaveAddress;
	latestRevisionsOnly: boolean;
}
export type ArFSAllPrivateFoldersOfDriveParams = ArFSAllPublicFoldersOfDriveParams & WithDriveKey;

export interface ArFSGetPublicChildFolderIdsParams {
	folderId: FolderID;
	driveId: DriveID;
	owner: ArweaveAddress;
}
export type ArFSGetPrivateChildFolderIdsParams = ArFSGetPublicChildFolderIdsParams & WithDriveKey;

export interface ArFSRenameParams {
	newName: string;
	metadataRewardSettings?: RewardSettings;
}

export interface ArFSRenamePublicFileParams extends ArFSRenameParams {
	file: ArFSPublicFile;
}
export type ArFSRenamePrivateFileParams = ArFSRenamePublicFileParams &
	WithDriveKey & {
		file: ArFSPrivateFile;
	};

export interface ArFSRenamePublicFolderParams extends ArFSRenameParams {
	folder: ArFSPublicFolder;
}
export type ArFSRenamePrivateFolderParams = ArFSRenamePublicFolderParams &
	WithDriveKey & {
		folder: ArFSPrivateFolder;
	};

export interface ArFSRenamePublicDriveParams extends ArFSRenameParams {
	drive: ArFSPublicDrive;
}
export type ArFSRenamePrivateDriveParams = ArFSRenamePublicDriveParams &
	WithDriveKey & {
		drive: ArFSPrivateDrive;
	};

export type CommunityTipSettings = {
	communityTipTarget: ArweaveAddress;
	communityWinstonTip: Winston;
};
export interface ArFSDownloadPublicFolderParams {
	folderId: FolderID;
	destFolderPath: string;
	customFolderName?: string;
	maxDepth: number;
	owner: ArweaveAddress;
}

export interface ArFSDownloadPrivateFolderParams {
	folderId: FolderID;
	destFolderPath: string;
	customFolderName?: string;
	maxDepth: number;
	owner: ArweaveAddress;
	driveKey: DriveKey;
}

export interface SeparatedFolderHierarchy<FileType, FolderType> {
	hierarchy: FolderHierarchy;
	childFiles: FileType[];
	childFolders: FolderType[];
}

export interface ArFSRetryPublicFileUploadParams {
	wrappedFile: ArFSFileToUpload;
	arFSDataTxId: TransactionID;
	createMetaDataPlan?: ArFSCreateFileMetaDataV2Plan;
}

export interface ArFSCreateFileMetaDataV2Plan {
	rewardSettings: RewardSettings;
	destinationFolderId: FolderID;
	// File ID will be defined here for revision retries
	fileId?: FileID;
}
