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
exports.ArDriveAnonymous = exports.ArDriveType = void 0;
class ArDriveType {
}
exports.ArDriveType = ArDriveType;
class ArDriveAnonymous extends ArDriveType {
    constructor(arFsDao) {
        super();
        this.arFsDao = arFsDao;
    }
    getOwnerForDriveId(driveId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.arFsDao.getOwnerForDriveId(driveId);
        });
    }
    getPublicDrive({ driveId, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.getOwnerForDriveId(driveId);
            }
            return this.arFsDao.getPublicDrive(driveId, owner);
        });
    }
    getPublicFolder({ folderId, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.arFsDao.getDriveOwnerForFolderId(folderId);
            }
            return this.arFsDao.getPublicFolder(folderId, owner);
        });
    }
    getPublicFile({ fileId, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.arFsDao.getDriveOwnerForFileId(fileId);
            }
            return this.arFsDao.getPublicFile(fileId, owner);
        });
    }
    getAllDrivesForAddress({ address, privateKeyData }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.arFsDao.getAllDrivesForAddress(address, privateKeyData);
        });
    }
    /**
     * Lists the children of certain public folder
     * @param {FolderID} folderId the folder ID to list children of
     * @returns {ArFSPublicFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPublicFolder({ folderId, maxDepth = 0, includeRoot = false, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!owner) {
                owner = yield this.arFsDao.getDriveOwnerForFolderId(folderId);
            }
            const children = yield this.arFsDao.listPublicFolder({ folderId, maxDepth, includeRoot, owner });
            return children;
        });
    }
}
exports.ArDriveAnonymous = ArDriveAnonymous;
