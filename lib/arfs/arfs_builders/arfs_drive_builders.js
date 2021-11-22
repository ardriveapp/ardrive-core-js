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
exports.SafeArFSDriveBuilder = exports.EncryptedEntityID = exports.ArFSPrivateDriveBuilder = exports.ArFSPublicDriveBuilder = void 0;
const crypto_1 = require("../../utils/crypto");
const types_1 = require("../../types");
const common_1 = require("../../utils/common");
const constants_1 = require("../../utils/constants");
const arfs_entities_1 = require("../arfs_entities");
const arfs_builders_1 = require("./arfs_builders");
class ArFSPublicDriveBuilder extends arfs_builders_1.ArFSMetadataEntityBuilder {
    static fromArweaveNode(node, arweave) {
        var _a;
        const { tags } = node;
        const driveId = (_a = tags.find((tag) => tag.name === 'Drive-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!driveId) {
            throw new Error('Drive-ID tag missing!');
        }
        const driveBuilder = new ArFSPublicDriveBuilder({ entityId: types_1.EID(driveId), arweave });
        return driveBuilder;
    }
    getGqlQueryParameters() {
        return [
            { name: 'Drive-Id', value: `${this.entityId}` },
            { name: 'Entity-Type', value: 'drive' },
            { name: 'Drive-Privacy', value: 'public' }
        ];
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
                    case 'Drive-Privacy':
                        this.drivePrivacy = value;
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
                this.driveId.equals(this.entityId) &&
                ((_f = this.drivePrivacy) === null || _f === void 0 ? void 0 : _f.length)) {
                const txData = yield this.arweave.transactions.getData(`${this.txId}`, { decode: true });
                const dataString = yield common_1.Utf8ArrayToStr(txData);
                const dataJSON = yield JSON.parse(dataString);
                // Get the drive name and root folder id
                this.name = dataJSON.name;
                this.rootFolderId = dataJSON.rootFolderId;
                if (!this.name || !this.rootFolderId) {
                    throw new Error('Invalid drive state');
                }
                return new arfs_entities_1.ArFSPublicDrive(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.drivePrivacy, this.rootFolderId);
            }
            throw new Error('Invalid drive state');
        });
    }
}
exports.ArFSPublicDriveBuilder = ArFSPublicDriveBuilder;
class ArFSPrivateDriveBuilder extends arfs_builders_1.ArFSMetadataEntityBuilder {
    constructor({ entityId: driveId, arweave, key: driveKey, owner }) {
        super({ entityId: driveId, arweave, owner });
        this.driveKey = driveKey;
    }
    getGqlQueryParameters() {
        return [
            { name: 'Drive-Id', value: `${this.entityId}` },
            { name: 'Entity-Type', value: 'drive' },
            { name: 'Drive-Privacy', value: 'private' }
        ];
    }
    static fromArweaveNode(node, arweave, driveKey) {
        var _a;
        const { tags } = node;
        const driveId = (_a = tags.find((tag) => tag.name === 'Drive-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!driveId) {
            throw new Error('Drive-ID tag missing!');
        }
        const fileBuilder = new ArFSPrivateDriveBuilder({ entityId: types_1.EID(driveId), arweave, key: driveKey });
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
                    case 'Cipher':
                        this.cipher = value;
                        break;
                    case 'Cipher-IV':
                        this.cipherIV = value;
                        break;
                    case 'Drive-Auth-Mode':
                        this.driveAuthMode = value;
                        break;
                    case 'Drive-Privacy':
                        this.drivePrivacy = value;
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
                ((_f = this.drivePrivacy) === null || _f === void 0 ? void 0 : _f.length) &&
                ((_g = this.driveAuthMode) === null || _g === void 0 ? void 0 : _g.length) &&
                ((_h = this.cipher) === null || _h === void 0 ? void 0 : _h.length) &&
                ((_j = this.cipherIV) === null || _j === void 0 ? void 0 : _j.length)) {
                const txData = yield this.arweave.transactions.getData(`${this.txId}`, { decode: true });
                const dataBuffer = Buffer.from(txData);
                const decryptedDriveBuffer = yield crypto_1.driveDecrypt(this.cipherIV, this.driveKey, dataBuffer);
                const decryptedDriveString = yield common_1.Utf8ArrayToStr(decryptedDriveBuffer);
                const decryptedDriveJSON = yield JSON.parse(decryptedDriveString);
                this.name = decryptedDriveJSON.name;
                this.rootFolderId = decryptedDriveJSON.rootFolderId;
                return new arfs_entities_1.ArFSPrivateDrive(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.drivePrivacy, this.rootFolderId, this.driveAuthMode, this.cipher, this.cipherIV);
            }
            throw new Error('Invalid drive state');
        });
    }
}
exports.ArFSPrivateDriveBuilder = ArFSPrivateDriveBuilder;
// A utility type to assist with fail-safe decryption of private entities
class EncryptedEntityID extends types_1.EntityID {
    constructor() {
        super(`${constants_1.fakeEntityId}`); // Unused after next line
        this.entityId = arfs_entities_1.ENCRYPTED_DATA_PLACEHOLDER;
    }
}
exports.EncryptedEntityID = EncryptedEntityID;
class SafeArFSDriveBuilder extends arfs_builders_1.ArFSMetadataEntityBuilder {
    constructor({ entityId: driveId, arweave, privateKeyData }) {
        super({ entityId: driveId, arweave });
        this.privateKeyData = privateKeyData;
    }
    getGqlQueryParameters() {
        return [
            { name: 'Drive-Id', value: `${this.entityId}` },
            { name: 'Entity-Type', value: 'drive' }
        ];
    }
    static fromArweaveNode(node, arweave, privateKeyData) {
        var _a;
        const { tags } = node;
        const driveId = (_a = tags.find((tag) => tag.name === 'Drive-Id')) === null || _a === void 0 ? void 0 : _a.value;
        if (!driveId) {
            throw new Error('Drive-ID tag missing!');
        }
        const driveBuilder = new SafeArFSDriveBuilder({
            entityId: types_1.EID(driveId),
            arweave,
            // TODO: Make all private builders optionally take driveKey and fail gracefully, populating fields with 'ENCRYPTED'
            privateKeyData
        });
        return driveBuilder;
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
                    case 'Cipher':
                        this.cipher = value;
                        break;
                    case 'Cipher-IV':
                        this.cipherIV = value;
                        break;
                    case 'Drive-Auth-Mode':
                        this.driveAuthMode = value;
                        break;
                    case 'Drive-Privacy':
                        this.drivePrivacy = value;
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
                ((_f = this.drivePrivacy) === null || _f === void 0 ? void 0 : _f.length)) {
                const isPrivate = this.drivePrivacy === 'private';
                const txData = yield this.arweave.transactions.getData(`${this.txId}`, { decode: true });
                const dataBuffer = Buffer.from(txData);
                // Data JSON will be false when a private drive cannot be decrypted
                const dataJSON = yield (() => __awaiter(this, void 0, void 0, function* () {
                    var _g, _h, _j;
                    if (isPrivate) {
                        // Type-check private properties
                        if (((_g = this.cipher) === null || _g === void 0 ? void 0 : _g.length) && ((_h = this.driveAuthMode) === null || _h === void 0 ? void 0 : _h.length) && ((_j = this.cipherIV) === null || _j === void 0 ? void 0 : _j.length)) {
                            const placeholderDriveData = {
                                name: arfs_entities_1.ENCRYPTED_DATA_PLACEHOLDER,
                                rootFolderId: new EncryptedEntityID()
                            };
                            return this.privateKeyData.safelyDecryptToJson(this.cipherIV, this.entityId, dataBuffer, placeholderDriveData);
                        }
                        throw new Error('Invalid private drive state');
                    }
                    // Drive is public, no decryption needed
                    const dataString = yield common_1.Utf8ArrayToStr(txData);
                    return JSON.parse(dataString);
                }))();
                this.name = dataJSON.name;
                this.rootFolderId = dataJSON.rootFolderId;
                if (isPrivate) {
                    return new arfs_entities_1.ArFSPrivateDrive(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.drivePrivacy, this.rootFolderId, 
                    // These private fields are type-checked these within the dataJSON closure
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.driveAuthMode, 
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.cipher, 
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.cipherIV);
                }
                return new arfs_entities_1.ArFSPublicDrive(this.appName, this.appVersion, this.arFS, this.contentType, this.driveId, this.entityType, this.name, this.txId, this.unixTime, this.drivePrivacy, this.rootFolderId);
            }
            throw new Error('Invalid drive state');
        });
    }
}
exports.SafeArFSDriveBuilder = SafeArFSDriveBuilder;
