/// <reference types="node" />
import * as fs from 'fs';
import { ByteCount, DataContentType, UnixTime, FileID, FolderID, Manifest } from '../types';
import { BulkFileBaseCosts, MetaDataBaseCosts } from '../types';
import { EntityNamesAndIds } from '../utils/mapper_functions';
declare type BaseFileName = string;
declare type FilePath = string;
export interface FileInfo {
    dataContentType: DataContentType;
    lastModifiedDateMS: UnixTime;
    fileSize: ByteCount;
}
/**
 * Reads stats of a file or folder  and constructs a File or Folder wrapper class
 *
 * @remarks import and use `isFolder` type-guard to later determine whether a folder or file
 *
 * @example
 *
 * const fileOrFolder = wrapFileOrFolder(myFilePath);
 *
 * if (isFolder(fileOrFolder)) {
 * 	// Type is: Folder
 * } else {
 * 	// Type is: File
 * }
 *
 */
export declare function wrapFileOrFolder(fileOrFolderPath: FilePath): ArFSFileToUpload | ArFSFolderToUpload;
/** Type-guard function to determine if returned class is a File or Folder */
export declare function isFolder(fileOrFolder: ArFSFileToUpload | ArFSFolderToUpload): fileOrFolder is ArFSFolderToUpload;
export interface ArFSEntityToUpload {
    gatherFileInfo: () => FileInfo;
    getFileDataBuffer: () => Buffer;
    getBaseFileName: () => BaseFileName;
}
export declare class ArFSManifestToUpload implements ArFSEntityToUpload {
    readonly manifest: Manifest;
    constructor(manifest: Manifest);
    gatherFileInfo(): FileInfo;
    getBaseFileName(): BaseFileName;
    getFileDataBuffer(): Buffer;
    get size(): ByteCount;
}
export declare class ArFSFileToUpload implements ArFSEntityToUpload {
    readonly filePath: FilePath;
    readonly fileStats: fs.Stats;
    constructor(filePath: FilePath, fileStats: fs.Stats);
    baseCosts?: BulkFileBaseCosts;
    existingId?: FileID;
    existingFolderAtDestConflict: boolean;
    hasSameLastModifiedDate: boolean;
    gatherFileInfo(): FileInfo;
    get size(): ByteCount;
    get lastModifiedDate(): UnixTime;
    getBaseCosts(): BulkFileBaseCosts;
    getFileDataBuffer(): Buffer;
    get contentType(): DataContentType;
    getBaseFileName(): BaseFileName;
    /** Computes the size of a private file encrypted with AES256-GCM */
    encryptedDataSize(): ByteCount;
}
export declare class ArFSFolderToUpload {
    readonly filePath: FilePath;
    readonly fileStats: fs.Stats;
    files: ArFSFileToUpload[];
    folders: ArFSFolderToUpload[];
    baseCosts?: MetaDataBaseCosts;
    existingId?: FolderID;
    destinationName?: string;
    existingFileAtDestConflict: boolean;
    constructor(filePath: FilePath, fileStats: fs.Stats);
    checkAndAssignExistingNames(getExistingNamesFn: (parentFolderId: FolderID) => Promise<EntityNamesAndIds>): Promise<void>;
    getBaseCosts(): MetaDataBaseCosts;
    getBaseFileName(): BaseFileName;
    getTotalByteCount(encrypted?: boolean): ByteCount;
}
export {};
