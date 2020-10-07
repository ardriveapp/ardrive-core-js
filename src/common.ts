// index.js
import * as mime from 'mime-types';
import fetch from 'node-fetch';
import * as fs from 'fs';
import path, { dirname } from 'path';
import { Wallet, ArFSDriveMetadata, ArFSFileMetaData } from './types';
import { 
  getAllLocalFilesFromSyncTable, 
  getAllLocalFoldersFromSyncTable, 
  getAllMissingParentFolderIdsFromSyncTable, 
  getAllMissingPathsFromSyncTable, 
  getArDriveSyncFolderPathFromProfile, 
  getFolderFromSyncTable, 
  setFilePath, 
  setParentFolderId, 
  updateFileHashInSyncTable, 
  updateFolderHashInSyncTable } from './db';
import { checksumFile } from './crypto';
import { Path } from 'typescript';

export const gatewayURL = 'https://arweave.net/';
export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';
export const arFSVersion = '0.10';
export const cipher = "AES256-GCM"

const { v4: uuidv4 } = require('uuid');
const { hashElement } = require('folder-hash');

// Pauses application
const sleep = async (ms: number) => {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    setTimeout(resolve, ms);
  });
};

// Asyncronous ForEach function
const asyncForEach = async (array: any[], callback: any) => {
  for (let index = 0; index < array.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
};

// Format byte size to something nicer.  This is minified...
const formatBytes = (bytes: number) => {
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
  let extension = fullPath.substring(fullPath.lastIndexOf(".")+1)
  extension = extension.toLowerCase();
  const m = mime.lookup(extension);
  return m === false ? 'unknown' : m;
};

// Gets the price of AR based on amount of data
const getWinston = async (bytes: any) => {
  const response = await fetch(`https://arweave.net/price/${bytes}`);
  // const response = await fetch(`https://perma.online/price/${bytes}`);
  const winston = await response.json();
  return winston;
};

// Checks path if it exists, and creates if not creates it
const checkOrCreateFolder = (folderPath: Path) : Path | String => {
  try {
    const stats = fs.statSync(folderPath);
    if (stats.isDirectory()) {
      return folderPath;
    }
    console.log(
      'The path you have entered is not a directory, please enter a correct path.',
    );
    return '0';
  } catch (err) {
    console.log('Folder not found.  Creating new directory at %s', folderPath);
    fs.mkdirSync(folderPath);
    return folderPath;
  }
};

const checkFolderExistsSync = (folderPath: string) => {
  try {
    const stats = fs.statSync(folderPath);
    if (stats.isDirectory()) {
      return true; // directory exists
    }
    else {
      return false; // not a directory
    }
  } catch (err) {
    return false; // directory doesnt exist
  }
}

const checkFileExistsSync = (filePath: string) => {
  let exists = true;
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
  } catch (e) {
    exists = false;
  }
  return exists;
};

const backupWallet = async (backupWalletPath: Path, wallet: Wallet, owner: string) => {
  try {
    const backupFileName = "ArDrive_Backup_" + owner + ".json";
    const backupWalletFile = path.join(backupWalletPath, backupFileName)
    console.log('Writing your ArDrive Wallet backup to %s', backupWalletFile);
    fs.writeFileSync(backupWalletFile, JSON.stringify(wallet.walletPrivateKey));
    return 'Success!';
  } catch (err) {
    console.log(err);
    return 0;
  }
};

const setAllFolderHashes = async () => {
  try {
    const options = { encoding: 'hex', folders: { exclude: ['.*'] } };
    const allFolders : ArFSFileMetaData[] = await getAllLocalFoldersFromSyncTable()
    // Update the hash of the parent folder
    await asyncForEach(allFolders, async (folder: ArFSFileMetaData) => {
      const folderHash = await hashElement(folder.filePath, options)
      await updateFolderHashInSyncTable(folderHash.hash, folder.id)
    })
    return "Folder hashes set"
  }
  catch (err) {
    console.log (err)
    console.log ("The parent folder is not present in the database yet")
    return "Error"
  }
}

const setAllFileHashes = async () => {
  try {
    const allFiles : ArFSFileMetaData[]= await getAllLocalFilesFromSyncTable()
    // Update the hash of the parent folder
    await asyncForEach(allFiles, async (file: ArFSFileMetaData) => {
      let fileHash = await checksumFile(file.filePath);
      await updateFileHashInSyncTable(fileHash, file.id)
    })
    return "Folder hashes set"
  }
  catch (err) {
    console.log (err)
    console.log ("The parent folder is not present in the database yet")
    return "Error"
  }
}

