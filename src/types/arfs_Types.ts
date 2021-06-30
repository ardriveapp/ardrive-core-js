import { PrivacyToContentType } from './type_conditionals';
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
	PublicType,
	driveAuthModeValues
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
	driveId?: string;
	entityId?: string;
	entityType?: EntityType;
	name?: string;
	syncStatus?: SyncStatus;
	txId?: string;
	unixTime?: number;
}

export interface IPrivate {
	cipher?: CipherType;
	cipherIV?: string;
}

export type IDriveEntity<P extends DrivePrivacy> = Partial<ArFSDriveEntity<P>>;

export type IPrivateDriveEntity = IDriveEntity<PrivateType>;

export type IPublicDriveEntity = IDriveEntity<PublicType>;

export type IFileFolderEntity<P extends DrivePrivacy> = Partial<ArFSFileFolderEntity<P>>;

export type IPublicFileFolderEntity = IFileFolderEntity<PublicType>;

export type IPrivateFileFolderEntity = IFileFolderEntity<PrivateType>;

export type IFileData<P extends DrivePrivacy> = Partial<ArFSFileData<P>>;

export type IPublicFileEntity = IFileData<PublicType>;

// export type IPrivateFileEntity = IFileData<PrivateType>;

export abstract class ArFSEntity<T extends IEntity> implements IEntity {
	public appName = this.template.appName || ''; // The app that has submitted this entity.  Should not be longer than 64 characters.  eg. ArDrive-Web
	public appVersion = this.template.appVersion || ''; // The app version that has submitted this entity.  Must not be longer than 8 digits, numbers only. eg. 0.1.14
	public arFS = this.template.arFS || ''; // The version of Arweave File System that is used for this entity.  Must not be longer than 4 digits. eg 0.11
	public abstract contentType: ContentType; // the mime type of the file uploaded.  in the case of drives and folders, it is always a JSON file.  Public drive/folders must use "application/json" and priate drives use "application/octet-stream" since this data is encrypted.
	public driveId: string = this.template.driveId || ''; // the unique drive identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	public abstract entityType?: EntityType; // the type of ArFS entity this is.  this can only be set to "drive", "folder", "file"
	public name = this.template.name || ''; // user defined entity name, cannot be longer than 64 characters.  This is stored in the JSON file that is uploaded along with the drive/folder/file metadata transaction
	public syncStatus: SyncStatus = this.template.syncStatus || syncStatusValues.READY_TO_DOWNLOAD; // the status of this transaction.  0 = 'ready to download', 1 = 'ready to upload', 2 = 'getting mined', 3 = 'successfully uploaded'
	public txId = this.template.txId || ''; // the arweave transaction id for this entity. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	public unixTime = this.template.unixTime || 0; // seconds since unix epoch, taken at the time of upload, 10 numbers eg. 1620068042

	constructor(protected readonly template = {} as T) {
		this.syncStatus = Number(this.syncStatus) as SyncStatus;
		this.unixTime = Number(this.unixTime);
	}
}

// A Drive is a logical grouping of folders and files. All folders and files must be part of a drive, and reference the Drive ID.
// When creating a Drive, a corresponding folder must be created as well. This folder will act as the Drive Root Folder.
// This seperation of drive and folder entity enables features such as folder view queries.
export abstract class ArFSDriveEntity<P extends DrivePrivacy> extends ArFSEntity<IDriveEntity<P>> {
	public cipher?: CipherType; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	public cipherIV?: string; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
	public abstract contentType: PrivacyToContentType<P>;
	public driveId: string = this.template.driveId || '';
	public abstract drivePrivacy: P; // identifies if this drive is public or private (and encrypted)  can only be "public" or "private"
	public driveAuthMode?: DriveAuthMode;
	public readonly entityType = entityTypeValues.DRIVE;
	public rootFolderId: string = this.template.rootFolderId || ''; // the uuid of the related drive root folder, stored in the JSON data that is uploaded with each Drive Entity metadata transaction
}

