"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSFolderToUpload = exports.ArFSFileToUpload = exports.ArFSManifestToUpload = exports.isFolder = exports.wrapFileOrFolder = void 0;
const fs = __importStar(require("fs"));
const path_1 = require("path");
const types_1 = require("../types");
const common_1 = require("../utils/common");
/**
 *  Fs + Node implementation file size limitations -- tested on MacOS Sep 27, 2021
 *
 *  Public : 2147483647 bytes
 *  Private: 2147483646 bytes
 */
const maxFileSize = new types_1.ByteCount(2147483646);
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
function wrapFileOrFolder(fileOrFolderPath) {
    const entityStats = fs.statSync(fileOrFolderPath);
    if (entityStats.isDirectory()) {
        return new ArFSFolderToUpload(fileOrFolderPath, entityStats);
    }
    return new ArFSFileToUpload(fileOrFolderPath, entityStats);
}
exports.wrapFileOrFolder = wrapFileOrFolder;
/** Type-guard function to determine if returned class is a File or Folder */
function isFolder(fileOrFolder) {
    return fileOrFolder instanceof ArFSFolderToUpload;
}
exports.isFolder = isFolder;
class ArFSManifestToUpload {
    constructor(manifest) {
        this.manifest = manifest;
    }
    gatherFileInfo() {
        const dataContentType = types_1.MANIFEST_CONTENT_TYPE;
        const lastModifiedDateMS = new types_1.UnixTime(Math.round(Date.now() / 1000)); // new unix time
        return { dataContentType, lastModifiedDateMS, fileSize: this.size };
    }
    getBaseFileName() {
        return 'DriveManifest.json';
    }
    getFileDataBuffer() {
        return Buffer.from(JSON.stringify(this.manifest));
    }
    get size() {
        return new types_1.ByteCount(Buffer.byteLength(JSON.stringify(this.manifest)));
    }
}
exports.ArFSManifestToUpload = ArFSManifestToUpload;
class ArFSFileToUpload {
    constructor(filePath, fileStats) {
        this.filePath = filePath;
        this.fileStats = fileStats;
        this.existingFolderAtDestConflict = false;
        this.hasSameLastModifiedDate = false;
        if (+this.fileStats.size >= +maxFileSize) {
            throw new Error(`Files greater than "${maxFileSize}" bytes are not yet supported!`);
        }
    }
    gatherFileInfo() {
        const dataContentType = this.contentType;
        const lastModifiedDateMS = this.lastModifiedDate;
        const fileSize = this.size;
        return { dataContentType, lastModifiedDateMS, fileSize };
    }
    get size() {
        return new types_1.ByteCount(this.fileStats.size);
    }
    get lastModifiedDate() {
        return new types_1.UnixTime(Math.floor(this.fileStats.mtimeMs));
    }
    getBaseCosts() {
        if (!this.baseCosts) {
            throw new Error('Base costs on file were never set!');
        }
        return this.baseCosts;
    }
    getFileDataBuffer() {
        return fs.readFileSync(this.filePath);
    }
    get contentType() {
        return common_1.extToMime(this.filePath);
    }
    getBaseFileName() {
        return path_1.basename(this.filePath);
    }
    /** Computes the size of a private file encrypted with AES256-GCM */
    encryptedDataSize() {
        return new types_1.ByteCount((this.fileStats.size / 16 + 1) * 16);
    }
}
exports.ArFSFileToUpload = ArFSFileToUpload;
class ArFSFolderToUpload {
    constructor(filePath, fileStats) {
        this.filePath = filePath;
        this.fileStats = fileStats;
        this.files = [];
        this.folders = [];
        this.existingFileAtDestConflict = false;
        const entitiesInFolder = fs.readdirSync(this.filePath);
        for (const entityPath of entitiesInFolder) {
            const absoluteEntityPath = path_1.join(this.filePath, entityPath);
            const entityStats = fs.statSync(absoluteEntityPath);
            if (entityStats.isDirectory()) {
                // Child is a folder, build a new folder which will construct it's own children
                const childFolder = new ArFSFolderToUpload(absoluteEntityPath, entityStats);
                this.folders.push(childFolder);
            }
            else {
                // Child is a file, build a new file
                const childFile = new ArFSFileToUpload(absoluteEntityPath, entityStats);
                if (childFile.getBaseFileName() !== '.DS_Store') {
                    this.files.push(childFile);
                }
            }
        }
    }
    checkAndAssignExistingNames(getExistingNamesFn) {
        var e_1, _a, e_2, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.existingId) {
                // Folder has no existing ID to check
                return;
            }
            const existingEntityNamesAndIds = yield getExistingNamesFn(this.existingId);
            try {
                for (var _c = __asyncValues(this.files), _d; _d = yield _c.next(), !_d.done;) {
                    const file = _d.value;
                    const baseFileName = file.getBaseFileName();
                    const existingFolderAtDestConflict = existingEntityNamesAndIds.folders.find(({ folderName }) => folderName === baseFileName);
                    if (existingFolderAtDestConflict) {
                        // Folder name cannot conflict with a file name
                        file.existingFolderAtDestConflict = true;
                        continue;
                    }
                    const existingFileAtDestConflict = existingEntityNamesAndIds.files.find(({ fileName }) => fileName === baseFileName);
                    // Conflicting file name creates a REVISION by default
                    if (existingFileAtDestConflict) {
                        file.existingId = existingFileAtDestConflict.fileId;
                        if (existingFileAtDestConflict.lastModifiedDate.valueOf() === file.lastModifiedDate.valueOf()) {
                            // Check last modified date and set to true to resolve upsert conditional
                            file.hasSameLastModifiedDate = true;
                        }
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) yield _a.call(_c);
                }
                finally { if (e_1) throw e_1.error; }
            }
            try {
                for (var _e = __asyncValues(this.folders), _f; _f = yield _e.next(), !_f.done;) {
                    const folder = _f.value;
                    const baseFolderName = folder.getBaseFileName();
                    const existingFileAtDestConflict = existingEntityNamesAndIds.files.find(({ fileName }) => fileName === baseFolderName);
                    if (existingFileAtDestConflict) {
                        // Folder name cannot conflict with a file name
                        this.existingFileAtDestConflict = true;
                        continue;
                    }
                    const existingFolderAtDestConflict = existingEntityNamesAndIds.folders.find(({ folderName }) => folderName === baseFolderName);
                    // Conflicting folder name uses EXISTING folder by default
                    if (existingFolderAtDestConflict) {
                        // Assigns existing id for later use
                        folder.existingId = existingFolderAtDestConflict.folderId;
                        // Recurse into existing folder on folder name conflict
                        yield folder.checkAndAssignExistingNames(getExistingNamesFn);
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_f && !_f.done && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_2) throw e_2.error; }
            }
        });
    }
    getBaseCosts() {
        if (!this.baseCosts) {
            throw new Error('Base costs on folder were never set!');
        }
        return this.baseCosts;
    }
    getBaseFileName() {
        return path_1.basename(this.filePath);
    }
    getTotalByteCount(encrypted = false) {
        let totalByteCount = 0;
        for (const file of this.files) {
            totalByteCount += encrypted ? +file.encryptedDataSize() : file.fileStats.size;
        }
        for (const folder of this.folders) {
            totalByteCount += +folder.getTotalByteCount(encrypted);
        }
        return new types_1.ByteCount(totalByteCount);
    }
}
exports.ArFSFolderToUpload = ArFSFolderToUpload;
