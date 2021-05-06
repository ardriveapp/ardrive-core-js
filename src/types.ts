import { JWKInterface } from 'arweave/node/lib/wallet';

type cipher = '' | 'aes-gcm-256' | 'AES256-GCM' | 'invalid';
type entityType = 'entityType' | 'file' | 'folder' | 'invalid';
type drivePrivacy = 'private' | 'public' | 'invalid';
type driveAuthMode = 'password' | 'invalid';
export interface Wallet {
	walletPrivateKey: JWKInterface;
	walletPublicKey: string;
}

export interface ArDriveUser {
	login: string;
	dataProtectionKey: string;
	walletPrivateKey: string;
	walletPublicKey: string;
	syncFolderPath: string;
	autoSyncApproval: number;
}

export interface UploadBatch {
	totalArDrivePrice: number;
	totalUSDPrice: number;
	totalSize: string;
	totalNumberOfFileUploads: number;
	totalNumberOfMetaDataUploads: number;
	totalNumberOfFolderUploads: number;
}

export interface ArFSRootFolderMetaData {
	metaDataTxId: string;
	cipher: cipher;
	cipherIV: string;
}

export interface ArDriveBundle {
	id: number;
	login: string;
	bundleTxId: string;
	bundleSyncStatus: number;
	uploadTime: number;
}

export interface ArFSDriveMetaData {
	id: number;
	login?: string;
	appName: string;
	appVersion: string;
	driveName: string;
	rootFolderId: string;
	cipher: cipher;
	cipherIV: string;
	unixTime: number;
	arFS: string;
	driveId: string;
	driveSharing?: string;
	drivePrivacy: drivePrivacy;
	driveAuthMode: driveAuthMode;
	metaDataTxId: string;
	metaDataSyncStatus: number;
	isLocal?: number;
}

export interface ArFSFileMetaData {
	id: number;
	login: string;
	appName: string;
	appVersion: string;
	unixTime: number;
	contentType: string;
	entityType: entityType;
	driveId: string;
	parentFolderId: string;
	fileId: string;
	fileSize: number;
	fileName: string;
	fileHash: string;
	filePath: string;
	fileVersion: number;
	cipher: cipher;
	dataCipherIV: string;
	metaDataCipherIV: string;
	lastModifiedDate: number;
	isLocal: number;
	isPublic: number;
	permaWebLink: string;
	metaDataTxId: string;
	dataTxId: string;
	fileDataSyncStatus: number;
	fileMetaDataSyncStatus: number;
	cloudOnly: number;
}

export interface ArFSEncryptedData {
	cipher: cipher;
	cipherIV: string;
	data: Buffer;
}

// Arweave GraphQL Interfaces
export interface GQLPageInfoInterface {
	hasNextPage: boolean;
}

export interface GQLOwnerInterface {
	address: string;
	key: string;
}

export interface GQLAmountInterface {
	winston: string;
	ar: string;
}

export interface GQLMetaDataInterface {
	size: number;
	type: string;
}

export interface GQLTagInterface {
	name: string;
	value: string;
}

export interface GQLBlockInterface {
	id: string;
	timestamp: number;
	height: number;
	previous: string;
}

export interface GQLNodeInterface {
	id: string;
	anchor: string;
	signature: string;
	recipient: string;
	owner: GQLOwnerInterface;
	fee: GQLAmountInterface;
	quantity: GQLAmountInterface;
	data: GQLMetaDataInterface;
	tags: GQLTagInterface[];
	block: GQLBlockInterface;
	parent: {
		id: string;
	};
}

export interface GQLEdgeInterface {
	cursor: string;
	node: GQLNodeInterface;
}

export interface GQLTransactionsResultInterface {
	pageInfo: GQLPageInfoInterface;
	edges: GQLEdgeInterface[];
}

export default interface GQLResultInterface {
	data: {
		transactions: GQLTransactionsResultInterface;
	};
}
