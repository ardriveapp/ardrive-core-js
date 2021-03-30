// index.js
import * as mime from 'mime-types';
import fetch from 'node-fetch';
import * as fs from 'fs';
import path, { dirname } from 'path';
import { Wallet, ArFSDriveMetaData, ArFSFileMetaData, ArDriveUser } from './types';
import {
	getAllLocalFoldersFromSyncTable,
	getAllMissingParentFolderIdsFromSyncTable,
	getAllMissingPathsFromSyncTable,
	getAllUnhashedLocalFilesFromSyncTable,
	getFolderFromSyncTable,
	getFolderNameFromSyncTable,
	getFolderParentIdFromSyncTable,
	getFilesAndFoldersByParentFolderFromSyncTable,
	getRootFolderPathFromSyncTable,
	getAllLatestFileAndFolderVersionsFromSyncTable
} from './db_get';
import {
	setFilePath,
	setParentFolderId,
	updateFileHashInSyncTable,
	updateFolderHashInSyncTable,
	setFileToDownload,
	updateFileSizeInSyncTable
} from './db_update';
import { checksumFile, deriveDriveKey, deriveFileKey } from './crypto';
import { v4 as uuidv4 } from 'uuid';

// import hashElement from 'folder-hash';
const { hashElement } = require('folder-hash');

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';
export const graphQLURL = gatewayURL.concat('graphql');
export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';
export const arFSVersion = '0.11';
export const cipher = 'AES256-GCM';

// Pauses application
const sleep = async (ms: number): Promise<number> => {
	return new Promise((resolve) => {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		setTimeout(resolve, ms);
	});
};

// Asyncronous ForEach function
const asyncForEach = async (array: any[], callback: any): Promise<string> => {
	for (let index = 0; index < array.length; index += 1) {
		// eslint-disable-next-line no-await-in-loop
		await callback(array[index], index, array);
	}
	return 'Done';
};

// Format byte size to something nicer.  This is minified...
const formatBytes = (bytes: number): string => {
	const marker = 1024; // Change to 1000 if required
	const decimal = 3; // Change as required
	const kiloBytes = marker; // One Kilobyte is 1024 bytes
	const megaBytes = marker * marker; // One MB is 1024 KB
	const gigaBytes = marker * marker * marker; // One GB is 1024 MB
	// const teraBytes = marker * marker * marker * marker; // One TB is 1024 GB

	// return bytes if less than a KB
	if (bytes < kiloBytes) return `${bytes} Bytes`;
	// return KB if less than a MB
	if (bytes < megaBytes) return `${(bytes / kiloBytes).toFixed(decimal)} KB`;
	// return MB if less than a GB
	if (bytes < gigaBytes) return `${(bytes / megaBytes).toFixed(decimal)} MB`;
	// return GB if less than a TB
	return `${(bytes / gigaBytes).toFixed(decimal)} GB`;
};

const extToMime = (fullPath: string): string => {
	let extension = fullPath.substring(fullPath.lastIndexOf('.') + 1);
	extension = extension.toLowerCase();
	const m = mime.lookup(extension);
	return m === false ? 'unknown' : m;
};

// Gets the price of AR based on amount of data
const getWinston = async (bytes: number): Promise<number> => {
	const response = await fetch(`https://arweave.net/price/${bytes}`);
	// const response = await fetch(`https://perma.online/price/${bytes}`);
	const winston = await response.json();
	return winston;
};

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
const moveFolder = (oldFolderPath: string, newFolderPath: string): string => {
	try {
		fs.renameSync(oldFolderPath, newFolderPath);
		return 'Success';
	} catch (err) {
		console.log('Error moving folder');
		console.log(err);
		return 'Error';
	}
};

// Checks path if it exists, and creates if not creates it
const checkOrCreateFolder = (folderPath: string): string => {
	try {
		const stats = fs.statSync(folderPath);
		if (stats.isDirectory()) {
			return folderPath;
		}
		console.log('The path you have entered is not a directory, please enter a correct path.');
		return '0';
	} catch (err) {
		console.log('Folder not found.  Creating new directory at %s', folderPath);
		fs.mkdirSync(folderPath);
		return folderPath;
	}
};

