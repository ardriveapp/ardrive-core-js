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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlEncodeHashKey = exports.fetchMempool = exports.readJWKFile = exports.encryptFileOrFolderData = exports.winstonToAr = exports.sanitizePath = exports.weightedRandom = exports.Utf8ArrayToStr = exports.createPublicDriveSharingLink = exports.createPublicFileSharingLink = exports.createPrivateFileSharingLink = exports.backupWallet = exports.checkExactFileExistsSync = exports.checkFileExistsSync = exports.checkFolderExistsSync = exports.checkOrCreateFolder = exports.moveFolder = exports.extToMime = exports.formatBytes = exports.asyncForEach = exports.sleep = void 0;
// index.js
const mime = __importStar(require("mime-types"));
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("./crypto");
const constants_1 = require("./constants");
const jwk_wallet_1 = require("../jwk_wallet");
const axios_1 = __importDefault(require("axios"));
// Pauses application
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            setTimeout(resolve, ms);
        });
    });
}
exports.sleep = sleep;
// Asyncronous ForEach function
function asyncForEach(array, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let index = 0; index < array.length; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            yield callback(array[index], index, array);
        }
        return 'Done';
    });
}
exports.asyncForEach = asyncForEach;
// Format byte size to something nicer.  This is minified...
function formatBytes(bytes) {
    const marker = 1024; // Change to 1000 if required
    const decimal = 3; // Change as required
    const kiloBytes = marker; // One Kilobyte is 1024 bytes
    const megaBytes = marker * marker; // One MB is 1024 KB
    const gigaBytes = marker * marker * marker; // One GB is 1024 MB
    // const teraBytes = marker * marker * marker * marker; // One TB is 1024 GB
    // return bytes if less than a KB
    if (bytes < kiloBytes)
        return `${bytes} Bytes`;
    // return KB if less than a MB
    if (bytes < megaBytes)
        return `${(bytes / kiloBytes).toFixed(decimal)} KB`;
    // return MB if less than a GB
    if (bytes < gigaBytes)
        return `${(bytes / megaBytes).toFixed(decimal)} MB`;
    // return GB if less than a TB
    return `${(bytes / gigaBytes).toFixed(decimal)} GB`;
}
exports.formatBytes = formatBytes;
function extToMime(fullPath) {
    let extension = fullPath.substring(fullPath.lastIndexOf('.') + 1);
    extension = extension.toLowerCase();
    const m = mime.lookup(extension);
    return m === false ? 'unknown' : m;
}
exports.extToMime = extToMime;
/* Copies one folder to another folder location
const copyFolder = (oldFolderPath: string, newFolderPath: string) : string => {
  const readStream = fs.createReadStream(oldFolderPath);
  const writeStream = fs.createWriteStream(newFolderPath);

  readStream.on('error', err => {
    console.log ("Error copying folder");
    console.log (err);
    return 'Error';
  });

  writeStream.on('error', err => {
    console.log ("Error copying folder");
    console.log (err);
    return 'Error';
  });

  readStream.on('close', function () {
      fs.unlink(oldFolderPath, err => {
        if (err) {
          console.log ("Error finishing folder copy");
          console.log (err);
          return 'Error';
        }
        return 'Success';
      });
  });

  // Write the file
  readStream.pipe(writeStream);
  return 'Success'
} */
// Will try to move the folder and revert to a copy if it fails
function moveFolder(oldFolderPath, newFolderPath) {
    try {
        fs.renameSync(oldFolderPath, newFolderPath);
        return 'Success';
    }
    catch (err) {
        console.log('Error moving folder');
        console.log(err);
        return 'Error';
    }
}
exports.moveFolder = moveFolder;
// Checks path if it exists, and creates if not creates it
function checkOrCreateFolder(folderPath) {
    try {
        const stats = fs.statSync(folderPath);
        if (stats.isDirectory()) {
            return folderPath;
        }
        console.log('The path you have entered is not a directory, please enter a correct path.');
        return '0';
    }
    catch (err) {
        console.log('Folder not found.  Creating new directory at %s', folderPath);
        fs.mkdirSync(folderPath || '.');
        return folderPath;
    }
}
exports.checkOrCreateFolder = checkOrCreateFolder;
function checkFolderExistsSync(folderPath) {
    try {
        const stats = fs.statSync(folderPath);
        if (stats.isDirectory()) {
            return true; // directory exists
        }
        else {
            return false; // not a directory
        }
    }
    catch (err) {
        return false; // directory doesnt exist
    }
}
exports.checkFolderExistsSync = checkFolderExistsSync;
function checkFileExistsSync(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
    }
    catch (e) {
        return false;
    }
    return true;
}
exports.checkFileExistsSync = checkFileExistsSync;
function checkExactFileExistsSync(filePath, lastModifiedDate) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        const stats = fs.statSync(filePath);
        if (lastModifiedDate === Math.floor(stats.mtimeMs)) {
            // The files match
            return true;
        }
        else {
            // The local file has a different lastModifiedDate
            return false;
        }
    }
    catch (e) {
        // File doesnt exist
        return false;
    }
}
exports.checkExactFileExistsSync = checkExactFileExistsSync;
// // Check the latest file versions to ensure they exist locally, if not set them to download
// export async function checkForMissingLocalFiles(): Promise<string> {
// 	const localFiles: types.ArFSFileMetaData[] = await getDb.getAllLatestFileAndFolderVersionsFromSyncTable();
// 	await asyncForEach(localFiles, async (localFile: types.ArFSFileMetaData) => {
// 		fs.access(localFile.filePath, async (err) => {
// 			if (err) {
// 				await updateDb.setFileToDownload(localFile.metaDataTxId); // The file doesnt exist, so lets download it
// 			}
// 		});
// 	});
// 	return 'Success';
// }
// Takes the ArDrive User's JWK Private Key file and backs it up as a JSON to a folder specified by the user.
function backupWallet(backupWalletPath, wallet, owner) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const backupFileName = 'ArDrive_Backup_' + owner + '.json';
            const backupWalletFile = path_1.default.join(backupWalletPath, backupFileName);
            console.log('Writing your ArDrive Wallet backup to %s', backupWalletFile);
            fs.writeFileSync(backupWalletFile, JSON.stringify(wallet.getPrivateKey()));
            return 'Success!';
        }
        catch (err) {
            console.log(err);
            return 'Error';
        }
    });
}
exports.backupWallet = backupWallet;
// // Updates all local folder hashes
// export async function setAllFolderHashes(): Promise<string> {
// 	try {
// 		const options: HashElementOptions = { encoding: 'hex', folders: { exclude: ['.*'] } };
// 		const allFolders: types.ArFSFileMetaData[] = await getDb.getAllLocalFoldersFromSyncTable();
// 		// Update the hash of the parent folder
// 		await asyncForEach(allFolders, async (folder: types.ArFSFileMetaData) => {
// 			const folderHash = await hashElement(folder.filePath, options);
// 			await updateDb.updateFolderHashInSyncTable(folderHash.hash, folder.id);
// 		});
// 		return 'Folder hashes set';
// 	} catch (err) {
// 		//console.log (err)
// 		//console.log ("The parent folder is not present in the database yet")
// 		return 'Error';
// 	}
// }
// // Sets the hash of any file that is missing it
// export async function setAllFileHashes(): Promise<string> {
// 	try {
// 		const allFiles: types.ArFSFileMetaData[] = await getDb.getAllUnhashedLocalFilesFromSyncTable();
// 		// Update the hash of the file
// 		await asyncForEach(allFiles, async (file: types.ArFSFileMetaData) => {
// 			const fileHash = await checksumFile(file.filePath);
// 			await updateDb.updateFileHashInSyncTable(fileHash, file.id);
// 		});
// 		return 'All missing file hashes set';
// 	} catch (err) {
// 		//console.log (err)
// 		//console.log ("Error getting file hash")
// 		return 'Error';
// 	}
// }
// // Sets the has of all folders that are missing it
// export async function setAllFolderSizes(): Promise<string> {
// 	try {
// 		const allFolders: types.ArFSFileMetaData[] = await getDb.getAllLocalFoldersFromSyncTable();
// 		// Update the size of each folder
// 		await asyncForEach(allFolders, async (folder: types.ArFSFileMetaData) => {
// 			// Get the stats of the folder to get its inode value.  This differsn on windows/os/linux
// 			// This is set into the Size field to determine if the folder has been renamed
// 			// Ideally this would be improved upon
// 			const stats = fs.statSync(folder.filePath);
// 			const folderIno = stats.ino;
// 			await updateDb.updateFileSizeInSyncTable(folderIno, folder.id);
// 		});
// 		return 'All folder sizes set';
// 	} catch (err) {
// 		//console.log (err)
// 		//console.log ("Error getting folder size")
// 		return 'Error';
// 	}
// }
// // This will set the parent folder ID for any file that is missing it
// export async function setAllParentFolderIds(): Promise<string> {
// 	try {
// 		const allFilesOrFolders: types.ArFSFileMetaData[] = await getDb.getAllMissingParentFolderIdsFromSyncTable();
// 		await asyncForEach(allFilesOrFolders, async (fileOrFolder: types.ArFSFileMetaData) => {
// 			const parentFolderPath = dirname(fileOrFolder.filePath);
// 			const parentFolder: types.ArFSFileMetaData = await getDb.getFolderFromSyncTable(
// 				fileOrFolder.driveId,
// 				parentFolderPath
// 			);
// 			if (parentFolder !== undefined) {
// 				// console.log ("The parent folder for %s is missing.  Lets update it.", fileOrFolder.filePath)
// 				updateDb.setParentFolderId(parentFolder.fileId, fileOrFolder.id);
// 			}
// 		});
// 		return 'Folder hashes set';
// 	} catch (err) {
// 		// console.log (err)
// 		// console.log ("The parent folder is not present in the database yet")
// 		return 'Error';
// 	}
// }
// // updates the paths of all children of a given folder.
// export async function setFolderChildrenPaths(folder: types.ArFSFileMetaData): Promise<string> {
// 	const childFilesAndFolders: types.ArFSFileMetaData[] = await getDb.getFilesAndFoldersByParentFolderFromSyncTable(
// 		folder.fileId
// 	);
// 	if (childFilesAndFolders !== undefined) {
// 		await asyncForEach(childFilesAndFolders, async (fileOrFolder: types.ArFSFileMetaData) => {
// 			await updateFilePath(fileOrFolder);
// 			if (fileOrFolder.entityType === 'folder') {
// 				await setFolderChildrenPaths(fileOrFolder);
// 			}
// 		});
// 	}
// 	return 'Success';
// }
// // Fixes all empty file paths
// export async function setNewFilePaths(): Promise<string> {
// 	const filesToFix: types.ArFSFileMetaData[] = await getDb.getAllMissingPathsFromSyncTable();
// 	await asyncForEach(filesToFix, async (fileToFix: types.ArFSFileMetaData) => {
// 		// console.log ("   Fixing file path for %s | %s)", fileToFix.fileName, fileToFix.parentFolderId);
// 		await updateFilePath(fileToFix);
// 	});
// 	return 'Success';
// }
// // Determines the file path based on parent folder ID
// export async function updateFilePath(file: types.ArFSFileMetaData): Promise<string> {
// 	try {
// 		let rootFolderPath = await getDb.getRootFolderPathFromSyncTable(file.driveId);
// 		rootFolderPath = dirname(rootFolderPath.filePath);
// 		let parentFolderId = file.parentFolderId;
// 		let filePath = file.fileName;
// 		let parentFolderName;
// 		let parentOfParentFolderId;
// 		while (parentFolderId !== '0') {
// 			parentFolderName = await getDb.getFolderNameFromSyncTable(parentFolderId);
// 			filePath = path.join(parentFolderName.fileName, filePath);
// 			parentOfParentFolderId = await getDb.getFolderParentIdFromSyncTable(parentFolderId);
// 			parentFolderId = parentOfParentFolderId.parentFolderId;
// 		}
// 		const newFilePath: string = path.join(rootFolderPath, filePath);
// 		await updateDb.setFilePath(newFilePath, file.id);
// 		// console.log ("      Fixed!!!", newFilePath)
// 		return newFilePath;
// 	} catch (err) {
// 		// console.log (err)
// 		console.log('Error fixing the file path for %s, retrying later', file.fileName);
// 		return 'Error';
// 	}
// }
// // Creates a new drive, using the standard public privacy settings and adds to the Drive table
// export async function createNewPublicDrive(login: string, driveName: string): Promise<types.ArFSDriveMetaData> {
// 	const driveId = uuidv4();
// 	const rootFolderId = uuidv4();
// 	const unixTime = Math.round(Date.now() / 1000);
// 	const drive: types.ArFSDriveMetaData = {
// 		id: 0,
// 		login,
// 		appName: appName,
// 		appVersion: appVersion,
// 		driveName,
// 		rootFolderId,
// 		cipher: '',
// 		cipherIV: '',
// 		unixTime,
// 		arFS: arFSVersion,
// 		driveId,
// 		driveSharing: 'personal',
// 		drivePrivacy: 'public',
// 		driveAuthMode: '',
// 		metaDataTxId: '0',
// 		metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
// 		isLocal: 1
// 	};
// 	console.log('Creating a new public drive for %s, %s | %s', login, driveName, driveId);
// 	return drive;
// }
// // Creates a new drive, using the standard private privacy settings and adds to the Drive table
// export async function createNewPrivateDrive(login: string, driveName: string): Promise<types.ArFSDriveMetaData> {
// 	const driveId = uuidv4();
// 	const rootFolderId = uuidv4();
// 	const unixTime = Math.round(Date.now() / 1000);
// 	const drive: types.ArFSDriveMetaData = {
// 		id: 0,
// 		login,
// 		appName: appName,
// 		appVersion: appVersion,
// 		driveName,
// 		rootFolderId,
// 		cipher: defaultCipher,
// 		cipherIV: '',
// 		unixTime,
// 		arFS: arFSVersion,
// 		driveId,
// 		driveSharing: 'personal',
// 		drivePrivacy: 'private',
// 		driveAuthMode: 'password',
// 		metaDataTxId: '0',
// 		metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
// 		isLocal: 1
// 	};
// 	console.log('Creating a new private drive for %s, %s | %s', login, driveName, driveId);
// 	return drive;
// }
// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
function createPrivateFileSharingLink(user, fileToShare) {
    return __awaiter(this, void 0, void 0, function* () {
        let fileSharingUrl = '';
        try {
            const driveKey = yield crypto_1.deriveDriveKey(user.dataProtectionKey, fileToShare.driveId, user.walletPrivateKey);
            const fileKey = yield crypto_1.deriveFileKey(fileToShare.fileId, driveKey);
            fileSharingUrl = constants_1.stagingAppUrl.concat('/#/file/', fileToShare.fileId, '/view?fileKey=', fileKey.toString('base64'));
        }
        catch (err) {
            console.log(err);
            console.log('Cannot generate Private File Sharing Link');
            fileSharingUrl = 'Error';
        }
        return fileSharingUrl;
    });
}
exports.createPrivateFileSharingLink = createPrivateFileSharingLink;
// Creates a Public file sharing link using the File Id.
function createPublicFileSharingLink(fileToShare) {
    return __awaiter(this, void 0, void 0, function* () {
        let fileSharingUrl = '';
        try {
            fileSharingUrl = constants_1.stagingAppUrl.concat('/#/file/', fileToShare.fileId, '/view');
        }
        catch (err) {
            console.log(err);
            console.log('Cannot generate Public File Sharing Link');
            fileSharingUrl = 'Error';
        }
        return fileSharingUrl;
    });
}
exports.createPublicFileSharingLink = createPublicFileSharingLink;
// Creates a Public drive sharing link using the Drive Id
function createPublicDriveSharingLink(driveToShare) {
    return __awaiter(this, void 0, void 0, function* () {
        let driveSharingUrl = '';
        try {
            driveSharingUrl = constants_1.stagingAppUrl.concat('/#/drives/', driveToShare.driveId);
        }
        catch (err) {
            console.log(err);
            console.log('Cannot generate Public Drive Sharing Link');
            driveSharingUrl = 'Error';
        }
        return driveSharingUrl;
    });
}
exports.createPublicDriveSharingLink = createPublicDriveSharingLink;
function Utf8ArrayToStr(array) {
    return __awaiter(this, void 0, void 0, function* () {
        let out, i, c;
        let char2, char3;
        out = '';
        const len = array.length;
        i = 0;
        while (i < len) {
            c = array[i++];
            switch (c >> 4) {
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                    // 0xxxxxxx
                    out += String.fromCharCode(c);
                    break;
                case 12:
                case 13:
                    // 110x xxxx   10xx xxxx
                    char2 = array[i++];
                    out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
                    break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0));
                    break;
            }
        }
        return out;
    });
}
exports.Utf8ArrayToStr = Utf8ArrayToStr;
// Used by the selectWeightedRanom function to determine who receives a tip
function weightedRandom(dict) {
    let sum = 0;
    const r = Math.random();
    for (const addr of Object.keys(dict)) {
        sum += dict[addr];
        if (r <= sum && dict[addr] > 0) {
            return addr;
        }
    }
    return;
}
exports.weightedRandom = weightedRandom;
// Ensures a file path does not contain invalid characters
function sanitizePath(path) {
    return __awaiter(this, void 0, void 0, function* () {
        path = path.replace(/[\\/:*?"<>|]/g, '');
        while (path.charAt(path.length - 1) == '.') {
            // remove trailing dots
            path = path.substr(0, path.length - 1);
        }
        while (path.charAt(path.length - 1) == ' ') {
            // remove trailing spaces
            path = path.substr(0, path.length - 1);
        }
        if (path === '.') {
            return ''; // Return nothing if only a . is left.  This will then be ignored.
        }
        else {
            return path;
        }
    });
}
exports.sanitizePath = sanitizePath;
// export async function getArUSDPrice(): Promise<number> {
// 	let usdPrice = 0;
// 	try {
// 		const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd');
// 		usdPrice = (await res.clone().json()).arweave.usd;
// 		return usdPrice;
// 	} catch (err) {
// 		console.log('Error getting AR/USD price from Coingecko');
// 		return 0;
// 	}
// }
/**
 * Converts Winston value into AR
 *
 * @throws Error when Winston value is not an integer
 *
 * @TODO Handle integer overflow
 */
function winstonToAr(winston) {
    if (!Number.isInteger(winston))
        throw new Error(`Winston value not an integer: ${winston}`);
    return winston * 1e-12;
}
exports.winstonToAr = winstonToAr;
// Returns encrypted data using driveKey for folders, and fileKey for files
function encryptFileOrFolderData(itemToUpload, driveKey, secondaryFileMetaDataJSON) {
    return __awaiter(this, void 0, void 0, function* () {
        const encryptionKey = itemToUpload.entityType === 'folder' ? driveKey : yield crypto_1.deriveFileKey(itemToUpload.fileId, driveKey);
        const encryptedData = yield crypto_1.fileEncrypt(encryptionKey, Buffer.from(secondaryFileMetaDataJSON));
        return encryptedData;
    });
}
exports.encryptFileOrFolderData = encryptFileOrFolderData;
function readJWKFile(path) {
    const walletFileData = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });
    const walletJSON = JSON.parse(walletFileData);
    const walletJWK = walletJSON;
    const wallet = new jwk_wallet_1.JWKWallet(walletJWK);
    return wallet;
}
exports.readJWKFile = readJWKFile;
function fetchMempool() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios_1.default.get('https://arweave.net/tx/pending');
        return response.data;
    });
}
exports.fetchMempool = fetchMempool;
function urlEncodeHashKey(keyBuffer) {
    return keyBuffer.toString('base64').replace('=', '');
}
exports.urlEncodeHashKey = urlEncodeHashKey;
