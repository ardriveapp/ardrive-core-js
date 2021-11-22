"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSFileMetaData = exports.ArFSDriveMetaData = void 0;
class ArFSDriveMetaData {
    constructor({ id, login, appName, appVersion, driveName, rootFolderId, cipher, cipherIV, unixTime, arFS, driveId, driveSharing, drivePrivacy, driveAuthMode, metaDataTxId, metaDataSyncStatus, isLocal }) {
        this.id = id;
        this.login = login;
        this.appName = appName;
        this.appVersion = appVersion;
        this.driveName = driveName;
        this.rootFolderId = rootFolderId;
        this.cipher = cipher;
        this.cipherIV = cipherIV;
        this.unixTime = unixTime;
        this.arFS = arFS;
        this.driveId = driveId;
        this.driveSharing = driveSharing;
        this.drivePrivacy = drivePrivacy;
        this.driveAuthMode = driveAuthMode;
        this.metaDataTxId = metaDataTxId;
        this.metaDataSyncStatus = metaDataSyncStatus;
        this.isLocal = isLocal;
    }
    static Empty(appName, appVersion, driveId) {
        return new ArFSDriveMetaData({
            id: 0,
            login: '',
            appName: appName,
            appVersion: appVersion,
            driveName: '',
            rootFolderId: '',
            cipher: '',
            cipherIV: '',
            unixTime: 0,
            arFS: '',
            driveId,
            driveSharing: 'shared',
            drivePrivacy: 'public',
            driveAuthMode: '',
            metaDataTxId: '0',
            metaDataSyncStatus: 0
        });
    }
}
exports.ArFSDriveMetaData = ArFSDriveMetaData;
class ArFSFileMetaData {
    constructor({ id, login, appName, appVersion, unixTime, contentType, entityType, driveId, parentFolderId, fileId, fileSize, fileName, fileHash, filePath, fileVersion, cipher, dataCipherIV, metaDataCipherIV, lastModifiedDate, isLocal, isPublic, permaWebLink, metaDataTxId, dataTxId, fileDataSyncStatus, fileMetaDataSyncStatus, cloudOnly }) {
        this.id = id;
        this.login = login;
        this.appName = appName;
        this.appVersion = appVersion;
        this.unixTime = unixTime;
        this.contentType = contentType;
        this.entityType = entityType;
        this.driveId = driveId;
        this.parentFolderId = parentFolderId;
        this.fileId = fileId;
        this.fileSize = fileSize;
        this.fileName = fileName;
        this.fileHash = fileHash;
        this.filePath = filePath;
        this.fileVersion = fileVersion;
        this.cipher = cipher;
        this.dataCipherIV = dataCipherIV;
        this.metaDataCipherIV = metaDataCipherIV;
        this.lastModifiedDate = lastModifiedDate;
        this.isLocal = isLocal;
        this.isPublic = isPublic;
        this.permaWebLink = permaWebLink;
        this.metaDataTxId = metaDataTxId;
        this.dataTxId = dataTxId;
        this.fileDataSyncStatus = fileDataSyncStatus;
        this.fileMetaDataSyncStatus = fileMetaDataSyncStatus;
        this.cloudOnly = cloudOnly;
    }
    static Empty(userLogin) {
        return new ArFSFileMetaData({
            id: 0,
            login: userLogin,
            appName: '',
            appVersion: '',
            unixTime: 0,
            contentType: '',
            entityType: '',
            driveId: '',
            parentFolderId: '',
            fileId: '',
            fileSize: 0,
            fileName: '',
            fileHash: '',
            filePath: '',
            fileVersion: 0,
            lastModifiedDate: 0,
            isPublic: 0,
            isLocal: 0,
            fileDataSyncStatus: 0,
            fileMetaDataSyncStatus: 0,
            permaWebLink: '',
            metaDataTxId: '',
            dataTxId: '',
            cipher: '',
            dataCipherIV: '',
            metaDataCipherIV: '',
            cloudOnly: 0
        });
    }
}
exports.ArFSFileMetaData = ArFSFileMetaData;
// Arweave GraphQL Interfaces
