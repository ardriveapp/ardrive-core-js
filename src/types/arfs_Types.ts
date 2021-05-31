// import { lengthValidatorFactory, stringValidator, ValidateArguments } from './validator';
import { cipherType, contentType, driveAuthMode, drivePrivacy, entityType, invalid, syncStatus } from './type_guards';

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
	contentType?: contentType | invalid;
	entityType?: entityType | invalid;
	name?: string;
	syncStatus?: syncStatus | invalid;
	txId?: string;
	unixTime?: number | invalid;
}

export interface IPrivate {
	cipher?: cipherType | invalid;
	cipherIV?: string;
}

export interface IDriveEntity extends IEntity {
	drivePrivacy?: drivePrivacy | invalid;
	rootFolderId?: string;
}

export interface IPrivateDriveEntity extends IDriveEntity, IPrivate {
	drivePrivacy: drivePrivacy.PRIVATE;
	driveAuthMode?: driveAuthMode;
}

export interface IPublicDriveEntity extends IDriveEntity {
	drivePrivacy: drivePrivacy.PUBLIC;
}

export interface IFileFolderEntity extends IEntity {
	driveId?: string;
	entityType: entityType.FOLDER | entityType.FILE | invalid;
	parentFolderId?: string;
	entityId?: string; // FIXME: move to IEntity (?
	lastModifiedDate?: number | invalid;
}

export type IPublicFileFolderEntity = IFileFolderEntity;

export type IPrivateFileFolderEntity = IFileFolderEntity & IPrivate;

export interface IFileData {
	appName?: string;
	appVersion?: string;
	contentType?: contentType | invalid;
	syncStatus?: syncStatus | invalid;
	txId?: string;
	unixTime?: number | invalid;
}

export type IPublicFileEntity = IFileData;

// export type IPrivateFileEntity = IFileData & IPrivate;

export class ArFSEntity<T extends IEntity>
	// extends ValidateArguments
	implements IEntity {
	appName: string = invalid; // The app that has submitted this entity.  Should not be longer than 64 characters.  eg. ArDrive-Web
	appVersion: string = invalid; // The app version that has submitted this entity.  Must not be longer than 8 digits, numbers only. eg. 0.1.14
	arFS: string = invalid; // The version of Arweave File System that is used for this entity.  Must not be longer than 4 digits. eg 0.11
	contentType: contentType | invalid = invalid; // the mime type of the file uploaded.  in the case of drives and folders, it is always a JSON file.  Public drive/folders must use "application/json" and priate drives use "application/octet-stream" since this data is encrypted.
	// driveId?: string; // the unique drive identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	entityType: entityType | invalid = invalid; // the type of ArFS entity this is.  this can only be set to "drive", "folder", "file"
	name: string = invalid; // user defined entity name, cannot be longer than 64 characters.  This is stored in the JSON file that is uploaded along with the drive/folder/file metadata transaction
	syncStatus: syncStatus | invalid = invalid; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	txId: string = invalid; // the arweave transaction id for this entity. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	unixTime: number | invalid = invalid; // seconds since unix epoch, taken at the time of upload, 10 numbers eg. 1620068042

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
	entityType = entityType.DRIVE;
	drivePrivacy: drivePrivacy | invalid = invalid; // identifies if this drive is public or private (and encrypted)  can only be "public" or "private"
	rootFolderId: string = invalid; // the uuid of the related drive root folder, stored in the JSON data that is uploaded with each Drive Entity metadata transaction
}

// An entity for a Private Drive entity with the extra privacy tags
export class ArFSPrivateDriveEntity extends ArFSDriveEntity<ArFSPrivateDriveEntity> implements IPrivateDriveEntity {
	drivePrivacy: drivePrivacy.PRIVATE = drivePrivacy.PRIVATE;
	driveAuthMode?: driveAuthMode; // used for future authentication schemes.  the only allowable value is "password"
	cipher: cipherType | invalid = invalid; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	cipherIV: string = invalid; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
}

export class ArFSPublicDriveEntity extends ArFSDriveEntity<ArFSPublicDriveEntity> implements IPublicDriveEntity {
	drivePrivacy: drivePrivacy.PUBLIC = drivePrivacy.PUBLIC;
}

// A Folder is a logical group of folders and files.  It contains a parent folder ID used to reference where this folder lives in the Drive hierarchy.
// Drive Root Folders must not have a parent folder ID, as they sit at the root of a drive.
// A File contains actual data, like a photo, document or movie.
// The File metadata transaction JSON references the File data transaction for retrieval.
// This separation allows for file metadata to be updated without requiring the file data to be reuploaded.
// NOTE: Files and Folders leverage the same entity type since they have the same properties
export class ArFSFileFolderEntity<T extends IFileFolderEntity> extends ArFSEntity<T> implements IFileFolderEntity {
	driveId: string = invalid;
	entityType: entityType.FOLDER | entityType.FILE | invalid = invalid;
	parentFolderId: string = invalid; // the uuid of the parent folder that this entity sits within.  Folder Entities used for the drive root must not have a parent folder ID, eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	entityId: string = invalid; // the unique folder identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	lastModifiedDate: number | invalid = invalid; // the last modified date of the file or folder as seconds since unix epoch
}

export class ArFSPublicFileFolderEntity
	extends ArFSFileFolderEntity<IPublicFileFolderEntity>
	implements IPublicFileFolderEntity {}

// Used for private Files/Folders only.
export class ArFSPrivateFileFolderEntity
	extends ArFSFileFolderEntity<ArFSPrivateFileFolderEntity>
	implements IFileFolderEntity, IPrivate {
	cipher: cipherType | invalid = invalid; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	cipherIV: string = invalid; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
}

// File entity metadata transactions do not include the actual File data they represent.
// Instead, the File data must be uploaded as a separate transaction, called the File data transaction.
export class ArFSPublicFileData implements IFileData {
	appName: string = invalid;
	appVersion: string = invalid;
	contentType: contentType | invalid = invalid;
	syncStatus: syncStatus | invalid = invalid;
	txId: string = invalid;
	unixTime: number | invalid = invalid;
}

export class ArFSPrivateFileData extends ArFSPublicDriveEntity implements IPrivate {
	cipher: cipherType | invalid = invalid;
	cipherIV: string = invalid;
}