const checkFolderExistsSync = (folderPath: string): boolean => {
	try {
		const stats = fs.statSync(folderPath);
		if (stats.isDirectory()) {
			return true; // directory exists
		} else {
			return false; // not a directory
		}
	} catch (err) {
		return false; // directory doesnt exist
	}
};

const checkFileExistsSync = (filePath: string): boolean => {
	try {
		fs.accessSync(filePath, fs.constants.F_OK);
	} catch (e) {
		return false;
	}
	return true;
};

const checkExactFileExistsSync = (filePath: string, lastModifiedDate: number): boolean => {
	try {
		fs.accessSync(filePath, fs.constants.F_OK);
		const stats = fs.statSync(filePath);
		if (lastModifiedDate === Math.floor(stats.mtimeMs)) {
			// The files match
			return true;
		} else {
			// The local file has a different lastModifiedDate
			return false;
		}
	} catch (e) {
		// File doesnt exist
		return false;
	}
};

// Check the latest file versions to ensure they exist locally, if not set them to download
async function checkForMissingLocalFiles(): Promise<string> {
	const localFiles: ArFSFileMetaData[] = await getAllLatestFileAndFolderVersionsFromSyncTable();
	await asyncForEach(localFiles, async (localFile: ArFSFileMetaData) => {
		fs.access(localFile.filePath, async (err) => {
			if (err) {
				await setFileToDownload(localFile.metaDataTxId); // The file doesnt exist, so lets download it
			}
		});
	});
	return 'Success';
}

// Takes the ArDrive User's JWK Private Key file and backs it up as a JSON to a folder specified by the user.
const backupWallet = async (backupWalletPath: string, wallet: Wallet, owner: string): Promise<string> => {
	try {
		const backupFileName = 'ArDrive_Backup_' + owner + '.json';
		const backupWalletFile = path.join(backupWalletPath, backupFileName);
		console.log('Writing your ArDrive Wallet backup to %s', backupWalletFile);
		fs.writeFileSync(backupWalletFile, JSON.stringify(wallet.walletPrivateKey));
		return 'Success!';
	} catch (err) {
		console.log(err);
		return 'Error';
	}
};

// Updates all local folder hashes
const setAllFolderHashes = async (): Promise<string> => {
	try {
		const options = { encoding: 'hex', folders: { exclude: ['.*'] } };
		const allFolders: ArFSFileMetaData[] = await getAllLocalFoldersFromSyncTable();
		// Update the hash of the parent folder
		await asyncForEach(allFolders, async (folder: ArFSFileMetaData) => {
			const folderHash = await hashElement(folder.filePath, options);
			await updateFolderHashInSyncTable(folderHash.hash, folder.id);
		});
		return 'Folder hashes set';
	} catch (err) {
		//console.log (err)
		//console.log ("The parent folder is not present in the database yet")
		return 'Error';
	}
};

// Sets the hash of any file that is missing it
const setAllFileHashes = async (): Promise<string> => {
	try {
		const allFiles: ArFSFileMetaData[] = await getAllUnhashedLocalFilesFromSyncTable();
		// Update the hash of the file
		await asyncForEach(allFiles, async (file: ArFSFileMetaData) => {
			const fileHash = await checksumFile(file.filePath);
			await updateFileHashInSyncTable(fileHash, file.id);
		});
		return 'All missing file hashes set';
	} catch (err) {
		//console.log (err)
		//console.log ("Error getting file hash")
		return 'Error';
	}
};

