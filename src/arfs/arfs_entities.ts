/* eslint-disable @typescript-eslint/ban-ts-comment */
import { FolderHierarchy } from './folder_hierarchy';
import {
	CipherIV,
	DataContentType,
	DriveID,
	FileID,
	FolderID,
	ByteCount,
	JSON_CONTENT_TYPE,
	TransactionID,
	UnixTime,
	stubTransactionID,
	ContentType,
	DriveAuthMode,
	DrivePrivacy,
	EntityType,
	FileKey,
	DriveKey,
	EntityKey,
	EntityIDTypeForEntityType,
	CustomMetaDataGqlTags,
	CustomMetaDataJsonFields,
	FeeMultiple
} from '../types';
import { encryptedDataSize } from '../utils/common';
import { ENCRYPTED_DATA_PLACEHOLDER_TYPE } from '../utils/constants';

// The primary ArFS entity that all other entities inherit from.
export class ArFSEntity {
	readonly appName: string; // The app that has submitted this entity.  Should not be longer than 64 characters.  eg. ArDrive-Web
	readonly appVersion: string; // The app version that has submitted this entity.  Must not be longer than 8 digits, numbers only. eg. 0.1.14
	readonly arFS: string; // The version of Arweave File System that is used for this entity.  Must not be longer than 4 digits. eg 0.11
	readonly contentType: ContentType; // the mime type of the file uploaded.  in the case of drives and folders, it is always a JSON file.  Public drive/folders must use "application/json" and private drives use "application/octet-stream" since this data is encrypted.
	readonly driveId: DriveID; // the unique drive identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	readonly entityType: EntityType; // the type of ArFS entity this is.  this can only be set to "drive", "folder", "file"
	readonly name: string; // user defined entity name, cannot be longer than 64 characters.  This is stored in the JSON file that is uploaded along with the drive/folder/file metadata transaction
	readonly txId: TransactionID; // the arweave transaction id for this entity. 43 numbers/letters eg. 1xRhN90Mu5mEgyyrmnzKgZP0y3aK8AwSucwlCOAwsaI
	readonly unixTime: UnixTime; // seconds since unix epoch, taken at the time of upload, 10 numbers eg. 1620068042

	readonly boost?: FeeMultiple;

	readonly customMetaDataGqlTags?: CustomMetaDataGqlTags;
	readonly customMetaDataJson?: CustomMetaDataJsonFields;

	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		entityType: EntityType,
		name: string,
		txId: TransactionID,
		unixTime: UnixTime,
		boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		this.appName = appName;
		this.appVersion = appVersion;
		this.arFS = arFS;
		this.contentType = contentType;
		this.driveId = driveId;
		this.entityType = entityType;
		this.name = name;
		this.txId = txId;
		this.unixTime = unixTime;
		this.boost = boost;
		this.customMetaDataGqlTags = customMetaDataGqlTags;
		this.customMetaDataJson = customMetaDataJson;
	}
}

// A Drive is a logical grouping of folders and files. All folders and files must be part of a drive, and reference the Drive ID.
// When creating a Drive, a corresponding folder must be created as well. This folder will act as the Drive Root Folder.
// This separation of drive and folder entity enables features such as folder view queries.
export interface ArFSDriveEntity extends ArFSEntity {
	drivePrivacy: string; // identifies if this drive is public or private (and encrypted)  can only be "public" or "private"
	rootFolderId: FolderID | ENCRYPTED_DATA_PLACEHOLDER_TYPE; // the uuid of the related drive root folder, stored in the JSON data that is uploaded with each Drive Entity metadata transaction
}

export class ArFSPublicDrive extends ArFSEntity implements ArFSDriveEntity {
	constructor(
		readonly appName: string,
		readonly appVersion: string,
		readonly arFS: string,
		readonly contentType: ContentType,
		readonly driveId: DriveID,
		readonly entityType: EntityType,
		readonly name: string,
		readonly txId: TransactionID,
		readonly unixTime: UnixTime,
		readonly drivePrivacy: DrivePrivacy,
		readonly rootFolderId: FolderID,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			entityType,
			name,
			txId,
			unixTime,
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
	}
}

