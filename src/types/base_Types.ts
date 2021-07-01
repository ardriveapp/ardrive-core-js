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

export type IDriveUser = Partial<ArDriveUser>;

export interface UploadBatch {
	totalArDrivePrice: number;
	totalUSDPrice: number;
	totalSize: string;
	totalNumberOfFileUploads: number;
	totalNumberOfMetaDataUploads: number;
	totalNumberOfFolderUploads: number;
}

export type IRootFolderMetaData = Partial<ArFSRootFolderMetaData>;

export interface ArDriveBundle {
	id: number;
	login: string;
	bundleTxId: string;
	bundleSyncStatus: number;
	uploadTime: number;
}

export type IDriveMetaData = Partial<ArFSDriveMetaData>;

export class ArDriveUser {
	login: string = this.template.login || '';
	dataProtectionKey: string = this.template.dataProtectionKey || '';
	walletPrivateKey: string = this.template.walletPrivateKey || '';
	walletPublicKey: string = this.template.walletPublicKey || '';
	syncFolderPath: string = this.template.syncFolderPath || '';
	autoSyncApproval: YesNoInteger = this.template.autoSyncApproval || 0;

	constructor(protected readonly template: IDriveUser = {}) {
		this.autoSyncApproval = Number(this.autoSyncApproval) as YesNoInteger;
	}
}

export class ArFSRootFolderMetaData {
	metaDataTxId: string = this.template.metaDataTxId || '';
	cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM;
	cipherIV: string = this.template.cipherIV || '';

	constructor(protected readonly template: IRootFolderMetaData = {}) {}
}

export class ArFSDriveMetaData {
	id: number = this.template.id || 0;
	login: string = this.template.login || '';
	appName: string = this.template.appName || '';
	appVersion: string = this.template.appVersion || '';
	driveName: string = this.template.driveName || '';
	rootFolderId: string = this.template.rootFolderId || '';
	cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM;
	cipherIV: string = this.template.cipherIV || '';
	unixTime: number = this.template.unixTime || 0;
	arFS: string = this.template.arFS || '';
	driveId: string = this.template.driveId || '';
	driveSharing?: DriveSharing = this.template.driveSharing;
	drivePrivacy: DrivePrivacy = this.template.drivePrivacy || drivePrivacyValues.PRIVATE;
	driveAuthMode?: DriveAuthMode = this.template.driveAuthMode;
	metaDataTxId: string = this.template.metaDataTxId || '';
	metaDataSyncStatus: SyncStatus = this.template.metaDataSyncStatus || 0;
	isLocal?: YesNoInteger = this.template.isLocal || 0;

	constructor(protected readonly template: IDriveMetaData = {}) {
		this.id = Number(this.id);
		this.unixTime = Number(this.unixTime);
		this.metaDataSyncStatus = Number(this.metaDataSyncStatus) as SyncStatus;
		this.isLocal = Number(this.isLocal) as YesNoInteger;
	}
}

export type IFileMetaData = Partial<ArFSFileMetaData>;

export class ArFSFileMetaData {
	id: number = this.template.id || 0;
	login: string = this.template.login || '';
	appName: string = this.template.appName || '';
	appVersion: string = this.template.appVersion || '';
	unixTime: number = this.template.unixTime || 0;
	contentType: ContentType = this.template.contentType || contentTypeValues.APPLICATION_JSON;
	entityType: EntityType = this.template.entityType || entityTypeValues.FILE;
	driveId: string = this.template.driveId || '';
	parentFolderId: string = this.template.parentFolderId || '';
	fileId: string = this.template.fileId || '';
	fileSize: number = this.template.fileSize || 0;
	fileName: string = this.template.fileName || '';
	fileHash: string = this.template.fileHash || '';
	filePath: string = this.template.filePath || '';
	fileVersion: number = this.template.fileVersion || 0;
	cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM;
	dataCipherIV: string = this.template.dataCipherIV || '';
	metaDataCipherIV: string = this.template.dataCipherIV || '';
	lastModifiedDate: number = this.template.lastModifiedDate || 0;
	isLocal: YesNoInteger = this.template.isLocal || yesNoIntegerValues.NO;
	isPublic: YesNoInteger = this.template.isPublic || yesNoIntegerValues.NO;
	permaWebLink: string = this.template.permaWebLink || '';
	metaDataTxId: string = this.template.metaDataTxId || '';
	dataTxId: string = this.template.dataTxId || '';
	fileDataSyncStatus: SyncStatus = this.template.fileDataSyncStatus || syncStatusValues.READY_TO_DOWNLOAD;
	fileMetaDataSyncStatus: SyncStatus = this.template.fileMetaDataSyncStatus || syncStatusValues.READY_TO_DOWNLOAD;
	cloudOnly: YesNoInteger = this.template.cloudOnly || yesNoIntegerValues.NO;

	constructor(protected readonly template: IFileMetaData = {}) {
		this.id = Number(this.id);
		this.unixTime = Number(this.unixTime);
		this.fileSize = Number(this.fileSize);
		this.fileVersion = Number(this.fileVersion);
		this.lastModifiedDate = Number(this.lastModifiedDate);
		this.isLocal = Number(this.isLocal) as YesNoInteger;
		this.isPublic = Number(this.isPublic) as YesNoInteger;
		this.fileDataSyncStatus = Number(this.isPublic) as SyncStatus;
		this.fileMetaDataSyncStatus = Number(this.fileMetaDataSyncStatus) as SyncStatus;
		this.cloudOnly = Number(this.cloudOnly) as YesNoInteger;
	}
}

export interface ArFSEncryptedData {
	cipher: CipherType;
	cipherIV: string;
	data: Buffer;
}
