import { DataItem } from 'arbundles';
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
	ArFSEntityToUpload,
	WithDriveKey,
	ArFSFileDataPrototype,
	ArFSFileMetaDataPrototype
} from '../exports';
import { CreateDriveRewardSettings, UploadFileRewardSettings } from './cost_estimator_types';
import { TransactionID } from './transaction_id';

/** Generic closure type that uses prepareArFSObjectTransaction (V2) or prepareArFSDataItem (bundle) */
export type PrepareArFSObject<T, U extends ArFSObjectMetadataPrototype> = (metaDataPrototype: U) => Promise<T>;

export interface ArFSPrepareFolderParams<T> {
	folderPrototypeFactory: (folderId: FolderID) => ArFSFolderMetaDataPrototype;
	prepareArFSObject: PrepareArFSObject<T, ArFSFolderMetaDataPrototype>;
}

export interface ArFSPrepareFileParams<T extends DataItem | Transaction> {
	wrappedFile: ArFSEntityToUpload;
	prepareArFSObject: PrepareArFSObject<T, ArFSFileMetaDataPrototype | ArFSFileDataPrototype>;
	dataPrototypeFactoryFn: (fileData: Buffer, fileId: FileID) => Promise<ArFSFileDataPrototype>;
	metadataTxDataFactoryFn: (fileId: FileID, dataTxId: TransactionID) => Promise<ArFSFileMetaDataPrototype>;
}

export interface ArFSPrepareDriveParams<T> {
	generateDriveIdFn: () => DriveID;
	drivePrototypeFactory: CreateDriveMetaDataFactory;
	rootFolderPrototypeFactory: (rootFolderId: FolderID, driveId: DriveID) => ArFSFolderMetaDataPrototype;
	prepareArFSObject: PrepareArFSObject<T, ArFSFolderMetaDataPrototype | ArFSDriveMetaDataPrototype>;
}

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

export interface ArFSPrepareFileResult<T> extends ArFSPrepareResult<T> {
	fileId: FileID;
}

export interface ArFSCreateFolderParams<T extends ArFSFolderTransactionData> {
	driveId: DriveID;
	rewardSettings: RewardSettings;
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
export interface ArFSMoveParams<O extends ArFSFileOrFolderEntity, T extends ArFSObjectTransactionData> {
	originalMetaData: O;
	newParentFolderId: FolderID;
	metaDataBaseReward: RewardSettings;
	transactionData: T;
}

export interface ArFSUploadPublicFileParams {
	parentFolderId: FolderID;
	wrappedFile: ArFSEntityToUpload;
	driveId: DriveID;
	rewardSettings: UploadFileRewardSettings;
}

export type ArFSUploadPrivateFileParams = ArFSUploadPublicFileParams & WithDriveKey;

export interface ArFSPrepareObjectParams {
	excludedTagNames?: string[];
	otherTags?: GQLTagInterface[];
}
export interface ArFSPrepareDataItemsParams extends ArFSPrepareObjectParams {
	objectMetaData: ArFSObjectMetadataPrototype;
}

export interface ArFSPrepareObjectTransactionParams extends ArFSPrepareDataItemsParams {
	rewardSettings: RewardSettings;
}
export interface ArFSPrepareObjectBundleParams extends Omit<ArFSPrepareObjectTransactionParams, 'objectMetaData'> {
	dataItems: DataItem[];
}

export interface ArFSListPublicFolderParams {
	folderId: FolderID;
	maxDepth: number;
	includeRoot: boolean;
	owner: ArweaveAddress;
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
