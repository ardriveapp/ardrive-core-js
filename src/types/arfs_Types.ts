import {
	CipherType,
	ContentType,
	DriveAuthMode,
	DrivePrivacy,
	EntityType,
	SyncStatus,
	drivePrivacyValues,
	FileFolderEntityType,
	contentTypeValues,
	entityTypeValues,
	syncStatusValues,
	cipherTypeValues,
	PrivateType,
	PublicType
} from './type_guards';

// The arweave wallet RSA Public Key
export interface JWKPublicInterface {
	kty: string;
	e: string;
	n: string;
}

// The arweave wallet RSA private key
export interface JWKInterface extends JWKPublicInterface {
	d?: string;
	p?: string;
	q?: string;
	dp?: string;
	dq?: string;
	qi?: string;
}

// Arweave Wallet object that comprises the public/private keypair in the form of a JWK and the Arweave wallet public key that can be used for gql queries or ownership.
export interface Wallet {
	walletPrivateKey: JWKInterface;
	walletPublicKey: string;
}

// The primary ArFS entity that all other entities inherit from.

export interface IEntity {
	appName?: string;
	appVersion?: string;
	arFS?: string;
	contentType?: ContentType;
	entityType?: EntityType;
	name?: string;
	syncStatus?: SyncStatus;
	txId?: string;
	unixTime?: number;
	driveId?: string;
}

export interface IPrivate {
	cipher?: CipherType;
	cipherIV?: string;
}

export interface IDriveEntity extends IEntity {
	drivePrivacy?: DrivePrivacy;
	rootFolderId?: string;
}

export interface IPrivateDriveEntity extends IDriveEntity, IPrivate {
	drivePrivacy?: PrivateType;
	driveAuthMode?: DriveAuthMode;
}

export interface IPublicDriveEntity extends IDriveEntity {
	drivePrivacy?: PublicType;
}

export interface IFileFolderEntity extends IEntity {
	entityType?: FileFolderEntityType;
	parentFolderId?: string;
	entityId?: string; // FIXME: move to IEntity (?
	lastModifiedDate?: number;
}

export type IPublicFileFolderEntity = IFileFolderEntity;

export type IPrivateFileFolderEntity = IFileFolderEntity & IPrivate;

export interface IFileData {
	appName?: string;
	appVersion?: string;
	contentType?: ContentType;
	syncStatus?: SyncStatus;
	txId?: string;
	unixTime?: number;
}

export type IPublicFileEntity = IFileData;

// export type IPrivateFileEntity = IFileData & IPrivate;

export class ArFSEntity<T extends IEntity>
	// extends ValidateArguments
	implements IEntity
{
	appName = ''; // The app that has submitted this entity.  Should not be longer than 64 characters.  eg. ArDrive-Web
	appVersion = ''; // The app version that has submitted this entity.  Must not be longer than 8 digits, numbers only. eg. 0.1.14
	arFS = ''; // The version of Arweave File System that is used for this entity.  Must not be longer than 4 digits. eg 0.11
	contentType: ContentType = contentTypeValues.APPLICATION_JSON; // the mime type of the file uploaded.  in the case of drives and folders, it is always a JSON file.  Public drive/folders must use "application/json" and priate drives use "application/octet-stream" since this data is encrypted.
	// driveId?: string; // the unique drive identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	entityType: EntityType = entityTypeValues.FILE; // the type of ArFS entity this is.  this can only be set to "drive", "folder", "file"
	name = ''; // user defined entity name, cannot be longer than 64 characters.  This is stored in the JSON file that is uploaded along with the drive/folder/file metadata transaction
	syncStatus: SyncStatus = syncStatusValues.READY_TO_DOWNLOAD; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	txId = ''; // the arweave transaction id for this entity. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	unixTime = 0; // seconds since unix epoch, taken at the time of upload, 10 numbers eg. 1620068042

	constructor(args: T) {
		// super();
		Object.assign(this, args);
		// this.setValidators([
		// 	ValidateArguments.newValidator(stringValidator, 'appName'),
		// 	ValidateArguments.newValidator(lengthValidatorFactory({ min: 1, max: 64 }), 'appName'),
		// 	ValidateArguments.newValidator(stringValidator, 'appVersion'),
		// 	ValidateArguments.newValidator(stringValidator, 'appName')
		// ]);
		// TODO: throw error if invalid after this time
	}
}

