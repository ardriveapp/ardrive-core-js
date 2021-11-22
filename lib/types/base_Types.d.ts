/// <reference types="node" />
import * as guards from './type_guards';
export interface ArDriveUser {
    login: string;
    dataProtectionKey: string;
    walletPrivateKey: string;
    walletPublicKey: string;
    syncFolderPath: string;
    autoSyncApproval: number;
}
export interface UploadBatch {
    totalArDrivePrice: number;
    totalUSDPrice: number;
    totalSize: string;
    totalNumberOfFileUploads: number;
    totalNumberOfMetaDataUploads: number;
    totalNumberOfFolderUploads: number;
}
export interface ArFSRootFolderMetaData {
    metaDataTxId: string;
    cipher: guards.CipherType | '';
    cipherIV: string;
}
export interface ArDriveBundle {
    id: number;
    login: string;
    bundleTxId: string;
    bundleSyncStatus: number;
    uploadTime: number;
}
export interface ArFSDriveMetaDataParameters {
    id: number;
    login?: string;
    appName: string;
    appVersion: string;
    driveName: string;
    rootFolderId: string;
    cipher: guards.CipherType | '';
    cipherIV: string;
    unixTime: number;
    arFS: string;
    driveId: string;
    driveSharing?: string;
    drivePrivacy: guards.DrivePrivacy | '';
    driveAuthMode: guards.DriveAuthMode | '';
    metaDataTxId: string;
    metaDataSyncStatus: number;
    isLocal?: number;
}
export declare class ArFSDriveMetaData {
    id: number;
    login?: string;
    appName: string;
    appVersion: string;
    driveName: string;
    rootFolderId: string;
    cipher: guards.CipherType | '';
    cipherIV: string;
    unixTime: number;
    arFS: string;
    driveId: string;
    driveSharing?: string;
    drivePrivacy: guards.DrivePrivacy | '';
    driveAuthMode: guards.DriveAuthMode | '';
    metaDataTxId: string;
    metaDataSyncStatus: number;
    isLocal?: number;
    constructor({ id, login, appName, appVersion, driveName, rootFolderId, cipher, cipherIV, unixTime, arFS, driveId, driveSharing, drivePrivacy, driveAuthMode, metaDataTxId, metaDataSyncStatus, isLocal }: ArFSDriveMetaDataParameters);
    static Empty(appName: string, appVersion: string, driveId: string): ArFSDriveMetaData;
}
export interface ArFSFileMetaDataParameters {
    id: number;
    login: string;
    appName: string;
    appVersion: string;
    unixTime: number;
    contentType: string;
    entityType: guards.EntityType | '';
    driveId: string;
    parentFolderId: string;
    fileId: string;
    fileSize: number;
    fileName: string;
    fileHash: string;
    filePath: string;
    fileVersion: number;
    cipher: guards.CipherType | '';
    dataCipherIV: string;
    metaDataCipherIV: string;
    lastModifiedDate: number;
    isLocal: number;
    isPublic: number;
    permaWebLink: string;
    metaDataTxId: string;
    dataTxId: string;
    fileDataSyncStatus: number;
    fileMetaDataSyncStatus: number;
    cloudOnly: number;
}
export declare class ArFSFileMetaData {
    id: number;
    login: string;
    appName: string;
    appVersion: string;
    unixTime: number;
    contentType: string;
    entityType: guards.EntityType | '';
    driveId: string;
    parentFolderId: string;
    fileId: string;
    fileSize: number;
    fileName: string;
    fileHash: string;
    filePath: string;
    fileVersion: number;
    cipher: guards.CipherType | '';
    dataCipherIV: string;
    metaDataCipherIV: string;
    lastModifiedDate: number;
    isLocal: number;
    isPublic: number;
    permaWebLink: string;
    metaDataTxId: string;
    dataTxId: string;
    fileDataSyncStatus: number;
    fileMetaDataSyncStatus: number;
    cloudOnly: number;
    constructor({ id, login, appName, appVersion, unixTime, contentType, entityType, driveId, parentFolderId, fileId, fileSize, fileName, fileHash, filePath, fileVersion, cipher, dataCipherIV, metaDataCipherIV, lastModifiedDate, isLocal, isPublic, permaWebLink, metaDataTxId, dataTxId, fileDataSyncStatus, fileMetaDataSyncStatus, cloudOnly }: ArFSFileMetaDataParameters);
    static Empty(userLogin: string): ArFSFileMetaData;
}
export interface ArFSEncryptedData {
    cipher: guards.CipherType;
    cipherIV: string;
    data: Buffer;
}
