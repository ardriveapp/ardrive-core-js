/// <reference types="node" />
import { CipherIV, DataContentType, DriveKey, FileID, FileKey, FolderID, ByteCount, TransactionID, UnixTime, CipherType, DriveAuthMode } from '../types';
export interface ArFSObjectTransactionData {
    asTransactionData(): string | Buffer;
    sizeOf(): ByteCount;
}
export declare abstract class ArFSDriveTransactionData implements ArFSObjectTransactionData {
    abstract asTransactionData(): string | Buffer;
    sizeOf(): ByteCount;
}
export declare class ArFSPublicDriveTransactionData extends ArFSDriveTransactionData {
    private readonly name;
    private readonly rootFolderId;
    constructor(name: string, rootFolderId: FolderID);
    asTransactionData(): string;
}
export declare class ArFSPrivateDriveTransactionData extends ArFSDriveTransactionData {
    readonly cipher: CipherType;
    readonly cipherIV: CipherIV;
    readonly encryptedDriveData: Buffer;
    readonly driveKey: DriveKey;
    readonly driveAuthMode: DriveAuthMode;
    private constructor();
    static from(name: string, rootFolderId: FolderID, driveKey: DriveKey): Promise<ArFSPrivateDriveTransactionData>;
    asTransactionData(): Buffer;
}
export declare abstract class ArFSFolderTransactionData implements ArFSObjectTransactionData {
    abstract asTransactionData(): string | Buffer;
    sizeOf(): ByteCount;
}
export declare class ArFSPublicFolderTransactionData extends ArFSFolderTransactionData {
    private readonly name;
    constructor(name: string);
    asTransactionData(): string;
}
export declare class ArFSPrivateFolderTransactionData extends ArFSFolderTransactionData {
    readonly name: string;
    readonly cipher: CipherType;
    readonly cipherIV: CipherIV;
    readonly encryptedFolderData: Buffer;
    readonly driveKey: DriveKey;
    private constructor();
    static from(name: string, driveKey: DriveKey): Promise<ArFSPrivateFolderTransactionData>;
    asTransactionData(): Buffer;
}
export declare abstract class ArFSFileMetadataTransactionData implements ArFSObjectTransactionData {
    abstract asTransactionData(): string | Buffer;
    sizeOf(): ByteCount;
}
export declare class ArFSPublicFileMetadataTransactionData extends ArFSFileMetadataTransactionData {
    private readonly name;
    private readonly size;
    private readonly lastModifiedDate;
    private readonly dataTxId;
    private readonly dataContentType;
    constructor(name: string, size: ByteCount, lastModifiedDate: UnixTime, dataTxId: TransactionID, dataContentType: DataContentType);
    asTransactionData(): string;
}
export declare class ArFSPrivateFileMetadataTransactionData extends ArFSFileMetadataTransactionData {
    readonly cipher: CipherType;
    readonly cipherIV: CipherIV;
    readonly encryptedFileMetadata: Buffer;
    readonly fileKey: FileKey;
    readonly driveAuthMode: DriveAuthMode;
    private constructor();
    static from(name: string, size: ByteCount, lastModifiedDate: UnixTime, dataTxId: TransactionID, dataContentType: DataContentType, fileId: FileID, driveKey: DriveKey): Promise<ArFSPrivateFileMetadataTransactionData>;
    asTransactionData(): Buffer;
}
export declare abstract class ArFSFileDataTransactionData implements ArFSObjectTransactionData {
    abstract asTransactionData(): string | Buffer;
    sizeOf(): ByteCount;
}
export declare class ArFSPublicFileDataTransactionData extends ArFSFileDataTransactionData {
    private readonly fileData;
    constructor(fileData: Buffer);
    asTransactionData(): Buffer;
}
export declare class ArFSPrivateFileDataTransactionData extends ArFSFileDataTransactionData {
    readonly cipher: CipherType;
    readonly cipherIV: CipherIV;
    readonly encryptedFileData: Buffer;
    readonly driveAuthMode: DriveAuthMode;
    private constructor();
    static from(fileData: Buffer, fileId: FileID, driveKey: DriveKey): Promise<ArFSPrivateFileDataTransactionData>;
    asTransactionData(): string | Buffer;
}
