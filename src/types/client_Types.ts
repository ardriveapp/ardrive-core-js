import {
	ArFSPrivateDriveEntity,
	ArFSPrivateFileData,
	ArFSPrivateFileFolderEntity,
	ArFSPublicDriveEntity,
	ArFSPublicFileData,
	ArFSPublicFileFolderEntity
} from './arfs_Types';
import { PrivacyToData, PrivacyToDriveEntity, PrivacyToFileFolderEntity } from './type_conditionals';
import { DrivePrivacy, PrivateType, PublicType, YesNoInteger, yesNoIntegerValues } from './type_guards';

// These types are used by ArDrive Clients.
// They contain the core ArFS Entity metadata as well as additional details like file hash, file path, sync status etc.

// Contains all of the metadata needed for an ArFS client to sync a drive
export interface ILocalDriveEntity<P extends DrivePrivacy> {
	id?: number; // an identifier that can be used in any underlying database
	driveId?: string;
	owner?: string; // the public arweave wallet address that owns this drive
	entity?: PrivacyToDriveEntity<P>; // The underlying ArFS Drive entity and metadata
	isLocal?: YesNoInteger; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
}

export class ArFSLocalDriveEntity<P extends DrivePrivacy> implements ILocalDriveEntity<P> {
	id = 0;
	driveId = '';
	owner = '';
	entity: PrivacyToDriveEntity<P> = new ArFSPublicDriveEntity({}); // fixme: it's a placeholder
	isLocal: YesNoInteger = yesNoIntegerValues.NO;

	constructor(args: ILocalDriveEntity<P>) {
		Object.assign(this, args);
	}
}

export class ArFSLocalPublicDriveEntity extends ArFSLocalDriveEntity<PublicType> {
	entity: ArFSPublicDriveEntity = new ArFSPublicDriveEntity({});
}

export class ArFSLocalPrivateDriveEntity extends ArFSLocalDriveEntity<PrivateType> {
	entity: ArFSPrivateDriveEntity = new ArFSPrivateDriveEntity({}); // The underlying ArFS Drive entity and metadata
}

// Contains all of the metadata needed to for an ArFS client to sync a file or folder
export interface ILocalMetaData<P extends DrivePrivacy> {
	id?: number;
	owner?: string;
	hash?: string;
	path?: string;
	size?: number;
	version?: number;
	isLocal?: YesNoInteger;
	entity?: PrivacyToFileFolderEntity<P>;
	data?: PrivacyToData<P>;
}

export class ArFSLocalMetaData<P extends DrivePrivacy> implements ILocalMetaData<P> {
	id = 0; // an identifier that can be used in any underlying database, eg. 1, 2, 3 etc.
	owner = ''; // the public arweave wallet address that owns this drive eg. FAxDUPlFfJrLDl6BvUlPw3EJOEEeg6WQbhiWidU7ueY
	hash = ''; // A SHA512 hash of a the file or a hash of a folder's contents using the folder-hash package, https://www.npmjs.com/package/folder-hash
	path = ''; // The local OS path of the file.  Should this be a path object?
	size = 0; // The size in bytes of the underlying file data
	version = 0; // The version number of the underlying file data.  Should be incremented by 1 for each version found for a given fileId.
	isLocal = yesNoIntegerValues.NO; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"
	entity?: PrivacyToFileFolderEntity<P>;
	data?: PrivacyToData<P>;

	constructor(args: ILocalMetaData<P>) {
		Object.assign(this, args);
	}
}

// Contains metadata needed to synchronize folder's metadata
export class ArFSLocalPublicFolder extends ArFSLocalMetaData<PublicType> {
	entity: ArFSPublicFileFolderEntity = new ArFSPublicFileFolderEntity({}); // The underlying ArFS Entity
}

export class ArFSLocalPrivateFolder extends ArFSLocalMetaData<PrivateType> {
	entity: ArFSPrivateFileFolderEntity = new ArFSPrivateFileFolderEntity({}); // The underlying ArFS Entity
}

// Contains metadata needed to synchronize a file's metadata and its data
export class ArFSLocalPublicFile extends ArFSLocalMetaData<PublicType> {
	entity: ArFSPublicFileFolderEntity = new ArFSPublicFileFolderEntity({});
	data: ArFSPublicFileData = new ArFSPublicFileData();
}

export class ArFSLocalPrivateFile extends ArFSLocalMetaData<PrivateType> {
	entity: ArFSPrivateFileFolderEntity = new ArFSPrivateFileFolderEntity({});
	data: ArFSPrivateFileData = new ArFSPrivateFileData({});
}

// ArFSBundles are only uploaded.  Once a bundle is uploaded, it is unpacked into individual transactions and graphQL objects.  ArDrive clients synchronize with thos individual objects, and not the bundle itself.  This means that less information is required for an ArFSBundle
export interface ArFSBundle {
	id: number; // the id of this bundle in any underlying database
	login: string; // the user's login name.  we should replace this with the users public key
	txId: string; // the arweave transaction id for this bundle. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	syncStatus: number; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	uploadTime: number; // seconds since unix epoch, taken at the time of upload and used to see how long a transaction is taking 10 numbers eg. 1620068042
}
