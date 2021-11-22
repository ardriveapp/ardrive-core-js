import { FolderHierarchy } from './folderHierarchy';
import { CipherIV, DataContentType, DriveID, AnyEntityID, FileID, FolderID, ByteCount, TransactionID, UnixTime, ContentType, DriveAuthMode, DrivePrivacy, EntityType } from '../types';
export declare class ArFSEntity {
    appName: string;
    appVersion: string;
    arFS: string;
    contentType: string;
    driveId: DriveID;
    entityType: string;
    name: string;
    txId: TransactionID;
    unixTime: UnixTime;
    constructor(appName: string, appVersion: string, arFS: string, contentType: string, driveId: DriveID, entityType: string, name: string, txId: TransactionID, unixTime: UnixTime);
}
export declare const ENCRYPTED_DATA_PLACEHOLDER = "ENCRYPTED";
export declare type ENCRYPTED_DATA_PLACEHOLDER_TYPE = 'ENCRYPTED';
export interface ArFSDriveEntity extends ArFSEntity {
    drivePrivacy: string;
    rootFolderId: FolderID | ENCRYPTED_DATA_PLACEHOLDER_TYPE;
}
export declare class ArFSPublicDrive extends ArFSEntity implements ArFSDriveEntity {
    readonly appName: string;
    readonly appVersion: string;
    readonly arFS: string;
    readonly contentType: ContentType;
    readonly driveId: DriveID;
    readonly entityType: EntityType;
    readonly name: string;
    readonly txId: TransactionID;
    readonly unixTime: UnixTime;
    readonly drivePrivacy: DrivePrivacy;
    readonly rootFolderId: FolderID;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, txId: TransactionID, unixTime: UnixTime, drivePrivacy: DrivePrivacy, rootFolderId: FolderID);
}
export declare class ArFSPrivateDrive extends ArFSEntity implements ArFSDriveEntity {
    readonly appName: string;
    readonly appVersion: string;
    readonly arFS: string;
    readonly contentType: ContentType;
    readonly driveId: DriveID;
    readonly entityType: EntityType;
    readonly name: string;
    readonly txId: TransactionID;
    readonly unixTime: UnixTime;
    readonly drivePrivacy: DrivePrivacy;
    readonly rootFolderId: FolderID;
    readonly driveAuthMode: DriveAuthMode;
    readonly cipher: string;
    readonly cipherIV: CipherIV;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, txId: TransactionID, unixTime: UnixTime, drivePrivacy: DrivePrivacy, rootFolderId: FolderID, driveAuthMode: DriveAuthMode, cipher: string, cipherIV: CipherIV);
}
export interface ArFSFileFolderEntity extends ArFSEntity {
    parentFolderId: FolderID;
    entityId: FileID | FolderID;
    lastModifiedDate: UnixTime;
}
export declare class ArFSFileOrFolderEntity extends ArFSEntity implements ArFSFileFolderEntity {
    size: ByteCount;
    lastModifiedDate: UnixTime;
    dataTxId: TransactionID;
    dataContentType: DataContentType;
    readonly parentFolderId: FolderID;
    readonly entityId: AnyEntityID;
    folderId?: FolderID;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, size: ByteCount, txId: TransactionID, unixTime: UnixTime, lastModifiedDate: UnixTime, dataTxId: TransactionID, dataContentType: DataContentType, parentFolderId: FolderID, entityId: AnyEntityID);
}
export interface ArFSWithPath {
    readonly path: string;
    readonly txIdPath: string;
    readonly entityIdPath: string;
}
export declare class ArFSPublicFileOrFolderWithPaths extends ArFSFileOrFolderEntity implements ArFSWithPath {
    readonly path: string;
    readonly txIdPath: string;
    readonly entityIdPath: string;
    constructor(entity: ArFSPublicFile | ArFSPublicFolder, hierarchy: FolderHierarchy);
}
export declare class ArFSPrivateFileOrFolderWithPaths extends ArFSFileOrFolderEntity implements ArFSWithPath {
    readonly cipher: string;
    readonly cipherIV: CipherIV;
    readonly path: string;
    readonly txIdPath: string;
    readonly entityIdPath: string;
    constructor(entity: ArFSPrivateFile | ArFSPrivateFolder, hierarchy: FolderHierarchy);
}
export declare class ArFSPublicFile extends ArFSFileOrFolderEntity {
    readonly appName: string;
    readonly appVersion: string;
    readonly arFS: string;
    readonly contentType: ContentType;
    readonly driveId: DriveID;
    readonly entityType: EntityType;
    readonly name: string;
    readonly txId: TransactionID;
    readonly unixTime: UnixTime;
    readonly parentFolderId: FolderID;
    readonly fileId: FileID;
    readonly size: ByteCount;
    readonly lastModifiedDate: UnixTime;
    readonly dataTxId: TransactionID;
    readonly dataContentType: DataContentType;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, txId: TransactionID, unixTime: UnixTime, parentFolderId: FolderID, fileId: FileID, size: ByteCount, lastModifiedDate: UnixTime, dataTxId: TransactionID, dataContentType: DataContentType);
}
export declare class ArFSPrivateFile extends ArFSFileOrFolderEntity {
    readonly appName: string;
    readonly appVersion: string;
    readonly arFS: string;
    readonly contentType: ContentType;
    readonly driveId: DriveID;
    readonly entityType: EntityType;
    readonly name: string;
    readonly txId: TransactionID;
    readonly unixTime: UnixTime;
    readonly parentFolderId: FolderID;
    readonly fileId: FileID;
    readonly size: ByteCount;
    readonly lastModifiedDate: UnixTime;
    readonly dataTxId: TransactionID;
    readonly dataContentType: DataContentType;
    readonly cipher: string;
    readonly cipherIV: CipherIV;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, txId: TransactionID, unixTime: UnixTime, parentFolderId: FolderID, fileId: FileID, size: ByteCount, lastModifiedDate: UnixTime, dataTxId: TransactionID, dataContentType: DataContentType, cipher: string, cipherIV: CipherIV);
}
export declare class ArFSPublicFolder extends ArFSFileOrFolderEntity {
    readonly appName: string;
    readonly appVersion: string;
    readonly arFS: string;
    readonly contentType: ContentType;
    readonly driveId: DriveID;
    readonly entityType: EntityType;
    readonly name: string;
    readonly txId: TransactionID;
    readonly unixTime: UnixTime;
    readonly parentFolderId: FolderID;
    readonly entityId: FolderID;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, txId: TransactionID, unixTime: UnixTime, parentFolderId: FolderID, entityId: FolderID);
}
export declare class ArFSPrivateFolder extends ArFSFileOrFolderEntity {
    readonly appName: string;
    readonly appVersion: string;
    readonly arFS: string;
    readonly contentType: ContentType;
    readonly driveId: DriveID;
    readonly entityType: EntityType;
    readonly name: string;
    readonly txId: TransactionID;
    readonly unixTime: UnixTime;
    readonly parentFolderId: FolderID;
    readonly entityId: FolderID;
    readonly cipher: string;
    readonly cipherIV: CipherIV;
    constructor(appName: string, appVersion: string, arFS: string, contentType: ContentType, driveId: DriveID, entityType: EntityType, name: string, txId: TransactionID, unixTime: UnixTime, parentFolderId: FolderID, entityId: FolderID, cipher: string, cipherIV: CipherIV);
}
