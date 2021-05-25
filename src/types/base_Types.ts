import * as guards from './type_guards';
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
	cipher: guards.cipherType;
	cipherIV: string;
}

export interface ArDriveBundle {
	id: number;
	login: string;
	bundleTxId: string;
	bundleSyncStatus: number;
	uploadTime: number;
}

export interface ArFSDriveMetaDataParameters {
	id: number;
	login?: string;
	appName: string;
	appVersion: string;
	driveName: string;
	rootFolderId: string;
	cipher: guards.cipherType;
	cipherIV: string;
	unixTime: number;
	arFS: string;
	driveId: string;
	driveSharing?: string;
	drivePrivacy: guards.drivePrivacy;
	driveAuthMode: guards.driveAuthMode;
	metaDataTxId: string;
	metaDataSyncStatus: number;
	isLocal?: number;
}

export class ArFSDriveMetaData {
	id: number;
	login?: string;
	appName: string;
	appVersion: string;
	driveName: string;
	rootFolderId: string;
	cipher: guards.cipherType;
	cipherIV: string;
	unixTime: number;
	arFS: string;
	driveId: string;
	driveSharing?: string;
	drivePrivacy: guards.drivePrivacy;
	driveAuthMode: guards.driveAuthMode;
	metaDataTxId: string;
	metaDataSyncStatus: number;
	isLocal?: number;

	constructor({
		id,
		login,
		appName,
		appVersion,
		driveName,
		rootFolderId,
		cipher,
		cipherIV,
		unixTime,
		arFS,
		driveId,
		driveSharing,
		drivePrivacy,
		driveAuthMode,
		metaDataTxId,
		metaDataSyncStatus,
		isLocal
	}: ArFSDriveMetaDataParameters) {
		this.id = id;
		this.login = login;
		this.appName = appName;
		this.appVersion = appVersion;
		this.driveName = driveName;
		this.rootFolderId = rootFolderId;
		this.cipher = cipher;
		this.cipherIV = cipherIV;
		this.unixTime = unixTime;
		this.arFS = arFS;
		this.driveId = driveId;
		this.driveSharing = driveSharing;
		this.drivePrivacy = drivePrivacy;
		this.driveAuthMode = driveAuthMode;
		this.metaDataTxId = metaDataTxId;
		this.metaDataSyncStatus = metaDataSyncStatus;
		this.isLocal = isLocal;
	}

	static Empty(appName: string, appVersion: string, driveId: string): ArFSDriveMetaData {
		return new ArFSDriveMetaData({
			id: 0,
			login: '',
			appName: appName,
			appVersion: appVersion,
			driveName: '',
			rootFolderId: '',
			cipher: '',
			cipherIV: '',
			unixTime: 0,
			arFS: '',
			driveId,
			driveSharing: 'shared',
			drivePrivacy: 'public',
			driveAuthMode: '',
			metaDataTxId: '0',
			metaDataSyncStatus: 0
		});
	}
}

export interface ArFSFileMetaDataParameters {
	id: number;
	login: string;
	appName: string;
	appVersion: string;
	unixTime: number;
	contentType: string;
	entityType: guards.entityType;
	driveId: string;
	parentFolderId: string;
	fileId: string;
	fileSize: number;
	fileName: string;
	fileHash: string;
	filePath: string;
	fileVersion: number;
	cipher: guards.cipherType;
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
export class ArFSFileMetaData {
	id: number;
	login: string;
	appName: string;
	appVersion: string;
	unixTime: number;
	contentType: string;
	entityType: guards.entityType;
	driveId: string;
	parentFolderId: string;
	fileId: string;
	fileSize: number;
	fileName: string;
	fileHash: string;
	filePath: string;
	fileVersion: number;
	cipher: guards.cipherType;
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

	constructor({
		id,
		login,
		appName,
		appVersion,
		unixTime,
		contentType,
		entityType,
		driveId,
		parentFolderId,
		fileId,
		fileSize,
		fileName,
		fileHash,
		filePath,
		fileVersion,
		cipher,
		dataCipherIV,
		metaDataCipherIV,
		lastModifiedDate,
		isLocal,
		isPublic,
		permaWebLink,
		metaDataTxId,
		dataTxId,
		fileDataSyncStatus,
		fileMetaDataSyncStatus,
		cloudOnly
	}: ArFSFileMetaDataParameters) {
		this.id = id;
		this.login = login;
		this.appName = appName;
		this.appVersion = appVersion;
		this.unixTime = unixTime;
		this.contentType = contentType;
		this.entityType = entityType;
		this.driveId = driveId;
		this.parentFolderId = parentFolderId;
		this.fileId = fileId;
		this.fileSize = fileSize;
		this.fileName = fileName;
		this.fileHash = fileHash;
		this.filePath = filePath;
		this.fileVersion = fileVersion;
		this.cipher = cipher;
		this.dataCipherIV = dataCipherIV;
		this.metaDataCipherIV = metaDataCipherIV;
		this.lastModifiedDate = lastModifiedDate;
		this.isLocal = isLocal;
		this.isPublic = isPublic;
		this.permaWebLink = permaWebLink;
		this.metaDataTxId = metaDataTxId;
		this.dataTxId = dataTxId;
		this.fileDataSyncStatus = fileDataSyncStatus;
		this.fileMetaDataSyncStatus = fileMetaDataSyncStatus;
		this.cloudOnly = cloudOnly;
	}

	static Empty(userLogin: string): ArFSFileMetaData {
		return new ArFSFileMetaData({
			id: 0,
			login: userLogin,
			appName: '',
			appVersion: '',
			unixTime: 0,
			contentType: '',
			entityType: '',
			driveId: '',
			parentFolderId: '',
			fileId: '',
			fileSize: 0,
			fileName: '',
			fileHash: '',
			filePath: '',
			fileVersion: 0,
			lastModifiedDate: 0,
			isPublic: 0,
			isLocal: 0,
			fileDataSyncStatus: 0,
			fileMetaDataSyncStatus: 0,
			permaWebLink: '',
			metaDataTxId: '',
			dataTxId: '',
			cipher: '',
			dataCipherIV: '',
			metaDataCipherIV: '',
			cloudOnly: 0
		});
	}
}

export interface ArFSEncryptedData {
	cipher: guards.cipherType;
	cipherIV: string;
	data: Buffer;
}

// Arweave GraphQL Interfaces
