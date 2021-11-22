"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSPrivateFileDataTransactionData = exports.ArFSPublicFileDataTransactionData = exports.ArFSFileDataTransactionData = exports.ArFSPrivateFileMetadataTransactionData = exports.ArFSPublicFileMetadataTransactionData = exports.ArFSFileMetadataTransactionData = exports.ArFSPrivateFolderTransactionData = exports.ArFSPublicFolderTransactionData = exports.ArFSFolderTransactionData = exports.ArFSPrivateDriveTransactionData = exports.ArFSPublicDriveTransactionData = exports.ArFSDriveTransactionData = void 0;
const crypto_1 = require("../utils/crypto");
const types_1 = require("../types");
class ArFSDriveTransactionData {
    // TODO: Share repeated sizeOf() function to all classes
    sizeOf() {
        return new types_1.ByteCount(this.asTransactionData().length);
    }
}
exports.ArFSDriveTransactionData = ArFSDriveTransactionData;
class ArFSPublicDriveTransactionData extends ArFSDriveTransactionData {
    constructor(name, rootFolderId) {
        super();
        this.name = name;
        this.rootFolderId = rootFolderId;
    }
    asTransactionData() {
        return JSON.stringify({
            name: this.name,
            rootFolderId: this.rootFolderId
        });
    }
}
exports.ArFSPublicDriveTransactionData = ArFSPublicDriveTransactionData;
class ArFSPrivateDriveTransactionData extends ArFSDriveTransactionData {
    constructor(cipher, cipherIV, encryptedDriveData, driveKey, driveAuthMode = 'password') {
        super();
        this.cipher = cipher;
        this.cipherIV = cipherIV;
        this.encryptedDriveData = encryptedDriveData;
        this.driveKey = driveKey;
        this.driveAuthMode = driveAuthMode;
    }
    static from(name, rootFolderId, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const { cipher, cipherIV, data } = yield crypto_1.driveEncrypt(driveKey, Buffer.from(JSON.stringify({
                name: name,
                rootFolderId: rootFolderId
            })));
            return new ArFSPrivateDriveTransactionData(cipher, cipherIV, data, driveKey);
        });
    }
    asTransactionData() {
        return this.encryptedDriveData;
    }
}
exports.ArFSPrivateDriveTransactionData = ArFSPrivateDriveTransactionData;
class ArFSFolderTransactionData {
    sizeOf() {
        return new types_1.ByteCount(this.asTransactionData().length);
    }
}
exports.ArFSFolderTransactionData = ArFSFolderTransactionData;
class ArFSPublicFolderTransactionData extends ArFSFolderTransactionData {
    constructor(name) {
        super();
        this.name = name;
    }
    asTransactionData() {
        return JSON.stringify({
            name: this.name
        });
    }
}
exports.ArFSPublicFolderTransactionData = ArFSPublicFolderTransactionData;
class ArFSPrivateFolderTransactionData extends ArFSFolderTransactionData {
    constructor(name, cipher, cipherIV, encryptedFolderData, driveKey) {
        super();
        this.name = name;
        this.cipher = cipher;
        this.cipherIV = cipherIV;
        this.encryptedFolderData = encryptedFolderData;
        this.driveKey = driveKey;
    }
    static from(name, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const { cipher, cipherIV, data } = yield crypto_1.fileEncrypt(driveKey, Buffer.from(JSON.stringify({
                name: name
            })));
            return new ArFSPrivateFolderTransactionData(name, cipher, cipherIV, data, driveKey);
        });
    }
    asTransactionData() {
        return this.encryptedFolderData;
    }
}
exports.ArFSPrivateFolderTransactionData = ArFSPrivateFolderTransactionData;
class ArFSFileMetadataTransactionData {
    sizeOf() {
        return new types_1.ByteCount(this.asTransactionData().length);
    }
}
exports.ArFSFileMetadataTransactionData = ArFSFileMetadataTransactionData;
class ArFSPublicFileMetadataTransactionData extends ArFSFileMetadataTransactionData {
    constructor(name, size, lastModifiedDate, dataTxId, dataContentType) {
        super();
        this.name = name;
        this.size = size;
        this.lastModifiedDate = lastModifiedDate;
        this.dataTxId = dataTxId;
        this.dataContentType = dataContentType;
    }
    asTransactionData() {
        return JSON.stringify({
            name: this.name,
            size: this.size,
            lastModifiedDate: this.lastModifiedDate,
            dataTxId: this.dataTxId,
            dataContentType: this.dataContentType
        });
    }
}
exports.ArFSPublicFileMetadataTransactionData = ArFSPublicFileMetadataTransactionData;
class ArFSPrivateFileMetadataTransactionData extends ArFSFileMetadataTransactionData {
    constructor(cipher, cipherIV, encryptedFileMetadata, fileKey, driveAuthMode = 'password') {
        super();
        this.cipher = cipher;
        this.cipherIV = cipherIV;
        this.encryptedFileMetadata = encryptedFileMetadata;
        this.fileKey = fileKey;
        this.driveAuthMode = driveAuthMode;
    }
    static from(name, size, lastModifiedDate, dataTxId, dataContentType, fileId, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileKey = yield crypto_1.deriveFileKey(`${fileId}`, driveKey);
            const { cipher, cipherIV, data } = yield crypto_1.fileEncrypt(fileKey, Buffer.from(JSON.stringify({
                name: name,
                size: size,
                lastModifiedDate: lastModifiedDate,
                dataTxId: dataTxId,
                dataContentType: dataContentType
            })));
            return new ArFSPrivateFileMetadataTransactionData(cipher, cipherIV, data, fileKey);
        });
    }
    asTransactionData() {
        return this.encryptedFileMetadata;
    }
}
exports.ArFSPrivateFileMetadataTransactionData = ArFSPrivateFileMetadataTransactionData;
class ArFSFileDataTransactionData {
    sizeOf() {
        return new types_1.ByteCount(this.asTransactionData().length);
    }
}
exports.ArFSFileDataTransactionData = ArFSFileDataTransactionData;
class ArFSPublicFileDataTransactionData extends ArFSFileDataTransactionData {
    constructor(fileData) {
        super();
        this.fileData = fileData;
    }
    asTransactionData() {
        return this.fileData;
    }
}
exports.ArFSPublicFileDataTransactionData = ArFSPublicFileDataTransactionData;
class ArFSPrivateFileDataTransactionData extends ArFSFileDataTransactionData {
    constructor(cipher, cipherIV, encryptedFileData, driveAuthMode = 'password') {
        super();
        this.cipher = cipher;
        this.cipherIV = cipherIV;
        this.encryptedFileData = encryptedFileData;
        this.driveAuthMode = driveAuthMode;
    }
    static from(fileData, fileId, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileKey = yield crypto_1.deriveFileKey(`${fileId}`, driveKey);
            const { cipher, cipherIV, data } = yield crypto_1.fileEncrypt(fileKey, fileData);
            return new ArFSPrivateFileDataTransactionData(cipher, cipherIV, data);
        });
    }
    asTransactionData() {
        return this.encryptedFileData;
    }
}
exports.ArFSPrivateFileDataTransactionData = ArFSPrivateFileDataTransactionData;