const setAllParentFolderIds = async () => {
  try {
    const allFilesOrFolders : ArFSFileMetaData[]= await getAllMissingParentFolderIdsFromSyncTable()
    // Update the hash of the parent folder
    await asyncForEach(allFilesOrFolders, async (fileOrFolder: ArFSFileMetaData) => {
      const parentFolderPath = dirname(fileOrFolder.filePath);
      let parentFolder : ArFSFileMetaData = await getFolderFromSyncTable(parentFolderPath);
      if (parentFolder !== undefined) {
        console.log ("The parent folder for %s is missing.  Lets update it.", fileOrFolder.filePath)
        setParentFolderId(parentFolder.fileId, fileOrFolder.id)
      }
    })
    return "Folder hashes set"
  }
  catch (err) {
    console.log (err)
    console.log ("The parent folder is not present in the database yet")
    return "Error"
  }

}

// Fixes all empty file paths
async function setNewFilePaths() {
  let syncFolderPath = await getArDriveSyncFolderPathFromProfile()  
  let filePath = '';
  const filesToFix : ArFSFileMetaData[]= await getAllMissingPathsFromSyncTable()
  // console.log ("Found %s paths to fix", pathsToFix.length)
  await asyncForEach(filesToFix, async (fileToFix: ArFSFileMetaData) => {
    console.log ("   Fixing file path for %s | %s)", fileToFix.fileName, fileToFix.parentFolderId);
    filePath = await determineFilePath(syncFolderPath.syncFolderPath, fileToFix.parentFolderId, fileToFix.fileName)
    await setFilePath(filePath, fileToFix.id)
  })
};

// This needs updating
// Determines the file path based on parent folder ID
async function determineFilePath(syncFolderPath: string, parentFolderId: string, fileName: string) {
  try {
    let filePath = '\\' + fileName;
    let parentFolderName;
    let parentOfParentFolderId;
    let x = 0;
    while ((parentFolderId !== '0') && (x < 10)) {
      parentFolderName = await getFolderNameFromSyncTable(parentFolderId)
      filePath = '\\' + parentFolderName.fileName + filePath
      parentOfParentFolderId = await getFolderParentIdFromSyncTable(parentFolderId)
      parentFolderId = parentOfParentFolderId.parentFolderId;
      x += 1;
    }
    filePath = syncFolderPath.concat(filePath)
    console.log ("      Fixed!!!", filePath)
    return filePath;
  }
  catch (err) {
    console.log (err)
    console.log ("Error fixing %s", fileName)
    return 'Error'
  }
};

// Creates a new drive, using the standard public privacy settings and adds to the Drive table
const createNewPublicDrive = async (driveName: string) : Promise<ArFSDriveMetadata> => {
  let driveId = uuidv4();
  let rootFolderId = uuidv4();
  let unixTime = Date.now();
  let drive : ArFSDriveMetadata = {
    id: 0,
    appName: appName,
    appVersion: appVersion,
    driveName,
    rootFolderId,
    cipher: '',
    cipherIV: '',
    unixTime,
    arFS: arFSVersion,
    driveId,
    drivePrivacy: 'public',
    driveAuthMode: '',
    metaDataTxId: '0',
    metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
    permaWebLink: '',
  };
  console.log ("Creating a new public drive, %s | %s", driveName, driveId)
  return drive;
}

// Creates a new drive, using the standard private privacy settings and adds to the Drive table
const createNewPrivateDrive = async (driveName: string) : Promise<ArFSDriveMetadata> => {
  let driveId = uuidv4();
  let rootFolderId = uuidv4();
  let unixTime = Date.now();
  let drive : ArFSDriveMetadata = {
    id: 0,
    appName: appName,
    appVersion: appVersion,
    driveName,
    rootFolderId,
    cipher: cipher,
    cipherIV: '',
    unixTime,
    arFS: arFSVersion,
    driveId,
    drivePrivacy: 'private',
    driveAuthMode: 'password',
    metaDataTxId: '0',
    metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
    permaWebLink: '',
  };
  console.log ("Creating a new private drive, %s | %s", driveName, driveId)
  return drive;
}

async function Utf8ArrayToStr(array: any) : Promise<string> {
  var out, i, len, c;
  var char2, char3;

  out = "";
  len = array.length;
  i = 0;
  while (i < len) {
    c = array[i++];
    switch (c >> 4)
    { 
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        // 110x xxxx   10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(((c & 0x0F) << 12) |
                                   ((char2 & 0x3F) << 6) |
                                   ((char3 & 0x3F) << 0));
        break;
    }
  }    
  return out;
}

export {
  sleep,
  asyncForEach,
  formatBytes,
  extToMime,
  getWinston,
  checkOrCreateFolder,
  backupWallet,
  checkFileExistsSync,
  setAllFolderHashes,
  setAllFileHashes,
  checkFolderExistsSync,
  Utf8ArrayToStr,
  createNewPublicDrive,
  createNewPrivateDrive,
  setAllParentFolderIds,
  setNewFilePaths,
  determineFilePath,
};
