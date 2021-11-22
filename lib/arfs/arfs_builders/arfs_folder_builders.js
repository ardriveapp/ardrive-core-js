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
exports.ArFSPrivateFolderBuilder = exports.ArFSPublicFolderBuilder = exports.ArFSFolderBuilder = exports.RootFolderID = exports.ROOT_FOLDER_ID_PLACEHOLDER = void 0;
const arfs_builders_1 = require("./arfs_builders");
const types_1 = require("../../types");
const crypto_1 = require("../../utils/crypto");
const common_1 = require("../../utils/common");
const arfs_entities_1 = require("../arfs_entities");
const constants_1 = require("../../utils/constants");
exports.ROOT_FOLDER_ID_PLACEHOLDER = 'root folder';
// A utility type to provide a FolderID placeholder for root folders (which never have a parentFolderId)
class RootFolderID extends types_1.EntityID {
    constructor() {
        super(`${constants_1.fakeEntityId}`); // Unused after next line
        this.entityId = exports.ROOT_FOLDER_ID_PLACEHOLDER;
    }
}
exports.RootFolderID = RootFolderID;
class ArFSFolderBuilder extends arfs_builders_1.ArFSFileOrFolderBuilder {
    getGqlQueryParameters() {
        return [
            { name: 'Folder-Id', value: `${this.entityId}` },
            { name: 'Entity-Type', value: 'folder' }
        ];
    }
}
exports.ArFSFolderBuilder = ArFSFolderBuilder;
class ArFSPublicFolderBuilder extends ArFSFolderBuilder {
    static fromArweaveNode(node, arweave) {
        var _a;
        const { tags } = node;
        const folderId = (_a = tags.find((tag) => tag.name === 'Folder-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!folderId) {
            throw new Error('Folder-ID tag missing!');
        }
        const folderBuilder = new ArFSPublicFolderBuilder({ entityId: types_1.EID(folderId), arweave });
        return folderBuilder;
    }
    buildEntity() {
        var _a, _b, _c, _d, _e;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.parentFolderId) {
                // Root folders do not have a Parent-Folder-Id tag
                this.parentFolderId = new RootFolderID();
            }
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
                // Get the folder name
                this.name = dataJSON.name;
                if (!this.name) {
                    throw new Error('Invalid public folder state: name not found!');
                }
                return Promise.resolve(new arfs_entities_1.ArFSPublicFolder(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.parentFolderId, this.entityId));
            }
            throw new Error('Invalid public folder state');
        });
    }
}
exports.ArFSPublicFolderBuilder = ArFSPublicFolderBuilder;
class ArFSPrivateFolderBuilder extends ArFSFolderBuilder {
    constructor(folderId, arweave, driveKey, owner) {
        super({ entityId: folderId, arweave, owner });
        this.folderId = folderId;
        this.arweave = arweave;
        this.driveKey = driveKey;
        this.owner = owner;
    }
    static fromArweaveNode(node, arweave, driveKey) {
        var _a;
        const { tags } = node;
        const folderId = (_a = tags.find((tag) => tag.name === 'Folder-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!folderId) {
            throw new Error('Folder-ID tag missing!');
        }
        const folderBuilder = new ArFSPrivateFolderBuilder(types_1.EID(folderId), arweave, driveKey);
        return folderBuilder;
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
        var _a, _b, _c, _d, _e, _f, _g;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.parentFolderId) {
                // Root folders do not have a Parent-Folder-Id tag
                this.parentFolderId = new RootFolderID();
            }
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
                const decryptedFolderBuffer = yield crypto_1.fileDecrypt(this.cipherIV, this.driveKey, dataBuffer);
                const decryptedFolderString = yield common_1.Utf8ArrayToStr(decryptedFolderBuffer);
                const decryptedFolderJSON = yield JSON.parse(decryptedFolderString);
                // Get the folder name
                this.name = decryptedFolderJSON.name;
                if (!this.name) {
                    throw new Error('Invalid private folder state: name not found!');
                }
                return new arfs_entities_1.ArFSPrivateFolder(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.parentFolderId, this.entityId, this.cipher, this.cipherIV);
            }
            throw new Error('Invalid private folder state');
        });
    }
}
exports.ArFSPrivateFolderBuilder = ArFSPrivateFolderBuilder;
