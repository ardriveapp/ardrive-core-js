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
exports.ArFSPrivateFileBuilder = exports.ArFSPublicFileBuilder = exports.ArFSFileBuilder = void 0;
const crypto_1 = require("../../utils/crypto");
const types_1 = require("../../types");
const common_1 = require("../../utils/common");
const arfs_entities_1 = require("../arfs_entities");
const arfs_builders_1 = require("./arfs_builders");
class ArFSFileBuilder extends arfs_builders_1.ArFSFileOrFolderBuilder {
    getGqlQueryParameters() {
        return [
            { name: 'File-Id', value: `${this.entityId}` },
            { name: 'Entity-Type', value: 'file' }
        ];
    }
}
exports.ArFSFileBuilder = ArFSFileBuilder;
class ArFSPublicFileBuilder extends ArFSFileBuilder {
    static fromArweaveNode(node, arweave) {
        var _a;
        const { tags } = node;
        const fileId = (_a = tags.find((tag) => tag.name === 'File-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!fileId) {
            throw new Error('File-ID tag missing!');
        }
        const fileBuilder = new ArFSPublicFileBuilder({ entityId: types_1.EID(fileId), arweave });
        return fileBuilder;
    }
    buildEntity() {
        var _a, _b, _c, _d, _e, _f;
        return __awaiter(this, void 0, void 0, function* () {
            if (((_a = this.appName) === null || _a === void 0 ? void 0 : _a.length) &&
                ((_b = this.appVersion) === null || _b === void 0 ? void 0 : _b.length) &&
                ((_c = this.arFS) === null || _c === void 0 ? void 0 : _c.length) &&
                ((_d = this.contentType) === null || _d === void 0 ? void 0 : _d.length) &&
                this.driveId &&
                ((_e = this.entityType) === null || _e === void 0 ? void 0 : _e.length) &&
                this.txId &&
                this.unixTime &&
                this.parentFolderId &&
                this.entityId) {
                const txData = yield this.arweave.transactions.getData(`${this.txId}`, { decode: true });
                const dataString = yield common_1.Utf8ArrayToStr(txData);
                const dataJSON = yield JSON.parse(dataString);
                // Get fields from data JSON
                this.name = dataJSON.name;
                this.size = dataJSON.size;
                this.lastModifiedDate = dataJSON.lastModifiedDate;
                this.dataTxId = dataJSON.dataTxId;
                this.dataContentType = (_f = dataJSON.dataContentType) !== null && _f !== void 0 ? _f : common_1.extToMime(this.name);
                if (!this.name ||
                    this.size === undefined ||
                    !this.lastModifiedDate ||
                    !this.dataTxId ||
                    !this.dataContentType) {
                    throw new Error('Invalid file state');
                }
                return Promise.resolve(new arfs_entities_1.ArFSPublicFile(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.parentFolderId, this.entityId, this.size, this.lastModifiedDate, this.dataTxId, this.dataContentType));
            }
            throw new Error('Invalid file state');
        });
    }
}
exports.ArFSPublicFileBuilder = ArFSPublicFileBuilder;
class ArFSPrivateFileBuilder extends ArFSFileBuilder {
    constructor(fileId, arweave, driveKey, owner, fileKey) {
        super({ entityId: fileId, arweave, owner });
        this.fileId = fileId;
        this.arweave = arweave;
        this.driveKey = driveKey;
        this.owner = owner;
        this.fileKey = fileKey;
    }
    static fromArweaveNode(node, arweave, driveKey) {
        var _a;
        const { tags } = node;
        const fileId = (_a = tags.find((tag) => tag.name === 'File-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!fileId) {
            throw new Error('File-ID tag missing!');
        }
        const fileBuilder = new ArFSPrivateFileBuilder(types_1.EID(fileId), arweave, driveKey);
        return fileBuilder;
    }
    parseFromArweaveNode(node) {
        const _super = Object.create(null, {
            parseFromArweaveNode: { get: () => super.parseFromArweaveNode }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const unparsedTags = [];
            const tags = yield _super.parseFromArweaveNode.call(this, node);
            tags.forEach((tag) => {
                const key = tag.name;
                const { value } = tag;
                switch (key) {
                    case 'Cipher-IV':
                        this.cipherIV = value;
                        break;
                    case 'Cipher':
                        this.cipher = value;
                        break;
                    default:
                        unparsedTags.push(tag);
                        break;
                }
            });
            return unparsedTags;
        });
    }
    buildEntity() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __awaiter(this, void 0, void 0, function* () {
            if (((_a = this.appName) === null || _a === void 0 ? void 0 : _a.length) &&
                ((_b = this.appVersion) === null || _b === void 0 ? void 0 : _b.length) &&
                ((_c = this.arFS) === null || _c === void 0 ? void 0 : _c.length) &&
                ((_d = this.contentType) === null || _d === void 0 ? void 0 : _d.length) &&
                this.driveId &&
                ((_e = this.entityType) === null || _e === void 0 ? void 0 : _e.length) &&
                this.txId &&
                this.unixTime &&
                this.parentFolderId &&
                this.entityId &&
                ((_f = this.cipher) === null || _f === void 0 ? void 0 : _f.length) &&
                ((_g = this.cipherIV) === null || _g === void 0 ? void 0 : _g.length)) {
                const txData = yield this.arweave.transactions.getData(`${this.txId}`, { decode: true });
                const dataBuffer = Buffer.from(txData);
                const fileKey = (_h = this.fileKey) !== null && _h !== void 0 ? _h : (yield crypto_1.deriveFileKey(`${this.fileId}`, this.driveKey));
                const decryptedFileBuffer = yield crypto_1.fileDecrypt(this.cipherIV, fileKey, dataBuffer);
                const decryptedFileString = yield common_1.Utf8ArrayToStr(decryptedFileBuffer);
                const decryptedFileJSON = yield JSON.parse(decryptedFileString);
                // Get fields from data JSON
                this.name = decryptedFileJSON.name;
                this.size = decryptedFileJSON.size;
                this.lastModifiedDate = decryptedFileJSON.lastModifiedDate;
                this.dataTxId = decryptedFileJSON.dataTxId;
                this.dataContentType = (_j = decryptedFileJSON.dataContentType) !== null && _j !== void 0 ? _j : common_1.extToMime(this.name);
                if (!this.name ||
                    this.size === undefined ||
                    !this.lastModifiedDate ||
                    !this.dataTxId ||
                    !this.dataContentType) {
                    throw new Error('Invalid file state');
                }
                return new arfs_entities_1.ArFSPrivateFile(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.parentFolderId, this.entityId, this.size, this.lastModifiedDate, this.dataTxId, this.dataContentType, this.cipher, this.cipherIV);
            }
            throw new Error('Invalid file state');
        });
    }
}
exports.ArFSPrivateFileBuilder = ArFSPrivateFileBuilder;