// Sets the has of all folders that are missing it
const setAllFolderSizes = async (): Promise<string> => {
	try {
		const allFolders: ArFSFileMetaData[] = await getAllLocalFoldersFromSyncTable();
		// Update the size of each folder
		await asyncForEach(allFolders, async (folder: ArFSFileMetaData) => {
			// Get the stats of the folder to get its inode value.  This differsn on windows/os/linux
			// This is set into the Size field to determine if the folder has been renamed
			// Ideally this would be improved upon
			const stats = fs.statSync(folder.filePath);
			const folderIno = stats.ino;
			await updateFileSizeInSyncTable(folderIno, folder.id);
		});
		return 'All folder sizes set';
	} catch (err) {
		//console.log (err)
		//console.log ("Error getting folder size")
		return 'Error';
	}
};

// This will set the parent folder ID for any file that is missing it
const setAllParentFolderIds = async (): Promise<string> => {
	try {
		const allFilesOrFolders: ArFSFileMetaData[] = await getAllMissingParentFolderIdsFromSyncTable();
		await asyncForEach(allFilesOrFolders, async (fileOrFolder: ArFSFileMetaData) => {
			const parentFolderPath = dirname(fileOrFolder.filePath);
			const parentFolder: ArFSFileMetaData = await getFolderFromSyncTable(fileOrFolder.driveId, parentFolderPath);
			if (parentFolder !== undefined) {
				// console.log ("The parent folder for %s is missing.  Lets update it.", fileOrFolder.filePath)
				setParentFolderId(parentFolder.fileId, fileOrFolder.id);
			}
		});
		return 'Folder hashes set';
	} catch (err) {
		// console.log (err)
		// console.log ("The parent folder is not present in the database yet")
		return 'Error';
	}
};

// updates the paths of all children of a given folder.
async function setFolderChildrenPaths(folder: ArFSFileMetaData): Promise<string> {
	const childFilesAndFolders: ArFSFileMetaData[] = await getFilesAndFoldersByParentFolderFromSyncTable(folder.fileId);
	if (childFilesAndFolders !== undefined) {
		await asyncForEach(childFilesAndFolders, async (fileOrFolder: ArFSFileMetaData) => {
			await updateFilePath(fileOrFolder);
			if (fileOrFolder.entityType === 'folder') {
				await setFolderChildrenPaths(fileOrFolder);
			}
		});
	}
	return 'Success';
}

// Fixes all empty file paths
async function setNewFilePaths(): Promise<string> {
	const filesToFix: ArFSFileMetaData[] = await getAllMissingPathsFromSyncTable();
	await asyncForEach(filesToFix, async (fileToFix: ArFSFileMetaData) => {
		// console.log ("   Fixing file path for %s | %s)", fileToFix.fileName, fileToFix.parentFolderId);
		await updateFilePath(fileToFix);
	});
	return 'Success';
}

// Determines the file path based on parent folder ID
const updateFilePath = async (file: ArFSFileMetaData): Promise<string> => {
	try {
		let rootFolderPath = await getRootFolderPathFromSyncTable(file.driveId);
		rootFolderPath = dirname(rootFolderPath.filePath);
		let parentFolderId = file.parentFolderId;
		let filePath = file.fileName;
		let parentFolderName;
		let parentOfParentFolderId;
		while (parentFolderId !== '0') {
			parentFolderName = await getFolderNameFromSyncTable(parentFolderId);
			filePath = path.join(parentFolderName.fileName, filePath);
			parentOfParentFolderId = await getFolderParentIdFromSyncTable(parentFolderId);
			parentFolderId = parentOfParentFolderId.parentFolderId;
		}
		const newFilePath: string = path.join(rootFolderPath, filePath);
		await setFilePath(newFilePath, file.id);
		// console.log ("      Fixed!!!", newFilePath)
		return newFilePath;
	} catch (err) {
		// console.log (err)
		console.log('Error fixing the file path for %s, retrying later', file.fileName);
		return 'Error';
	}
};

