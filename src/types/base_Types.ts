import { OrInvalid } from './type_conditionals';
import {
	AES256_GCM,
	cipherType,
	contentType,
	driveAuthMode,
	drivePrivacy,
	driveSharing,
	entityType,
	invalid,
	syncStatus,
	yesNoInteger
} from './type_guards';

export interface IDriveUser {
	login?: string;
	dataProtectionKey?: string;
	walletPrivateKey?: string;
	walletPublicKey?: string;
	syncFolderPath?: string;
	autoSyncApproval?: yesNoInteger;
}

export interface UploadBatch {
	totalArDrivePrice: number;
	totalUSDPrice: number;
	totalSize: string;
	totalNumberOfFileUploads: number;
	totalNumberOfMetaDataUploads: number;
	totalNumberOfFolderUploads: number;
}

export interface IRootFolderMetaData {
	metaDataTxId?: string;
	cipher?: cipherType;
	cipherIV?: string;
}

export interface ArDriveBundle {
	id: number;
	login: string;
	bundleTxId: string;
	bundleSyncStatus: number;
	uploadTime: number;
}

export interface IDriveMetaData {
	id?: number;
	login?: string;
	appName?: string;
	appVersion?: string;
	driveName?: string;
	rootFolderId?: string;
	cipher?: cipherType;
	cipherIV?: string;
	unixTime?: number;
	arFS?: string;
	driveId?: string;
	driveSharing?: driveSharing;
	drivePrivacy?: drivePrivacy;
	driveAuthMode?: driveAuthMode;
	metaDataTxId?: string;
	metaDataSyncStatus?: number;
	isLocal?: number;
}

export class ArDriveUser implements IDriveUser {
	login: string = invalid;
	dataProtectionKey: string = invalid;
	walletPrivateKey: string = invalid;
	walletPublicKey: string = invalid;
	syncFolderPath: string = invalid;
	autoSyncApproval = 0;

	constructor(args: IDriveUser = {}) {
		Object.assign(this, args);
	}
}

export class ArFSRootFolderMetaData implements IRootFolderMetaData {
	metaDataTxId: string = invalid;
	cipher: cipherType = AES256_GCM;
	cipherIV: string = invalid;

	constructor(args: IRootFolderMetaData = {}) {
		Object.assign(this, args);
	}
}

export class ArFSDriveMetaData implements IDriveMetaData {
	id = 0;
	login?: string;
	appName: string = invalid;
	appVersion: string = invalid;
	driveName: string = invalid;
	rootFolderId: string = invalid;
	cipher: cipherType = AES256_GCM;
	cipherIV: string = invalid;
	unixTime = 0;
	arFS: string = invalid;
	driveId: string = invalid;
	driveSharing?: driveSharing;
	drivePrivacy: drivePrivacy = drivePrivacy.PRIVATE;
	driveAuthMode?: driveAuthMode;
	metaDataTxId: string = invalid;
	metaDataSyncStatus = 0;
	isLocal?: number = 0;

	constructor(args: IDriveMetaData) {
		Object.assign(this, args);
	}
}

export interface IFileMetaData {
	id?: number;
	login: string;
	appName: string;
	appVersion: string;
	unixTime?: number;
	contentType?: string;
	entityType: entityType;
	driveId: string;
	parentFolderId: string;
	fileId?: string;
	fileSize?: number;
	fileName?: string;
	fileHash?: string;
	filePath?: string;
	fileVersion: number;
	cipher?: cipherType;
	dataCipherIV?: string;
	metaDataCipherIV?: string;
	lastModifiedDate?: number;
	isLocal: yesNoInteger;
	isPublic: yesNoInteger;
	permaWebLink?: string;
	metaDataTxId?: string;
	dataTxId?: string;
	fileDataSyncStatus: syncStatus;
	fileMetaDataSyncStatus: syncStatus;
	cloudOnly: yesNoInteger;
}
export class ArFSFileMetaData implements IFileMetaData {
	id = 0;
	login: string = invalid;
	appName: string = invalid;
	appVersion: string = invalid;
	unixTime = 0;
	contentType: contentType = contentType.APPLICATION_JSON;
	entityType: entityType.FILE = entityType.FILE;
	driveId: string = invalid;
	parentFolderId: string = invalid;
	fileId: string = invalid;
	fileSize = 0;
	fileName: string = invalid;
	fileHash: string = invalid;
	filePath: string = invalid;
	fileVersion = 0;
	cipher: cipherType = AES256_GCM;
	dataCipherIV: string = invalid;
	metaDataCipherIV: string = invalid;
	lastModifiedDate = 0;
	isLocal: yesNoInteger = yesNoInteger.NO;
	isPublic: yesNoInteger = yesNoInteger.NO;
	permaWebLink: string = invalid;
	metaDataTxId: string = invalid;
	dataTxId: string = invalid;
	fileDataSyncStatus: syncStatus = syncStatus.READY_TO_DOWNLOAD;
	fileMetaDataSyncStatus: syncStatus = syncStatus.READY_TO_DOWNLOAD;
	cloudOnly: yesNoInteger = yesNoInteger.NO;

	constructor(args: IFileMetaData) {
		Object.assign(this, args);
	}
}

export interface ArFSEncryptedData {
	cipher: cipherType;
	cipherIV: string;
	data: Buffer;
}