// A Drive is a logical grouping of folders and files. All folders and files must be part of a drive, and reference the Drive ID.
// When creating a Drive, a corresponding folder must be created as well. This folder will act as the Drive Root Folder.
// This seperation of drive and folder entity enables features such as folder view queries.
export class ArFSDriveEntity<T extends IDriveEntity> extends ArFSEntity<T> implements IDriveEntity {
	entityType = entityTypeValues.DRIVE;
	driveId = '';
	drivePrivacy: DrivePrivacy = drivePrivacyValues.PRIVATE; // identifies if this drive is public or private (and encrypted)  can only be "public" or "private"
	rootFolderId = ''; // the uuid of the related drive root folder, stored in the JSON data that is uploaded with each Drive Entity metadata transaction
}

// An entity for a Private Drive entity with the extra privacy tags
export class ArFSPrivateDriveEntity extends ArFSDriveEntity<IPrivateDriveEntity> implements IPrivateDriveEntity {
	drivePrivacy = drivePrivacyValues.PRIVATE;
	contentType = contentTypeValues.APPLICATION_OCTET_STREAM;
	driveAuthMode?: DriveAuthMode; // used for future authentication schemes.  the only allowable value is "password"
	cipher: CipherType = cipherTypeValues.AES_256_GCM; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	cipherIV = ''; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
}

export class ArFSPublicDriveEntity extends ArFSDriveEntity<IPublicDriveEntity> implements IPublicDriveEntity {
	drivePrivacy = drivePrivacyValues.PUBLIC;
	contentType = contentTypeValues.APPLICATION_JSON;
}

// A Folder is a logical group of folders and files.  It contains a parent folder ID used to reference where this folder lives in the Drive hierarchy.
// Drive Root Folders must not have a parent folder ID, as they sit at the root of a drive.
// A File contains actual data, like a photo, document or movie.
// The File metadata transaction JSON references the File data transaction for retrieval.
// This separation allows for file metadata to be updated without requiring the file data to be reuploaded.
// NOTE: Files and Folders leverage the same entity type since they have the same properties
export class ArFSFileFolderEntity<T extends IFileFolderEntity> extends ArFSEntity<T> implements IFileFolderEntity {
	driveId = '';
	entityType: FileFolderEntityType = entityTypeValues.FILE;
	parentFolderId = ''; // the uuid of the parent folder that this entity sits within.  Folder Entities used for the drive root must not have a parent folder ID, eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	entityId = ''; // the unique folder identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	lastModifiedDate = 0; // the last modified date of the file or folder as seconds since unix epoch
}

export class ArFSPublicFileFolderEntity
	extends ArFSFileFolderEntity<IPublicFileFolderEntity>
	implements IPublicFileFolderEntity
{
	contentType = contentTypeValues.APPLICATION_JSON;
}

// Used for private Files/Folders only.
export class ArFSPrivateFileFolderEntity
	extends ArFSFileFolderEntity<IFileFolderEntity & IPrivate>
	implements IFileFolderEntity, IPrivate
{
	contentType = contentTypeValues.APPLICATION_OCTET_STREAM;
	cipher: CipherType = cipherTypeValues.AES_256_GCM; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	cipherIV = ''; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
}

// File entity metadata transactions do not include the actual File data they represent.
// Instead, the File data must be uploaded as a separate transaction, called the File data transaction.
export class ArFSFileData implements IFileData {
	appName = '';
	appVersion = '';
	contentType: ContentType = contentTypeValues.APPLICATION_JSON;
	syncStatus: SyncStatus = syncStatusValues.READY_TO_DOWNLOAD;
	txId = '';
	unixTime = 0;

	constructor(args: IFileData = {}) {
		Object.assign(this, args);
	}
}

export class ArFSPublicFileData extends ArFSFileData {}

export class ArFSPrivateFileData extends ArFSFileData implements IPrivate {
	cipher: CipherType = cipherTypeValues.AES_256_GCM;
	cipherIV = '';
}
