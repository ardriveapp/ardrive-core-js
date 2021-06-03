import { OrInvalid } from './type_conditionals';
import { cipherType, contentType, driveAuthMode, drivePrivacy, driveSharing, entityType, invalid } from './type_guards';
export interface IDriveUser {
	login?: OrInvalid<string>;
	dataProtectionKey?: OrInvalid<string>;
	walletPrivateKey?: OrInvalid<string>;
	walletPublicKey?: OrInvalid<string>;
	syncFolderPath?: OrInvalid<string>;
	autoSyncApproval?: OrInvalid<number>;
}

export interface UploadBatch {
	totalArDrivePrice: OrInvalid<number>;
	totalUSDPrice: OrInvalid<number>;
	totalSize: OrInvalid<string>;
	totalNumberOfFileUploads: OrInvalid<number>;
	totalNumberOfMetaDataUploads: OrInvalid<number>;
	totalNumberOfFolderUploads: OrInvalid<number>;
}

export interface IRootFolderMetaData {
	metaDataTxId?: OrInvalid<string>;
	cipher?: OrInvalid<cipherType>;
	cipherIV?: OrInvalid<string>;
}

export interface ArDriveBundle {
	id: OrInvalid<number>;
	login: OrInvalid<string>;
	bundleTxId: OrInvalid<string>;
	bundleSyncStatus: OrInvalid<number>;
	uploadTime: OrInvalid<number>;
}

export interface IDriveMetaData {
	id?: OrInvalid<number>;
	login?: OrInvalid<string>;
	appName?: OrInvalid<string>;
	appVersion?: OrInvalid<string>;
	driveName?: OrInvalid<string>;
	rootFolderId?: OrInvalid<string>;
	cipher?: OrInvalid<cipherType>;
	cipherIV?: OrInvalid<string>;
	unixTime?: OrInvalid<number>;
	arFS?: OrInvalid<string>;
	driveId?: OrInvalid<string>;
	driveSharing?: OrInvalid<driveSharing>;
	drivePrivacy?: OrInvalid<drivePrivacy>;
	driveAuthMode?: OrInvalid<driveAuthMode>;
	metaDataTxId?: OrInvalid<string>;
	metaDataSyncStatus?: OrInvalid<number>;
	isLocal?: OrInvalid<number>;
}

export class ArDriveUser implements IDriveUser {
	login: OrInvalid<string> = invalid;
	dataProtectionKey: OrInvalid<string> = invalid;
	walletPrivateKey: OrInvalid<string> = invalid;
	walletPublicKey: OrInvalid<string> = invalid;
	syncFolderPath: OrInvalid<string> = invalid;
	autoSyncApproval: OrInvalid<number> = invalid;

	constructor(args: IDriveUser = {}) {
		Object.assign(this, args);
	}
}

export class ArFSRootFolderMetaData implements IRootFolderMetaData {
	metaDataTxId: OrInvalid<string> = invalid;
	cipher: OrInvalid<cipherType> = invalid;
	cipherIV: OrInvalid<string> = invalid;

	constructor(args: IRootFolderMetaData = {}) {
		Object.assign(this, args);
	}
}

export class ArFSDriveMetaData implements IDriveMetaData {
	id: OrInvalid<number> = invalid;
	login?: string;
	appName: string = invalid;
	appVersion: string = invalid;
	driveName: string = invalid;
	rootFolderId: string = invalid;
	cipher: OrInvalid<cipherType> = invalid;
	cipherIV: string = invalid;
	unixTime: OrInvalid<number> = invalid;
	arFS: string = invalid;
	driveId: string = invalid;
	driveSharing?: OrInvalid<driveSharing>;
	drivePrivacy: OrInvalid<drivePrivacy> = invalid;
	driveAuthMode?: OrInvalid<driveAuthMode>;
	metaDataTxId: string = invalid;
	metaDataSyncStatus: OrInvalid<number> = invalid;
	isLocal?: OrInvalid<number> = invalid;

	constructor(args: IDriveMetaData) {
		Object.assign(this, args);
	}