export class ArFSPrivateDrive extends ArFSEntity implements ArFSDriveEntity {
	constructor(
		readonly appName: string,
		readonly appVersion: string,
		readonly arFS: string,
		readonly contentType: ContentType,
		readonly driveId: DriveID,
		readonly entityType: EntityType,
		readonly name: string,
		readonly txId: TransactionID,
		readonly unixTime: UnixTime,
		readonly drivePrivacy: DrivePrivacy,
		readonly rootFolderId: FolderID,
		readonly driveAuthMode: DriveAuthMode,
		readonly cipher: string,
		readonly cipherIV: CipherIV,
		readonly driveKey: DriveKey,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			entityType,
			name,
			txId,
			unixTime,
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
	}
}

export class ArFSPrivateDriveKeyless extends ArFSPrivateDrive {
	driveKey: never;

	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		entityType: EntityType,
		name: string,
		txId: TransactionID,
		unixTime: UnixTime,
		drivePrivacy: DrivePrivacy,
		rootFolderId: FolderID,
		driveAuthMode: DriveAuthMode,
		cipher: string,
		cipherIV: CipherIV,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			entityType,
			name,
			txId,
			unixTime,
			drivePrivacy,
			rootFolderId,
			driveAuthMode,
			cipher,
			cipherIV,
			new EntityKey(Buffer.from([])),
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
		// @ts-expect-error
		delete this.driveKey;
	}
}

// A Folder is a logical group of folders and files.  It contains a parent folder ID used to reference where this folder lives in the Drive hierarchy.
// Drive Root Folders must not have a parent folder ID, as they sit at the root of a drive.
// A File contains actual data, like a photo, document or movie.
// The File metadata transaction JSON references the File data transaction for retrieval.
// This separation allows for file metadata to be updated without requiring the file data to be re-uploaded.
// Files and Folders leverage the same entity type since they have the same properties
export interface ArFSFileFolderEntity extends ArFSEntity {
	parentFolderId: FolderID; // the uuid of the parent folder that this entity sits within.  Folder Entities used for the drive root must not have a parent folder ID, eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	entityId: FileID | FolderID; // the unique file or folder identifier, created with uuidv4 https://www.npmjs.com/package/uuidv4 eg. 41800747-a852-4dc9-9078-6c20f85c0f3a
	lastModifiedDate: UnixTime; // the last modified date of the file or folder as seconds since unix epoch
}

// prettier-ignore
export abstract class ArFSFileOrFolderEntity<T extends 'file' | 'folder'>
	extends ArFSEntity implements ArFSFileFolderEntity
{
	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		readonly entityType: T,
		name: string,
		public size: ByteCount,
		txId: TransactionID,
		unixTime: UnixTime,
		public lastModifiedDate: UnixTime,
		public dataTxId: TransactionID,
		public dataContentType: DataContentType,
		readonly parentFolderId: FolderID,
		readonly entityId: EntityIDTypeForEntityType<T>,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, boost, customMetaDataGqlTags, customMetaDataJson);
	}
}

export function publicEntityWithPathsFactory(
	entity: ArFSPublicFolder | ArFSPublicFile,
	hierarchy: FolderHierarchy
): ArFSPublicFolderWithPaths | ArFSPublicFileWithPaths {
	if (entity.entityType === 'folder') {
		return new ArFSPublicFolderWithPaths(entity, hierarchy);
	}
	return new ArFSPublicFileWithPaths(entity, hierarchy);
}

export function privateEntityWithPathsFactory(
	entity: ArFSPrivateFolder | ArFSPrivateFile,
	hierarchy: FolderHierarchy
): ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths {
	if (entity.entityType === 'folder') {
		return new ArFSPrivateFolderWithPaths(entity, hierarchy);
	}
	return new ArFSPrivateFileWithPaths(entity, hierarchy);
}

export function privateEntityWithPathsKeylessFactory(
	entity: ArFSPrivateFolder | ArFSPrivateFile,
	hierarchy: FolderHierarchy
): ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths {
	if (entity.entityType === 'folder') {
		return new ArFSPrivateFolderWithPathsKeyless(entity, hierarchy);
	}
	return new ArFSPrivateFileWithPathsKeyless(entity, hierarchy);
}

export interface ArFSWithPath {
	readonly path: string;
	readonly txIdPath: string;
	readonly entityIdPath: string;
}

export class ArFSPublicFile extends ArFSFileOrFolderEntity<'file'> {
	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		name: string,
		txId: TransactionID,
		unixTime: UnixTime,
		parentFolderId: FolderID,
		readonly fileId: FileID,
		size: ByteCount,
		lastModifiedDate: UnixTime,
		dataTxId: TransactionID,
		dataContentType: DataContentType,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			'file',
			name,
			size,
			txId,
			unixTime,
			lastModifiedDate,
			dataTxId,
			dataContentType,
			parentFolderId,
			fileId,
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
	}
}

