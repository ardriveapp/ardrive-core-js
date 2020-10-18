// files.js
import path, { sep, extname, basename, dirname } from 'path';
import * as fs from 'fs';
import { extToMime, appName, appVersion, checkFileExistsSync } from './common';
import { checksumFile } from './crypto';
import {
  addFileToSyncTable,
  getFolderFromSyncTable,
  getByFileNameAndHashAndParentFolderIdFromSyncTable,
  getByFilePathFromSyncTable,
  getByFileHashAndParentFolderFromSyncTable,
  getByFileHashAndFileNameFromSyncTable,
  setPermaWebFileToIgnore,
  setPermaWebFileToOverWrite,
  getFolderByHashFromSyncTable,
  getAllDrivesFromDriveTable
} from './db';
import * as chokidar from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import { ArFSDriveMetadata, ArFSFileMetaData } from './types';

const { hashElement } = require('folder-hash');

const queueFile = async (filePath: string, syncFolderPath: string) => {
  // Check to see if the file is ready
  let stats = null;
  let extension = extname(filePath).toLowerCase();
  const fileName = basename(filePath);
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    console.log('File not ready yet %s', filePath);
    return;
  }

  // Skip if file is encrypted or size is 0
  if (extension !== '.enc' && stats.size !== 0 && !fileName.startsWith('~$')) {

    // Check if the parent folder has been added to the DB first
    const parentFolderPath = dirname(filePath);
    let parentFolder : ArFSFileMetaData = await getFolderFromSyncTable(parentFolderPath);
    let parentFolderId = '';
    if (parentFolder !== undefined) {
      parentFolderId = parentFolder.fileId;
    }

    // Get the file hash using MD-5
    const fileHash = await checksumFile(filePath);

    // Get the modified time in milliseconds
    const lastModifiedDate = Math.floor(stats.mtimeMs);

    // Get the Drive ID and Privacy status
    let isPublic = 0;
    let driveId = '';
    const allDrives: ArFSDriveMetadata[] = await getAllDrivesFromDriveTable();
    allDrives.forEach((drive: ArFSDriveMetadata) => {
      let pathToCheck : string = syncFolderPath + '\\' + drive.driveName + '\\'
      if (filePath.indexOf(pathToCheck) !== -1) {
        driveId = drive.driveId;
        // determine if drive is public or private
        if (drive.drivePrivacy === 'public') {
          // File is in the public drive.
          isPublic = 1;
        } else if (drive.drivePrivacy === 'private') {
          isPublic = 0;
        }
      }
    })

    // Check if the exact file already exists in the same location
    const exactMatch = await getByFileNameAndHashAndParentFolderIdFromSyncTable(fileName, fileHash, parentFolderId);
    if (exactMatch) {
      // This file's version already exists.  Do nothing
      console.log ("   Already found a match for %s", filePath)
      return;
    }

    // Check if this is a new version of an existing file path, if yes, reuse the fileid and increment version
    const newFileVersion = await getByFilePathFromSyncTable(filePath);
    if (newFileVersion) {
      // Add new version of existing file
      newFileVersion.unixTime = Date.now();
      newFileVersion.fileVersion += 1;
      newFileVersion.metaDataTx = '0';
      newFileVersion.dataTx = '0';
      newFileVersion.lastModifiedDate = lastModifiedDate;
      newFileVersion.fileHash = fileHash;
      newFileVersion.fileSize = stats.size;
      newFileVersion.fileDataSyncStatus = 1; // Sync status of 1
      console.log('   Updating file %s version to %s', filePath, newFileVersion.fileVersion);
      await addFileToSyncTable(newFileVersion);
      return;
    }
 
    // Check if the file has been renamed by looking at its hash and base path
    // The older version of the file must not also be present anymore, or else this is just a copy
    const renamedFile = await getByFileHashAndParentFolderFromSyncTable(fileHash, parentFolderPath.concat('%'));
    if (renamedFile && !(checkFileExistsSync(renamedFile.filePath))) {
      // The file has been renamed.  Submit as Metadata.
      console.log('   %s was just renamed', filePath);
      renamedFile.unixTime = Date.now();
      renamedFile.metaDataTxId = '0';
      renamedFile.fileName = fileName;
      renamedFile.filePath = filePath;
      renamedFile.isLocal = 1;
      renamedFile.fileMetaDataSyncStatus = 1; // Sync status of 1 = metadatatx only
      await addFileToSyncTable(renamedFile);
      return;
    }

    // Check if the file has been moved by seeing if another file with the same hash and name
    // The older version of the file must also not be present anymore, or else this is just a copy
    const movedFile = await getByFileHashAndFileNameFromSyncTable(fileHash, fileName);
    if (movedFile && !(checkFileExistsSync(movedFile.filePath))) {
      console.log('   %s has been moved', filePath);
      movedFile.unixTime = Date.now();
      movedFile.metaDataTxId = '0';
      movedFile.fileName = fileName;
      movedFile.filePath = filePath;
      movedFile.parentFolderId = parentFolderId;
      movedFile.fileMetaDataSyncStatus = 1; // Sync status of 1 = metadatatx only
      await addFileToSyncTable(movedFile);
      return;
    }

    // No match, so queue a new file
    console.log('   Queuing a new file for upload %s', filePath);
    const unixTime = Date.now();
    const contentType = extToMime(filePath);
    const fileId = uuidv4();
    const fileSize = stats.size;
    const newFileToQueue : ArFSFileMetaData = {
      id: 0,
      appName,
      appVersion,
      unixTime,
      contentType,
      entityType: 'file',
      driveId,
      parentFolderId,
      fileId,
      filePath,
      fileName,
      fileHash,
      fileSize,
      lastModifiedDate,
      fileVersion: 0,
      isPublic,
      isLocal: 1,
      metaDataTxId: '0',
      dataTxId: '0',
      permaWebLink: '',
      fileDataSyncStatus: 1, // Sync status of 1 requires a data tx
      fileMetaDataSyncStatus: 1, // Sync status of 1 requires a metadata tx
      cipher: '',
      dataCipherIV: '',
      metaDataCipherIV: '',
    };
    addFileToSyncTable(newFileToQueue);
    return;
  }
};