	// static Empty(appName: string, appVersion: string, driveId: string): ArFSDriveMetaData {
	// 	return new ArFSDriveMetaData({
	// 		id: 0,
	// 		appName: appName,
	// 		appVersion: appVersion,
	// 		driveId,
	// 		driveSharing: driveSharing.SHARED,
	// 		drivePrivacy: drivePrivacy.PUBLIC,
	// 		metaDataTxId: '0',
	// 		metaDataSyncStatus: 0
	// 	});
	// }
}

export interface IFileMetaData {
	id?: OrInvalid<number>;
	login: string;
	appName: string;
	appVersion: string;
	unixTime?: OrInvalid<number>;
	contentType?: string;
	entityType: OrInvalid<entityType>;
	driveId: string;
	parentFolderId: string;
	fileId?: string;
	fileSize?: OrInvalid<number>;
	fileName?: string;
	fileHash?: string;
	filePath?: string;
	fileVersion: OrInvalid<number>;
	cipher?: OrInvalid<cipherType>;
	dataCipherIV?: string;
	metaDataCipherIV?: string;
	lastModifiedDate?: OrInvalid<number>;
	isLocal: OrInvalid<number>;
	isPublic: OrInvalid<number>;
	permaWebLink?: string;
	metaDataTxId?: string;
	dataTxId?: string;
	fileDataSyncStatus: OrInvalid<number>;
	fileMetaDataSyncStatus: OrInvalid<number>;
	cloudOnly: OrInvalid<number>;
}
export class ArFSFileMetaData implements IFileMetaData {
	id: OrInvalid<number> = invalid;
	login: string = invalid;
	appName: string = invalid;
	appVersion: string = invalid;
	unixTime: OrInvalid<number> = invalid;
	contentType: OrInvalid<contentType> = invalid;
	entityType: OrInvalid<entityType> = invalid;
	driveId: string = invalid;
	parentFolderId: string = invalid;
	fileId: string = invalid;
	fileSize: OrInvalid<number> = invalid;
	fileName: string = invalid;
	fileHash: string = invalid;
	filePath: string = invalid;
	fileVersion: OrInvalid<number> = invalid;
	cipher: OrInvalid<cipherType> = invalid;
	dataCipherIV: string = invalid;
	metaDataCipherIV: string = invalid;
	lastModifiedDate: OrInvalid<number> = invalid;
	isLocal: OrInvalid<number> = invalid;
	isPublic: OrInvalid<number> = invalid;
	permaWebLink: string = invalid;
	metaDataTxId: string = invalid;
	dataTxId: string = invalid;
	fileDataSyncStatus: OrInvalid<number> = invalid;
	fileMetaDataSyncStatus: OrInvalid<number> = invalid;
	cloudOnly: OrInvalid<number> = invalid;

	constructor(args: IFileMetaData) {
		Object.assign(this, args);
	}

	// static Empty(userLogin: string): ArFSFileMetaData {
	// 	return new ArFSFileMetaData({
	// 		id: 0,
	// 		login: userLogin,
	// 		appName: '',
	// 		appVersion: '',
	// 		unixTime: 0,
	// 		contentType: '',
	// 		entityType: '',
	// 		driveId: '',
	// 		parentFolderId: '',
	// 		fileId: '',
	// 		fileSize: 0,
	// 		fileName: '',
	// 		fileHash: '',
	// 		filePath: '',
	// 		fileVersion: 0,
	// 		lastModifiedDate: 0,
	// 		isPublic: 0,
	// 		isLocal: 0,
	// 		fileDataSyncStatus: 0,
	// 		fileMetaDataSyncStatus: 0,
	// 		permaWebLink: '',
	// 		metaDataTxId: '',
	// 		dataTxId: '',
	// 		cipher: '',
	// 		dataCipherIV: '',
	// 		metaDataCipherIV: '',
	// 		cloudOnly: 0
	// 	});
	// }
}

export interface ArFSEncryptedData {
	cipher: cipherType;
	cipherIV: string;
	data: Buffer;
}
