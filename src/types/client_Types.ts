import { ArFSPrivateDriveEntity, ArFSPublicDriveEntity } from './arfs_Types';
import { OrInvalid, PrivacyToData, PrivacyToDriveEntity, PrivacyToFileFolderEntity } from './type_conditionals';
import { drivePrivacy, invalid } from './type_guards';

// These types are used by ArDrive Clients.
// They contain the core ArFS Entity metadata as well as additional details like file hash, file path, sync status etc.

// Contains all of the metadata needed for an ArFS client to sync a drive
export interface ILocalDriveEntity<P extends drivePrivacy> {
	id?: OrInvalid<number>; // an identifier that can be used in any underlying database
	driveId?: OrInvalid<string>;
	owner?: OrInvalid<string>; // the public arweave wallet address that owns this drive
	entity?: OrInvalid<PrivacyToDriveEntity<P>>; // The underlying ArFS Drive entity and metadata
	isLocal?: OrInvalid<number>; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
}

export class ArFSLocalDriveEntity<P extends drivePrivacy> implements ILocalDriveEntity<P> {
	id: ILocalDriveEntity<P>['id'] = invalid;
	driveId: OrInvalid<string> = invalid;
	owner: ILocalDriveEntity<P>['owner'] = invalid;
	entity: ILocalDriveEntity<P>['entity'] = invalid;
	isLocal: ILocalDriveEntity<P>['isLocal'] = invalid;

	constructor(args: ILocalDriveEntity<P>) {
		Object.assign(this, args);
	}
}

export class ArFSLocalPublicDriveEntity extends ArFSLocalDriveEntity<drivePrivacy.PUBLIC> {
	entity: OrInvalid<ArFSPublicDriveEntity> = invalid;
}

export class ArFSLocalPrivateDriveEntity extends ArFSLocalDriveEntity<drivePrivacy.PRIVATE> {
	entity: OrInvalid<ArFSPrivateDriveEntity> = invalid; // The underlying ArFS Drive entity and metadata
}

// Contains all of the metadata needed to for an ArFS client to sync a file or folder
export interface ILocalMetaData<P extends drivePrivacy> {
	id?: OrInvalid<number>;
	owner?: OrInvalid<string>;
	hash?: OrInvalid<string>;
	path?: OrInvalid<string>;
	size?: OrInvalid<number>;
	version?: OrInvalid<number>;
	isLocal?: OrInvalid<number>;
	entity?: OrInvalid<PrivacyToFileFolderEntity<P>>;
	data?: OrInvalid<PrivacyToData<P>>;
}

export class ArFSLocalMetaData<P extends drivePrivacy> implements ILocalMetaData<P> {
	id: OrInvalid<number> = invalid; // an identifier that can be used in any underlying database, eg. 1, 2, 3 etc.
	owner: OrInvalid<string> = invalid; // the public arweave wallet address that owns this drive eg. FAxDUPlFfJrLDl6BvUlPw3EJOEEeg6WQbhiWidU7ueY
	hash: OrInvalid<string> = invalid; // A SHA512 hash of a the file or a hash of a folder's contents using the folder-hash package, https://www.npmjs.com/package/folder-hash
	path: OrInvalid<string> = invalid; // The local OS path of the file.  Should this be a path object?
	size: OrInvalid<number> = invalid; // The size in bytes of the underlying file data
	version: OrInvalid<number> = invalid; // The version number of the underlying file data.  Should be incremented by 1 for each version found for a given fileId.
	isLocal: OrInvalid<number> = invalid; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
	entity: OrInvalid<PrivacyToFileFolderEntity<P>> = invalid;
	data?: OrInvalid<PrivacyToData<P>> = invalid;

	constructor(args: ILocalMetaData<P>) {
		Object.assign(this, args);
	}
}

// Contains metadata needed to synchronize folder's metadata
export class ArFSLocalPublicFolder extends ArFSLocalMetaData<drivePrivacy.PUBLIC> {
	entity: ArFSLocalMetaData<drivePrivacy.PUBLIC>['entity'] = invalid; // The underlying ArFS Entity
}

export class ArFSLocalPrivateFolder extends ArFSLocalMetaData<drivePrivacy.PRIVATE> {
	entity: ArFSLocalMetaData<drivePrivacy.PRIVATE>['entity'] = invalid; // The underlying ArFS Entity
}

// Contains metadata needed to synchronize a file's metadata and its data
export class ArFSLocalPublicFile extends ArFSLocalMetaData<drivePrivacy.PUBLIC> {
	entity: ArFSLocalMetaData<drivePrivacy.PUBLIC>['entity'] = invalid;
	data: ArFSLocalMetaData<drivePrivacy.PUBLIC>['data'];
}

export class ArFSLocalPrivateFile extends ArFSLocalMetaData<drivePrivacy.PRIVATE> {
	entity: ArFSLocalMetaData<drivePrivacy.PRIVATE>['entity'] = invalid;
	data: OrInvalid<PrivacyToData<drivePrivacy.PRIVATE>> = invalid;
}

// ArFSBundles are only uploaded.  Once a bundle is uploaded, it is unpacked into individual transactions and graphQL objects.  ArDrive clients synchronize with thos individual objects, and not the bundle itself.  This means that less information is required for an ArFSBundle
export interface ArFSBundle {
	id: OrInvalid<number>; // the id of this bundle in any underlying database
	login: OrInvalid<string>; // the user's login name.  we should replace this with the users public key
	txId: OrInvalid<string>; // the arweave transaction id for this bundle. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	syncStatus: OrInvalid<number>; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	uploadTime: OrInvalid<number>; // seconds since unix epoch, taken at the time of upload and used to see how long a transaction is taking 10 numbers eg. 1620068042
}
