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
export interface ArFSLocalMetaData {
	id: number; // an identifier that can be used in any underlying database, eg. 1, 2, 3 etc.
	owner: string; // the public arweave wallet address that owns this drive eg. FAxDUPlFfJrLDl6BvUlPw3EJOEEeg6WQbhiWidU7ueY
	hash: string; // A SHA512 hash of a the file or a hash of a folder's contents using the folder-hash package, https://www.npmjs.com/package/folder-hash
	path: string; // The local OS path of the file.  Should this be a path object?
	version: number; // The version number of the underlying file data.  Should be incremented by 1 for each version found for a given fileId.
	isLocal: number; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
}

// Contains metadata needed to synchronize folder's metadata
export interface ArFSLocalFolder extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSFileFolderEntity | arfsTypes.ArFSPrivateFileFolderEntity; // The underlying ArFS Entity
}

// Contains metadata needed to synchronize a file's metadata and its data
export interface ArFSLocalFile extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSFileFolderEntity;
	data: arfsTypes.ArFSFileData;
}

export interface ArFSLocalPrivateFile extends ArFSLocalMetaData {
	entity: arfsTypes.ArFSPrivateFileFolderEntity;
	data: arfsTypes.ArFSFileData;
}

// ArFSBundles are only uploaded.  Once a bundle is uploaded, it is unpacked into individual transactions and graphQL objects.  ArDrive clients synchronize with thos individual objects, and not the bundle itself.  This means that less information is required for an ArFSBundle
export interface ArFSBundle {
	id: number; // the id of this bundle in any underlying database
	login: string; // the user's login name.  we should replace this with the users public key
	txId: string; // the arweave transaction id for this bundle. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	syncStatus: number; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	uploadTime: number; // seconds since unix epoch, taken at the time of upload and used to see how long a transaction is taking 10 numbers eg. 1620068042
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