// Creates a new drive, using the standard public privacy settings and adds to the Drive table
const createNewPublicDrive = async (login: string, driveName: string): Promise<ArFSDriveMetaData> => {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	const drive: ArFSDriveMetaData = {
		id: 0,
		login,
		appName: appName,
		appVersion: appVersion,
		driveName,
		rootFolderId,
		cipher: '',
		cipherIV: '',
		unixTime,
		arFS: arFSVersion,
		driveId,
		driveSharing: 'personal',
		drivePrivacy: 'public',
		driveAuthMode: '',
		metaDataTxId: '0',
		metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
		isLocal: 1
	};
	console.log('Creating a new public drive for %s, %s | %s', login, driveName, driveId);
	return drive;
};

// Creates a new drive, using the standard private privacy settings and adds to the Drive table
const createNewPrivateDrive = async (login: string, driveName: string): Promise<ArFSDriveMetaData> => {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	const drive: ArFSDriveMetaData = {
		id: 0,
		login,
		appName: appName,
		appVersion: appVersion,
		driveName,
		rootFolderId,
		cipher: cipher,
		cipherIV: '',
		unixTime,
		arFS: arFSVersion,
		driveId,
		driveSharing: 'personal',
		drivePrivacy: 'private',
		driveAuthMode: 'password',
		metaDataTxId: '0',
		metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
		isLocal: 1
	};
	console.log('Creating a new private drive for %s, %s | %s', login, driveName, driveId);
	return drive;
};

// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
const createPrivateFileSharingLink = async (user: ArDriveUser, fileToShare: ArFSFileMetaData): Promise<string> => {
	let fileSharingUrl = '';
	try {
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			fileToShare.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(fileToShare.fileId, driveKey);
		fileSharingUrl = stagingAppUrl.concat(
			'/#/file/',
			fileToShare.fileId,
			'/view?fileKey=',
			fileKey.toString('base64')
		);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Private File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
};

// Creates a Public file sharing link using the File Id.
const createPublicFileSharingLink = async (fileToShare: ArFSFileMetaData): Promise<string> => {
	let fileSharingUrl = '';
	try {
		fileSharingUrl = stagingAppUrl.concat('/#/file/', fileToShare.fileId, '/view');
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
};

// Creates a Public drive sharing link using the Drive Id
const createPublicDriveSharingLink = async (driveToShare: ArFSDriveMetaData): Promise<string> => {
	let driveSharingUrl = '';
	try {
		driveSharingUrl = stagingAppUrl.concat('/#/drives/', driveToShare.driveId);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public Drive Sharing Link');
		driveSharingUrl = 'Error';
	}
	return driveSharingUrl;
};

async function Utf8ArrayToStr(array: any): Promise<string> {
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
}

// Used by the selectWeightedRanom function to determine who receives a tip
const weightedRandom = (dict: Record<string, number>): string | undefined => {
	let sum = 0;
	const r = Math.random();

	for (const addr of Object.keys(dict)) {
		sum += dict[addr];
		if (r <= sum && dict[addr] > 0) {
			return addr;
		}
	}
	return;
};

// Ensures a file path does not contain invalid characters
const sanitizePath = async (path: string): Promise<string> => {
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
	} else {
		return path;
	}
};

const getArUSDPrice = async (): Promise<number> => {
	let usdPrice = 0;
	try {
		const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd');
		usdPrice = (await res.clone().json()).arweave.usd;
		return usdPrice;
	} catch (err) {
		console.log('Error getting AR/USD price from Coingecko');
		return 0;
	}
};

export {
	sleep,
	asyncForEach,
	formatBytes,
	extToMime,
	getWinston,
	checkOrCreateFolder,
	moveFolder,
	backupWallet,
	checkFileExistsSync,
	checkForMissingLocalFiles,
	setFolderChildrenPaths,
	setAllFolderHashes,
	setAllFileHashes,
	setAllFolderSizes,
	checkFolderExistsSync,
	checkExactFileExistsSync,
	Utf8ArrayToStr,
	createNewPublicDrive,
	createNewPrivateDrive,
	setAllParentFolderIds,
	setNewFilePaths,
	updateFilePath,
	weightedRandom,
	sanitizePath,
	createPublicFileSharingLink,
	createPrivateFileSharingLink,
	createPublicDriveSharingLink,
	getArUSDPrice
};
