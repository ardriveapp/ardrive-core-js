import {
	ArFSFileFolderEntity,
	ArFSPrivateDriveEntity,
	ArFSPrivateFileData,
	ArFSPrivateFileFolderEntity,
	ArFSPublicDriveEntity,
	ArFSPublicFileData,
	ArFSPublicFileFolderEntity
} from './arfs_Types';
import { PrivacyToData, PrivacyToDriveEntity } from './type_conditionals';
import { DrivePrivacy, PrivateType, PublicType, YesNoInteger, yesNoIntegerValues } from './type_guards';

// These types are used by ArDrive Clients.
// They contain the core ArFS Entity metadata as well as additional details like file hash, file path, sync status etc.

// Contains all of the metadata needed for an ArFS client to sync a drive
export type ILocalDriveEntity<P extends DrivePrivacy> = Partial<ArFSLocalDriveEntity<P>>;

export abstract class ArFSLocalDriveEntity<P extends DrivePrivacy> {
	id: number = this.template.id || 0;
	driveId: string = this.template.driveId || '';
	owner: string = this.template.owner || '';
	abstract entity: PrivacyToDriveEntity<P>;
	isLocal: YesNoInteger = this.template.isLocal || yesNoIntegerValues.NO;

	constructor(protected readonly template: ILocalDriveEntity<P> = {}) {
		this.id = Number(this.id);
		this.isLocal = Number(this.isLocal) as YesNoInteger;
	}
}

export class ArFSLocalPublicDriveEntity extends ArFSLocalDriveEntity<PublicType> {
	entity: ArFSPublicDriveEntity = this.template.entity || new ArFSPublicDriveEntity();
}

export class ArFSLocalPrivateDriveEntity extends ArFSLocalDriveEntity<PrivateType> {
	entity: ArFSPrivateDriveEntity = (this.template.entity as ArFSPrivateDriveEntity) || new ArFSPrivateDriveEntity(); // The underlying ArFS Drive entity and metadata
}

// Contains all of the metadata needed to for an ArFS client to sync a file or folder
export type ILocalMetaData<P extends DrivePrivacy> = Partial<ArFSLocalMetaData<P>>;

export abstract class ArFSLocalMetaData<P extends DrivePrivacy> {
	id: number = this.template.id || 0; // an identifier that can be used in any underlying database, eg. 1, 2, 3 etc.
	owner: string = this.template.owner || ''; // the public arweave wallet address that owns this drive eg. FAxDUPlFfJrLDl6BvUlPw3EJOEEeg6WQbhiWidU7ueY
	hash: string = this.template.hash || ''; // A SHA512 hash of a the file or a hash of a folder's contents using the folder-hash package, https://www.npmjs.com/package/folder-hash
	path: string = this.template.path || ''; // The local OS path of the file.  Should this be a path object?
	size: number = this.template.size || 0; // The size in bytes of the underlying file data
	version: number = this.template.version || 0; // The version number of the underlying file data.  Should be incremented by 1 for each version found for a given fileId.
	isLocal: YesNoInteger = this.template.isLocal || yesNoIntegerValues.NO; // Indicates if the drive is being synchronized locally or not.  0 for "no", 1 for "yes"

	abstract entity?: ArFSFileFolderEntity<P>;
	data?: PrivacyToData<P>;

	constructor(protected readonly template: ILocalMetaData<P> = {}) {
		this.id = Number(this.id);
		this.size = Number(this.size);
		this.version = Number(this.version);
		this.isLocal = Number(this.isLocal) as YesNoInteger;
	}
}

// Contains metadata needed to synchronize folder's metadata
export class ArFSLocalPublicFolder extends ArFSLocalMetaData<PublicType> {
	entity: ArFSPublicFileFolderEntity = new ArFSPublicFileFolderEntity(); // The underlying ArFS Entity
}

export class ArFSLocalPrivateFolder extends ArFSLocalMetaData<PrivateType> {
	entity: ArFSPrivateFileFolderEntity = new ArFSPrivateFileFolderEntity(); // The underlying ArFS Entity
}

// Contains metadata needed to synchronize a file's metadata and its data
export class ArFSLocalPublicFile extends ArFSLocalMetaData<PublicType> {
	entity: ArFSPublicFileFolderEntity = new ArFSPublicFileFolderEntity();
	data: ArFSPublicFileData = new ArFSPublicFileData();
}

export class ArFSLocalPrivateFile extends ArFSLocalMetaData<PrivateType> {
	entity: ArFSPrivateFileFolderEntity = new ArFSPrivateFileFolderEntity();
	data: ArFSPrivateFileData = new ArFSPrivateFileData();
}

// ArFSBundles are only uploaded.  Once a bundle is uploaded, it is unpacked into individual transactions and graphQL objects.  ArDrive clients synchronize with thos individual objects, and not the bundle itself.  This means that less information is required for an ArFSBundle
export interface ArFSBundle {
	id: number; // the id of this bundle in any underlying database
	login: string; // the user's login name.  we should replace this with the users public key
	txId: string; // the arweave transaction id for this bundle. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	syncStatus: number; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	uploadTime: number; // seconds since unix epoch, taken at the time of upload and used to see how long a transaction is taking 10 numbers eg. 1620068042
}
