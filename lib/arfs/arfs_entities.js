"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSPrivateFolder = exports.ArFSPublicFolder = exports.ArFSPrivateFile = exports.ArFSPublicFile = exports.ArFSPrivateFileOrFolderWithPaths = exports.ArFSPublicFileOrFolderWithPaths = exports.ArFSFileOrFolderEntity = exports.ArFSPrivateDrive = exports.ArFSPublicDrive = exports.ENCRYPTED_DATA_PLACEHOLDER = exports.ArFSEntity = void 0;
const types_1 = require("../types");
// The primary ArFS entity that all other entities inherit from.
class ArFSEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime) {
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
    }
}
exports.ArFSEntity = ArFSEntity;
exports.ENCRYPTED_DATA_PLACEHOLDER = 'ENCRYPTED';
class ArFSPublicDrive extends ArFSEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, drivePrivacy, rootFolderId) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime);
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
        this.drivePrivacy = drivePrivacy;
        this.rootFolderId = rootFolderId;
    }
}
exports.ArFSPublicDrive = ArFSPublicDrive;
class ArFSPrivateDrive extends ArFSEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, drivePrivacy, rootFolderId, driveAuthMode, cipher, cipherIV) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime);
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
        this.drivePrivacy = drivePrivacy;
        this.rootFolderId = rootFolderId;
        this.driveAuthMode = driveAuthMode;
        this.cipher = cipher;
        this.cipherIV = cipherIV;
    }
}
exports.ArFSPrivateDrive = ArFSPrivateDrive;
class ArFSFileOrFolderEntity extends ArFSEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, size, txId, unixTime, lastModifiedDate, dataTxId, dataContentType, parentFolderId, entityId) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime);
        this.size = size;
        this.lastModifiedDate = lastModifiedDate;
        this.dataTxId = dataTxId;
        this.dataContentType = dataContentType;
        this.parentFolderId = parentFolderId;
        this.entityId = entityId;
    }
}
exports.ArFSFileOrFolderEntity = ArFSFileOrFolderEntity;
class ArFSPublicFileOrFolderWithPaths extends ArFSFileOrFolderEntity {
    constructor(entity, hierarchy) {
        super(entity.appName, entity.appVersion, entity.arFS, entity.contentType, entity.driveId, entity.entityType, entity.name, entity.size, entity.txId, entity.unixTime, entity.lastModifiedDate, entity.dataTxId, entity.dataContentType, entity.parentFolderId, entity.entityId);
        this.path = `${hierarchy.pathToFolderId(entity.parentFolderId)}${entity.name}`;
        this.txIdPath = `${hierarchy.txPathToFolderId(entity.parentFolderId)}${entity.txId}`;
        this.entityIdPath = `${hierarchy.entityPathToFolderId(entity.parentFolderId)}${entity.entityId}`;
    }
}
exports.ArFSPublicFileOrFolderWithPaths = ArFSPublicFileOrFolderWithPaths;
class ArFSPrivateFileOrFolderWithPaths extends ArFSFileOrFolderEntity {
    constructor(entity, hierarchy) {
        super(entity.appName, entity.appVersion, entity.arFS, entity.contentType, entity.driveId, entity.entityType, entity.name, entity.size, entity.txId, entity.unixTime, entity.lastModifiedDate, entity.dataTxId, entity.dataContentType, entity.parentFolderId, entity.entityId);
        this.cipher = entity.cipher;
        this.cipherIV = entity.cipherIV;
        this.path = `${hierarchy.pathToFolderId(entity.parentFolderId)}${entity.name}`;
        this.txIdPath = `${hierarchy.txPathToFolderId(entity.parentFolderId)}${entity.txId}`;
        this.entityIdPath = `${hierarchy.entityPathToFolderId(entity.parentFolderId)}${entity.entityId}`;
    }
}
exports.ArFSPrivateFileOrFolderWithPaths = ArFSPrivateFileOrFolderWithPaths;
class ArFSPublicFile extends ArFSFileOrFolderEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, parentFolderId, fileId, size, lastModifiedDate, dataTxId, dataContentType) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, size, txId, unixTime, lastModifiedDate, dataTxId, dataContentType, parentFolderId, fileId);
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
        this.parentFolderId = parentFolderId;
        this.fileId = fileId;
        this.size = size;
        this.lastModifiedDate = lastModifiedDate;
        this.dataTxId = dataTxId;
        this.dataContentType = dataContentType;
    }
}
exports.ArFSPublicFile = ArFSPublicFile;
class ArFSPrivateFile extends ArFSFileOrFolderEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, parentFolderId, fileId, size, lastModifiedDate, dataTxId, dataContentType, cipher, cipherIV) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, size, txId, unixTime, lastModifiedDate, dataTxId, dataContentType, parentFolderId, fileId);
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
        this.parentFolderId = parentFolderId;
        this.fileId = fileId;
        this.size = size;
        this.lastModifiedDate = lastModifiedDate;
        this.dataTxId = dataTxId;
        this.dataContentType = dataContentType;
        this.cipher = cipher;
        this.cipherIV = cipherIV;
    }
}
exports.ArFSPrivateFile = ArFSPrivateFile;
class ArFSPublicFolder extends ArFSFileOrFolderEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, parentFolderId, entityId) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, new types_1.ByteCount(0), txId, unixTime, new types_1.UnixTime(0), types_1.stubTransactionID, types_1.JSON_CONTENT_TYPE, parentFolderId, entityId);
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
        this.parentFolderId = parentFolderId;
        this.entityId = entityId;
    }
}
exports.ArFSPublicFolder = ArFSPublicFolder;
class ArFSPrivateFolder extends ArFSFileOrFolderEntity {
    constructor(appName, appVersion, arFS, contentType, driveId, entityType, name, txId, unixTime, parentFolderId, entityId, cipher, cipherIV) {
        super(appName, appVersion, arFS, contentType, driveId, entityType, name, new types_1.ByteCount(0), txId, unixTime, new types_1.UnixTime(0), types_1.stubTransactionID, types_1.JSON_CONTENT_TYPE, parentFolderId, entityId);
        this.appName = appName;
        this.appVersion = appVersion;
        this.arFS = arFS;
        this.contentType = contentType;
        this.driveId = driveId;
        this.entityType = entityType;
        this.name = name;
        this.txId = txId;
        this.unixTime = unixTime;
        this.parentFolderId = parentFolderId;
        this.entityId = entityId;
        this.cipher = cipher;
        this.cipherIV = cipherIV;
    }
}
exports.ArFSPrivateFolder = ArFSPrivateFolder;