export class ArFSPublicFileWithPaths extends ArFSPublicFile implements ArFSWithPath {
	readonly path: string;
	readonly txIdPath: string;
	readonly entityIdPath: string;

	constructor(entity: ArFSPublicFile, hierarchy: FolderHierarchy) {
		super(
			entity.appName,
			entity.appVersion,
			entity.arFS,
			entity.contentType,
			entity.driveId,
			entity.name,
			entity.txId,
			entity.unixTime,
			entity.parentFolderId,
			entity.fileId,
			entity.size,
			entity.lastModifiedDate,
			entity.dataTxId,
			entity.dataContentType,
			entity.boost,
			entity.customMetaDataGqlTags,
			entity.customMetaDataJson
		);

		this.path = `${hierarchy.pathToFolderId(entity.parentFolderId)}${entity.name}`;
		this.txIdPath = `${hierarchy.txPathToFolderId(entity.parentFolderId)}${entity.txId}`;
		this.entityIdPath = `${hierarchy.entityPathToFolderId(entity.parentFolderId)}${entity.fileId}`;
	}
}

export class ArFSPrivateFile extends ArFSFileOrFolderEntity<'file'> {
	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		name: string,
		txId: TransactionID,
		unixTime: UnixTime,
		parentFolderId: FolderID,
		readonly fileId: FileID,
		size: ByteCount,
		lastModifiedDate: UnixTime,
		dataTxId: TransactionID,
		dataContentType: DataContentType,
		readonly cipher: string,
		readonly cipherIV: CipherIV,
		readonly fileKey: FileKey,
		readonly driveKey: DriveKey,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			'file',
			name,
			size,
			txId,
			unixTime,
			lastModifiedDate,
			dataTxId,
			dataContentType,
			parentFolderId,
			fileId,
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
	}

	get encryptedDataSize(): ByteCount {
		return encryptedDataSize(this.size);
	}
}

export class ArFSPrivateFileWithPaths extends ArFSPrivateFile implements ArFSWithPath {
	readonly path: string;
	readonly txIdPath: string;
	readonly entityIdPath: string;

	constructor(entity: ArFSPrivateFile, hierarchy: FolderHierarchy) {
		super(
			entity.appName,
			entity.appVersion,
			entity.arFS,
			entity.contentType,
			entity.driveId,
			entity.name,
			entity.txId,
			entity.unixTime,
			entity.parentFolderId,
			entity.fileId,
			entity.size,
			entity.lastModifiedDate,
			entity.dataTxId,
			entity.dataContentType,
			entity.cipher,
			entity.cipherIV,
			entity.fileKey,
			entity.driveKey,
			entity.boost,
			entity.customMetaDataGqlTags,
			entity.customMetaDataJson
		);

		this.path = `${hierarchy.pathToFolderId(entity.parentFolderId)}${entity.name}`;
		this.txIdPath = `${hierarchy.txPathToFolderId(entity.parentFolderId)}${entity.txId}`;
		this.entityIdPath = `${hierarchy.entityPathToFolderId(entity.parentFolderId)}${entity.fileId}`;
	}
}

export class ArFSPrivateFileWithPathsKeyless extends ArFSPrivateFileWithPaths {
	driveKey: never;
	fileKey: never;

	constructor(entity: ArFSPrivateFile, hierarchy: FolderHierarchy) {
		super(entity, hierarchy);
		// @ts-expect-error
		delete this.driveKey;
		// @ts-expect-error
		delete this.fileKey;
	}
}

// Remove me after PE-1027 is applied
export class ArFSPrivateFileKeyless extends ArFSPrivateFile {
	driveKey: never;
	fileKey: never;

	constructor(entity: ArFSPrivateFile) {
		super(
			entity.appName,
			entity.appVersion,
			entity.arFS,
			entity.contentType,
			entity.driveId,
			entity.name,
			entity.txId,
			entity.unixTime,
			entity.parentFolderId,
			entity.fileId,
			entity.size,
			entity.lastModifiedDate,
			entity.dataTxId,
			entity.dataContentType,
			entity.cipher,
			entity.cipherIV,
			entity.fileKey,
			entity.driveKey,
			entity.boost,
			entity.customMetaDataGqlTags,
			entity.customMetaDataJson
		);
		// @ts-expect-error
		delete this.driveKey;
		// @ts-expect-error
		delete this.fileKey;
	}
}

