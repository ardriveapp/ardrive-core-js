import * as arfsTypes from './arfs_Types';

// These types are used by ArDrive Clients.
// They contain the core ArFS Entity metadata as well as additional details like file hash, file path, sync status etc.

// Contains all of the metadata needed for an ArFS client to sync a drive
export interface ArFSLocalDriveEntity {
	id: number; // an identifier that can be used in any underlying database
	owner: string; // the public arweave wallet address that owns this drive
	entity: arfsTypes.ArFSDriveEntity; // The underlying ArFS Drive entity and metadata
	isLocal: number; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
}

export interface ArFSLocalPrivateDriveEntity {
	id: number; // an identifier that can be used in any underlying database
	owner: string; // the public arweave wallet address that owns this drive
	entity: arfsTypes.ArFSPrivateDriveEntity; // The underlying ArFS Drive entity and metadata
	isLocal: number; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
}

// Contains all of the metadata needed to for an ArFS client to sync a file or folder
export interface ArFSLocalMetaDataArguments {
	id?: number;
	owner?: string;
	hash?: string;
	path?: string;
	size?: number;
	version?: number;
	isLocal?: number;
}
export class ArFSLocalMetaData {
	id: number; // an identifier that can be used in any underlying database, eg. 1, 2, 3 etc.
	owner: string; // the public arweave wallet address that owns this drive eg. FAxDUPlFfJrLDl6BvUlPw3EJOEEeg6WQbhiWidU7ueY
	hash: string; // A SHA512 hash of a the file or a hash of a folder's contents using the folder-hash package, https://www.npmjs.com/package/folder-hash
	path: string; // The local OS path of the file.  Should this be a path object?
	size: number; // The size in bytes of the underlying file data
	version: number; // The version number of the underlying file data.  Should be incremented by 1 for each version found for a given fileId.
	isLocal: number; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"

	constructor(id: number, owner: string, hash: string, path: string, size: number, version: number, isLocal: number) {
		this.id = id;
		this.owner = owner;
		this.hash = hash;
		this.path = path;
		this.size = size;
		this.version = version;
		this.isLocal = isLocal;
	}

	static From({ id, owner, hash, path, size, version, isLocal }: ArFSLocalMetaDataArguments) {
		return new ArFSLocalMetaData(
			id ?? 0,
			owner ?? '',
			hash ?? '',
			path ?? '',
			size ?? 0,
			version ?? 0,
			isLocal ?? 1
		);
	}
}

// Contains metadata needed to synchronize folder's metadata
export interface ArFSLocalFolder extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSFileFolderEntity; // The underlying ArFS Entity
}

