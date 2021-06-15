import {
	CipherType,
	cipherTypeValues,
	ContentType,
	contentTypeValues,
	DriveAuthMode,
	DrivePrivacy,
	drivePrivacyValues,
	DriveSharing,
	EntityType,
	entityTypeValues,
	SyncStatus,
	syncStatusValues,
	YesNoInteger,
	yesNoIntegerValues
} from './type_guards';

export interface IDriveUser {
	login?: string;
	dataProtectionKey?: string;
	walletPrivateKey?: string;
	walletPublicKey?: string;
	syncFolderPath?: string;
	autoSyncApproval?: YesNoInteger;
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
	cipher?: CipherType;
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
	cipher?: CipherType;
	cipherIV?: string;
	unixTime?: number;
	arFS?: string;
	driveId?: string;
	driveSharing?: DriveSharing;
	drivePrivacy?: DrivePrivacy;
	driveAuthMode?: DriveAuthMode;
	metaDataTxId?: string;
	metaDataSyncStatus?: number;
	isLocal?: number;
}

export class ArDriveUser implements IDriveUser {
	login = '';
	dataProtectionKey = '';
	walletPrivateKey = '';
	walletPublicKey = '';
	syncFolderPath = '';
	autoSyncApproval: YesNoInteger = 0;

	constructor(args: IDriveUser = {}) {
		Object.assign(this, args);
	}
}

export class ArFSRootFolderMetaData implements IRootFolderMetaData {
	metaDataTxId = '';
	cipher: CipherType = cipherTypeValues.AES_256_GCM;
	cipherIV = '';

	constructor(args: IRootFolderMetaData = {}) {
		Object.assign(this, args);
	}
}

export class ArFSDriveMetaData implements IDriveMetaData {
	id = 0;
	login = '';
	appName = '';
	appVersion = '';
	driveName = '';
	rootFolderId = '';
	cipher: CipherType = cipherTypeValues.AES_256_GCM;
	cipherIV = '';
	unixTime = 0;
	arFS = '';
	driveId = '';
	driveSharing?: DriveSharing;
	drivePrivacy: DrivePrivacy = drivePrivacyValues.PRIVATE;
	driveAuthMode?: DriveAuthMode;
	metaDataTxId = '';
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
	contentType?: ContentType;
	entityType: EntityType;
	driveId: string;
	parentFolderId: string;
	fileId?: string;
	fileSize?: number;
	fileName?: string;
	fileHash?: string;
	filePath?: string;
	fileVersion: number;
	cipher?: CipherType;
	dataCipherIV?: string;
	metaDataCipherIV?: string;
	lastModifiedDate?: number;
	isLocal: YesNoInteger;
	isPublic: YesNoInteger;
	permaWebLink?: string;
	metaDataTxId?: string;
	dataTxId?: string;
	fileDataSyncStatus: SyncStatus;
	fileMetaDataSyncStatus: SyncStatus;
	cloudOnly: YesNoInteger;
}
export class ArFSFileMetaData implements IFileMetaData {
	id = 0;
	login = '';
	appName = '';
	appVersion = '';
	unixTime = 0;
	contentType: ContentType = contentTypeValues.APPLICATION_JSON;
	entityType: EntityType = entityTypeValues.FILE;
	driveId = '';
	parentFolderId = '';
	fileId = '';
	fileSize = 0;
	fileName = '';
	fileHash = '';
	filePath = '';
	fileVersion = 0;
	cipher: CipherType = cipherTypeValues.AES_256_GCM;
	dataCipherIV = '';
	metaDataCipherIV = '';
	lastModifiedDate = 0;
	isLocal: YesNoInteger = yesNoIntegerValues.NO;
	isPublic: YesNoInteger = yesNoIntegerValues.NO;
	permaWebLink = '';
	metaDataTxId = '';
	dataTxId = '';
	fileDataSyncStatus: SyncStatus = syncStatusValues.READY_TO_DOWNLOAD;
	fileMetaDataSyncStatus: SyncStatus = syncStatusValues.READY_TO_DOWNLOAD;
	cloudOnly: YesNoInteger = yesNoIntegerValues.NO;

	constructor(args: IFileMetaData) {
		Object.assign(this, args);
	}
}

export interface ArFSEncryptedData {
	cipher: CipherType;
	cipherIV: string;
	data: Buffer;
}