// An entity for a Private Drive entity with the extra privacy tags
export class ArFSPrivateDriveEntity extends ArFSDriveEntity<PrivateType> implements IPrivateDriveEntity {
	public readonly contentType = contentTypeValues.APPLICATION_OCTET_STREAM;
	public readonly drivePrivacy: PrivateType = drivePrivacyValues.PRIVATE;
	public readonly driveAuthMode: DriveAuthMode = driveAuthModeValues.PASSWORD; // used for future authentication schemes.  the only allowable value is "password"
	public cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	public cipherIV = this.template.cipherIV || ''; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
}

export class ArFSPublicDriveEntity extends ArFSDriveEntity<PublicType> implements IPublicDriveEntity {
	public readonly contentType = contentTypeValues.APPLICATION_JSON;
	public readonly drivePrivacy: PublicType = drivePrivacyValues.PUBLIC;
}

// A Folder is a logical group of folders and files.  It contains a parent folder ID used to reference where this folder lives in the Drive hierarchy.
// Drive Root Folders must not have a parent folder ID, as they sit at the root of a drive.
// A File contains actual data, like a photo, document or movie.
// The File metadata transaction JSON references the File data transaction for retrieval.
// This separation allows for file metadata to be updated without requiring the file data to be reuploaded.
// NOTE: Files and Folders leverage the same entity type since they have the same properties
export abstract class ArFSFileFolderEntity<P extends DrivePrivacy> extends ArFSEntity<IFileFolderEntity<P>> {
	public driveId: string = this.template.driveId || '';
	public entityType: FileFolderEntityType = this.template.entityType || entityTypeValues.FILE;
	public parentFolderId: string = this.template.parentFolderId || ''; // the uuid of the parent folder that this entity sits within.  Folder Entities used for the drive root must not have a parent folder ID, eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	public entityId: string = this.template.entityId || ''; // the unique folder identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	public lastModifiedDate: number = this.template.lastModifiedDate || 0; // the last modified date of the file or folder as seconds since unix epoch

	public cipher?: CipherType;
	public cipherIV?: string;

	constructor(template: IFileFolderEntity<P> = {} as IFileFolderEntity<P>) {
		super(template);
		this.lastModifiedDate = Number(this.lastModifiedDate);
	}
}

export class ArFSPublicFileFolderEntity extends ArFSFileFolderEntity<PublicType> implements IPublicFileFolderEntity {
	readonly contentType = contentTypeValues.APPLICATION_JSON;
}

// Used for private Files/Folders only.
export class ArFSPrivateFileFolderEntity extends ArFSFileFolderEntity<PrivateType> {
	public readonly contentType = contentTypeValues.APPLICATION_OCTET_STREAM;
	public cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM; // The ArFS Cipher used.  Only available cipher is AES256-GCM
	public cipherIV = this.template.cipherIV || ''; // The cipher initialization vector used for encryption, 12 bytes as base 64, 16 characters. eg YJxNOmlg0RWuMHij
}

// File entity metadata transactions do not include the actual File data they represent.
// Instead, the File data must be uploaded as a separate transaction, called the File data transaction.
export class ArFSFileData<P extends DrivePrivacy> {
	public appName: string = this.template.appName || '';
	public appVersion: string = this.template.appVersion || '';
	public contentType: ContentType = this.template.contentType || contentTypeValues.APPLICATION_JSON;
	public syncStatus: SyncStatus = this.template.syncStatus || syncStatusValues.READY_TO_DOWNLOAD;
	public txId: string = this.template.txId || '';
	public unixTime: number = this.template.unixTime || 0;

	public cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM;
	public cipherIV: string = this.template.cipherIV || '';

	constructor(protected template: IFileData<P> = {}) {}
}

export class ArFSPublicFileData extends ArFSFileData<PublicType> {}

export class ArFSPrivateFileData extends ArFSFileData<PrivateType> {
	public cipher: CipherType = this.template.cipher || cipherTypeValues.AES_256_GCM;
	public cipherIV = this.template.cipherIV || '';
}