export class ArFSPublicFolder extends ArFSFileOrFolderEntity<'folder'> {
	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		name: string,
		txId: TransactionID,
		unixTime: UnixTime,
		parentFolderId: FolderID,
		readonly folderId: FolderID,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			'folder',
			name,
			new ByteCount(0),
			txId,
			unixTime,
			new UnixTime(0),
			stubTransactionID,
			JSON_CONTENT_TYPE,
			parentFolderId,
			folderId,
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
	}
}

export class ArFSPublicFolderWithPaths extends ArFSPublicFolder implements ArFSWithPath {
	readonly path: string;
	readonly txIdPath: string;
	readonly entityIdPath: string;

	constructor(entity: ArFSPublicFolder, hierarchy: FolderHierarchy) {
		super(
			entity.appName,
			entity.appVersion,
			entity.arFS,
			entity.contentType,
			entity.driveId,
			entity.name,
			entity.txId,
			entity.unixTime,
			entity.parentFolderId,
			entity.folderId,
			entity.boost,
			entity.customMetaDataGqlTags,
			entity.customMetaDataJson
		);

		this.path = `${hierarchy.pathToFolderId(entity.parentFolderId)}${entity.name}`;
		this.txIdPath = `${hierarchy.txPathToFolderId(entity.parentFolderId)}${entity.txId}`;
		this.entityIdPath = `${hierarchy.entityPathToFolderId(entity.parentFolderId)}${entity.folderId}`;
	}
}

export class ArFSPrivateFolder extends ArFSFileOrFolderEntity<'folder'> {
	constructor(
		appName: string,
		appVersion: string,
		arFS: string,
		contentType: ContentType,
		driveId: DriveID,
		name: string,
		txId: TransactionID,
		unixTime: UnixTime,
		parentFolderId: FolderID,
		readonly folderId: FolderID,
		readonly cipher: string,
		readonly cipherIV: CipherIV,
		readonly driveKey: DriveKey,
		readonly boost?: FeeMultiple,
		customMetaDataGqlTags?: CustomMetaDataGqlTags,
		customMetaDataJson?: CustomMetaDataJsonFields
	) {
		super(
			appName,
			appVersion,
			arFS,
			contentType,
			driveId,
			'folder',
			name,
			new ByteCount(0),
			txId,
			unixTime,
			new UnixTime(0),
			stubTransactionID,
			JSON_CONTENT_TYPE,
			parentFolderId,
			folderId,
			boost,
			customMetaDataGqlTags,
			customMetaDataJson
		);
	}
}

export class ArFSPrivateFolderWithPaths extends ArFSPrivateFolder implements ArFSWithPath {
	readonly path: string;
	readonly txIdPath: string;
	readonly entityIdPath: string;

	constructor(entity: ArFSPrivateFolder, hierarchy: FolderHierarchy) {
		super(
			entity.appName,
			entity.appVersion,
			entity.arFS,
			entity.contentType,
			entity.driveId,
			entity.name,
			entity.txId,
			entity.unixTime,
			entity.parentFolderId,
			entity.folderId,
			entity.cipher,
			entity.cipherIV,
			entity.driveKey,
			entity.boost,
			entity.customMetaDataGqlTags,
			entity.customMetaDataJson
		);

		this.path = `${hierarchy.pathToFolderId(entity.parentFolderId)}${entity.name}`;
		this.txIdPath = `${hierarchy.txPathToFolderId(entity.parentFolderId)}${entity.txId}`;
		this.entityIdPath = `${hierarchy.entityPathToFolderId(entity.parentFolderId)}${entity.folderId}`;
	}
}

export class ArFSPrivateFolderWithPathsKeyless extends ArFSPrivateFolderWithPaths {
	driveKey: never;

	constructor(entity: ArFSPrivateFolder, hierarchy: FolderHierarchy) {
		super(entity, hierarchy);
		// @ts-expect-error
		delete this.driveKey;
	}
}

// Remove me after PE-1027 is applied
export class ArFSPrivateFolderKeyless extends ArFSPrivateFolder {
	driveKey: never;

	constructor(entity: ArFSPrivateFolder) {
		super(
			entity.appName,
			entity.appVersion,
			entity.arFS,
			entity.contentType,
			entity.driveId,
			entity.name,
			entity.txId,
			entity.unixTime,
			entity.parentFolderId,
			entity.folderId,
			entity.cipher,
			entity.cipherIV,
			entity.driveKey,
			entity.boost,
			entity.customMetaDataGqlTags,
			entity.customMetaDataJson
		);
		// @ts-expect-error
		delete this.driveKey;
	}
}