export interface ArFSLocalPrivateFolder extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSPrivateFileFolderEntity; // The underlying ArFS Entity
}
export interface ArFSLocalFileArguments {
	id?: number;
	owner?: string;
	hash?: string;
	path?: string;
	size?: number;
	version?: number;
	isLocal?: number;
	entityId?: string;
	parentFolderId?: string;
	appName?: string;
	appVersion?: string;
	arFS?: string;
	contentType?: string;
	driveId?: string;
	entityType?: string;
	name?: string;
	syncStatus?: number;
	txId?: string;
	unixTime?: number;
	dataContentType?: string;
	dataSyncStatus?: number;
	dataTxId?: string;
	dataUnixTime?: number;
	lastModifiedDate?: number;
}
// Contains metadata needed to synchronize a file's metadata and its data
export class ArFSLocalFile extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSFileFolderEntity;
	data: arfsTypes.ArFSFileData;

	constructor(
		id: number,
		owner: string,
		hash: string,
		path: string,
		size: number,
		version: number,
		isLocal: number,
		entityId: string,
		parentFolderId: string,
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: string,
		driveId: string,
		entityType: string,
		name: string,
		syncStatus: number,
		txId: string,
		unixTime: number,
		dataContentType: string,
		dataSyncStatus: number,
		dataTxId: string,
		dataUnixTime: number,
		lastModifiedDate: number
	) {
		super(id, owner, hash, path, size, version, isLocal);
		this.entity = {
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			entityId,
			entityType,
			name,
			parentFolderId,
			syncStatus,
			txId,
			unixTime,
			lastModifiedDate
		};
		this.data = {
			appName,
			appVersion,
			contentType: dataContentType,
			syncStatus: dataSyncStatus,
			txId: dataTxId,
			unixTime: dataUnixTime
		};
	}

	static From({
		id,
		owner,
		hash,
		path,
		size,
		version,
		isLocal,
		entityId,
		parentFolderId,
		appName,
		appVersion,
		arFS,
		contentType,
		driveId,
		entityType,
		name,
		syncStatus,
		txId,
		unixTime,
		dataContentType,
		dataSyncStatus,
		dataTxId,
		dataUnixTime,
		lastModifiedDate
	}: ArFSLocalFileArguments): ArFSLocalFile {
		return new ArFSLocalFile(
			id ?? 0,
			owner ?? '',
			hash ?? '',
			path ?? '',
			size ?? 0,
			version ?? 0,
			isLocal ?? 0,
			entityId ?? '',
			parentFolderId ?? '',
			appName ?? '',
			appVersion ?? '',
			arFS ?? '',
			contentType ?? '',
			driveId ?? '',
			entityType ?? '',
			name ?? '',
			syncStatus ?? 0,
			txId ?? '',
			unixTime ?? 0,
			dataContentType ?? '',
			dataSyncStatus ?? 0,
			dataTxId ?? '',
			dataUnixTime ?? 0,
			lastModifiedDate ?? 0
		);
	}
}
export interface ArFSLocalPrivateFileArguments extends ArFSLocalFileArguments {
	cipher?: string;
	cipherIV?: string;
	dataCipher?: string;
	dataCipherIV?: string;
}
export class ArFSLocalPrivateFile extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSPrivateFileFolderEntity;
	data: arfsTypes.ArFSPrivateFileData;
	constructor(
		id: number,
		owner: string,
		hash: string,
		path: string,
		size: number,
		version: number,
		isLocal: number,
		entityId: string,
		parentFolderId: string,
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: string,
		driveId: string,
		entityType: string,
		name: string,
		syncStatus: number,
		txId: string,
		unixTime: number,
		dataContentType: string,
		dataSyncStatus: number,
		dataTxId: string,
		dataUnixTime: number,
		cipher: string,
		cipherIV: string,
		dataCipher: string,
		dataCipherIV: string,
		lastModifiedDate: number
	) {
		super(id, owner, hash, path, size, version, isLocal);
		this.entity = {
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			entityId,
			entityType,
			name,
			parentFolderId,
			syncStatus,
			txId,
			unixTime,
			cipher,
			cipherIV,
			lastModifiedDate
		};
		this.data = {
			appName,
			appVersion,
			contentType: dataContentType,
			syncStatus: dataSyncStatus,
			txId: dataTxId,
			unixTime: dataUnixTime,
			cipher: dataCipher,
			cipherIV: dataCipherIV
		};
	}
	static From({
		id,
		owner,
		hash,
		path,
		size,
		version,
		isLocal,
		entityId,
		parentFolderId,
		appName,
		appVersion,
		arFS,
		contentType,
		driveId,
		entityType,
		name,
		syncStatus,
		txId,
		unixTime,
		dataContentType,
		dataSyncStatus,
		dataTxId,
		dataUnixTime,
		cipher,
		cipherIV,
		dataCipher,
		dataCipherIV,
		lastModifiedDate
	}: ArFSLocalPrivateFileArguments): ArFSLocalPrivateFile {
		return new ArFSLocalPrivateFile(
			id ?? 0,
			owner ?? '',
			hash ?? '',
			path ?? '',
			size ?? 0,
			version ?? 0,
			isLocal ?? 0,
			entityId ?? '',
			parentFolderId ?? '',
			appName ?? '',
			appVersion ?? '',
			arFS ?? '',
			contentType ?? '',
			driveId ?? '',
			entityType ?? '',
			name ?? '',
			syncStatus ?? 0,
			txId ?? '',
			unixTime ?? 0,
			dataContentType ?? '',
			dataSyncStatus ?? 0,
			dataTxId ?? '',
			dataUnixTime ?? 0,
			cipher ?? '',
			cipherIV ?? '',
			dataCipher ?? '',
			dataCipherIV ?? '',
			lastModifiedDate ?? 0
		);
	}
}

// ArFSBundles are only uploaded.  Once a bundle is uploaded, it is unpacked into individual transactions and graphQL objects.  ArDrive clients synchronize with thos individual objects, and not the bundle itself.  This means that less information is required for an ArFSBundle
export interface ArFSBundle {
	id: number; // the id of this bundle in any underlying database
	login: string; // the user's login name.  we should replace this with the users public key
	txId: string; // the arweave transaction id for this bundle. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	syncStatus: number; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	uploadTime: number; // seconds since unix epoch, taken at the time of upload and used to see how long a transaction is taking 10 numbers eg. 1620068042
}
