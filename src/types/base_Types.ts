import {
	AES256_GCM,
	cipherType,
	contentType,
	driveAuthMode,
	drivePrivacy,
	driveSharing,
	entityType,
	emptyString,
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
	login: string = emptyString;
	dataProtectionKey: string = emptyString;
	walletPrivateKey: string = emptyString;
	walletPublicKey: string = emptyString;
	syncFolderPath: string = emptyString;
	autoSyncApproval = 0;

	constructor(args: IDriveUser = {}) {
		Object.assign(this, args);
	}
}

export class ArFSRootFolderMetaData implements IRootFolderMetaData {
	metaDataTxId: string = emptyString;
	cipher: cipherType = AES256_GCM;
	cipherIV: string = emptyString;

	constructor(args: IRootFolderMetaData = {}) {
		Object.assign(this, args);
	}
}

export class ArFSDriveMetaData implements IDriveMetaData {
	id = 0;
	login: string = emptyString;
	appName: string = emptyString;
	appVersion: string = emptyString;
	driveName: string = emptyString;
	rootFolderId: string = emptyString;
	cipher: cipherType = AES256_GCM;
	cipherIV: string = emptyString;
	unixTime = 0;
	arFS: string = emptyString;
	driveId: string = emptyString;
	driveSharing?: driveSharing;
	drivePrivacy: drivePrivacy = drivePrivacy.PRIVATE;
	driveAuthMode?: driveAuthMode;
	metaDataTxId: string = emptyString;
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
	contentType?: contentType;
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
	login: string = emptyString;
	appName: string = emptyString;
	appVersion: string = emptyString;
	unixTime = 0;
	contentType: contentType = contentType.APPLICATION_JSON;
	entityType: entityType = entityType.FILE;
	driveId: string = emptyString;
	parentFolderId: string = emptyString;
	fileId: string = emptyString;
	fileSize = 0;
	fileName: string = emptyString;
	fileHash: string = emptyString;
	filePath: string = emptyString;
	fileVersion = 0;
	cipher: cipherType = AES256_GCM;
	dataCipherIV: string = emptyString;
	metaDataCipherIV: string = emptyString;
	lastModifiedDate = 0;
	isLocal: yesNoInteger = yesNoInteger.NO;
	isPublic: yesNoInteger = yesNoInteger.NO;
	permaWebLink: string = emptyString;
	metaDataTxId: string = emptyString;
	dataTxId: string = emptyString;
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