const queueFolder = async (folderPath: string, syncFolderPath: string) => {

  let stats = null;
  let fileName = folderPath.split(sep).pop();
  if (fileName === undefined)
  {
    fileName = "";
  }

  // Check if this is the root sync folder, and if yes then skip
  if (folderPath === syncFolderPath) {
    return;
  }

  // Check if the folder is already in the Sync Table, therefore we do not need to add a new one.
  const isQueuedOrCompleted = await getFolderFromSyncTable(folderPath);
  if (isQueuedOrCompleted || fileName === 'New Folder') {
    // The folder is already in the queue, or it is the root and we do not want to process.
    // Or the folder is a "New Folder" and we do not capture this
  } else {

    console.log('Queueing folder for upload %s', folderPath);
    try {
      stats = fs.statSync(folderPath);
    } catch (err) {
      console.log('Folder not ready yet %s', folderPath);
      return;
    }

    // Generate a hash of all of the contents in this folder
    const options = { encoding: 'hex', folders: { exclude: ['.*'] } };
    const folderHash = await hashElement(folderPath, options)

    // Get the Drive ID and Privacy status
    let isPublic = 0;
    let driveId = ''
    const allDrives: ArFSDriveMetadata[] = await getAllDrivesFromDriveTable();
    allDrives.forEach((drive: ArFSDriveMetadata) => {
      let pathToCheck : string = syncFolderPath + '\\' + drive.driveName + '\\'
      if (folderPath.indexOf(pathToCheck) !== -1) {
        driveId = drive.driveId;
        // determine if drive is public or private
        if (drive.drivePrivacy === 'public') {
          // File is in the public drive.
          isPublic = 1;
        } else if (drive.drivePrivacy === 'private') {
          isPublic = 0;
        }
      }
    })

    const unixTime = Date.now();
    const contentType = 'application/json';
    let fileId = uuidv4();
    const lastModifiedDate = Math.floor(stats.mtimeMs);
    let entityType = 'folder'
    let fileMetaDataSyncStatus = 1; // Set sync status to 1 for meta data transaction

    // Check if its parent folder has been added.  If not, lets add it first
    let parentFolderId = '';
    const parentFolderPath = dirname(folderPath);
    let parentFolder : ArFSFileMetaData = await getFolderFromSyncTable(parentFolderPath);
    if (parentFolder !== undefined) {
      parentFolderId = parentFolder.fileId;
    } 

    // Check to see if this folder was moved by matching against its hash
    const movedFolder = await getFolderByHashFromSyncTable(folderHash.hash);
    if (movedFolder) {
      // create a new folder with previous folder ID
      console.log ("Folder was moved!  Using existing previous file Id: %s", movedFolder.fileId);
      fileId = movedFolder.fileId;
    }

    const folderToQueue : ArFSFileMetaData = {
      id: 0,
      appName,
      appVersion,
      unixTime,
      contentType,
      entityType,
      driveId,
      parentFolderId,
      fileId,
      filePath: folderPath,
      fileName,
      fileHash: folderHash.hash,
      fileSize: 0,
      lastModifiedDate,
      fileVersion: 0,
      isPublic,
      isLocal: 1,
      metaDataTxId: '0',
      dataTxId: '0',
      permaWebLink: '',
      fileDataSyncStatus: 0, // Folders do not require a data tx
      fileMetaDataSyncStatus, // Sync status of 1 requries a metadata tx
      cipher: '',
      dataCipherIV: '',
      metaDataCipherIV: '',
    };
    await addFileToSyncTable(folderToQueue);
  }
};

const watchFolder = (syncFolderPath: string) => {
  const log = console.log.bind(console);
  const watcher = chokidar.watch(syncFolderPath, {
    persistent: true,
    ignoreInitial: false,
    usePolling: true,
    interval: 5000,
    binaryInterval: 5000,
    ignored: '*.enc',
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 5000,
    },
  });
  watcher
    .on('add', async (path: any) => queueFile(path, syncFolderPath))
    .on('change', (path: any) => queueFile(path, syncFolderPath))
    .on('unlink', (path: any) => log(`File ${path} has been removed`))
    .on('addDir', async (path: any) => queueFolder(path, syncFolderPath))
    .on('unlinkDir', (path: any) => log(`Directory ${path} has been removed`))
    .on('error', (error: any) => log(`Watcher error: ${error}`))
  return 'Watched';
};

const resolveFileDownloadConflict = async (resolution: string, fileName: string, filePath: string, id: string) => {
  const folderPath = dirname(filePath);
  switch (resolution) {
    case 'R': {
      // Rename by adding - copy at the end.
      let newFileName: string[] | string = fileName.split('.');
      newFileName = newFileName[0].concat(' - Copy.', newFileName[1]);
      const newFilePath = path.join(folderPath, newFileName);
      console.log('   ...renaming existing file to : %s', newFilePath);
      fs.renameSync(filePath, newFilePath);
      break;
    }
    case 'O': // Overwrite existing file
      setPermaWebFileToOverWrite(id);
      break;
    case 'I':
      setPermaWebFileToIgnore(+id);
      break;
    default:
      // Skipping this time
      break;
  }
};

export { watchFolder, resolveFileDownloadConflict };
