// files.js
import { sep, extname, basename, dirname } from 'path';
import * as fs from 'fs';
import { extToMime, appName, appVersion } from './common';
import { checksumFile } from './crypto';
import {
  addFileToSyncTable,
  getFolderOrDriveFromSyncTable,
  getByFilePathAndHashFromSyncTable,
  getByFilePathFromSyncTable,
  getByFileHashAndModifiedDateAndArDrivePathFromSyncTable,
  getByFileHashAndModifiedDateAndFileNameFromSyncTable,
  setPermaWebFileToIgnore,
  setPermaWebFileToOverWrite,
} from './db';
import * as chokidar from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import { ArFSFileMetaData } from './types';

const queueFile = async (filePath: string, syncFolderPath: string, privateArDriveId: string, publicArDriveId: string) => {
  let stats = null;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    console.log('File not ready yet %s', filePath);
    return;
  }

  let extension = extname(filePath);
  const fileName = basename(filePath);
  extension = extension.toLowerCase();

  // Skip if file is encrypted or size is 0
  if (extension !== '.enc' && stats.size !== 0 && !fileName.startsWith('~$')) {
    const fileHash = await checksumFile(filePath);
    const exactFileMatch = {
      filePath,
      fileHash,
    };

    // Check if the exact file already exists in the same location
    const exactMatch = await getByFilePathAndHashFromSyncTable(exactFileMatch);

    if (exactMatch) {
      // This file's version already exists.  Do nothing
      return;
    }

    // Check if the file has been renamed by looking at its path, modifiedDate and hash
    const parentFolderPath = dirname(filePath);
    let arDrivePath = filePath.replace(syncFolderPath, '');
    arDrivePath = arDrivePath.replace(fileName, '');
    const lastModifiedDate = stats.mtimeMs;
    const fileRename = {
      fileHash,
      lastModifiedDate,
      arDrivePath,
    };
    const renamedFile = await getByFileHashAndModifiedDateAndArDrivePathFromSyncTable(fileRename);

    if (renamedFile) {
      // The file has been renamed.  Submit as Metadata.
      console.log('%s was just renamed', filePath);
      renamedFile.unixTime = Math.round(new Date().getTime() / 1000);
      renamedFile.metaDataTx = '0';
      renamedFile.fileName = fileName;
      renamedFile.filePath = filePath;
      renamedFile.fileMetaDataSyncStatus = 1; // Sync status of 1 = metadatatx only
      addFileToSyncTable(renamedFile);
      return;
    }

    // Check if this is a new version of an existing file path
    const newFileVersion = await getByFilePathFromSyncTable(filePath);
    if (newFileVersion) {
      // Add new version of existing file
      newFileVersion.unixTime = Math.round(new Date().getTime() / 1000);
      newFileVersion.fileVersion += 1;
      newFileVersion.metaDataTx = '0';
      newFileVersion.dataTx = '0';
      newFileVersion.lastModifiedDate = lastModifiedDate;
      newFileVersion.fileHash = fileHash;
      newFileVersion.fileSize = stats.size;
      newFileVersion.fileDataSyncStatus = 1; // Sync status of 1
      console.log('%s updating file version to %s', filePath, newFileVersion.fileVersion);
      addFileToSyncTable(newFileVersion);
      return;
    }

    // Check if the file has been moved, or if there is another identical copy somewhere in your ArDrive.
    const parentFolderId = await getFolderOrDriveFromSyncTable(parentFolderPath);
    const fileMove = {
      fileHash,
      lastModifiedDate,
      fileName,
    };

    let isPublic = 0;
    let arDriveId = privateArDriveId;
    if (filePath.indexOf(syncFolderPath.concat('\\Public\\')) !== -1) {
      // File is in the public drive.
      isPublic = 1;
      arDriveId = publicArDriveId
    }

    const movedFile = await getByFileHashAndModifiedDateAndFileNameFromSyncTable(fileMove);
    if (movedFile) {
      movedFile.unixTime = Math.round(new Date().getTime() / 1000);
      movedFile.metaDataTx = '0';
      movedFile.fileName = fileName;
      movedFile.filePath = filePath;
      movedFile.arDrivePath = arDrivePath;
      movedFile.parentFolderId = parentFolderId.fileId;
      movedFile.fileMetaDataSyncStatus = 1; // Sync status of 1 = metadatatx only
      addFileToSyncTable(movedFile);
      console.log('%s has been moved', filePath);
      return;
    }

    // No match, so queue a new file
    console.log('%s queueing new file', filePath);
    const unixTime = Math.round(new Date().getTime() / 1000);
    const contentType = extToMime(filePath);
    const fileId = uuidv4();
    const fileSize = stats.size;
    const newFileToQueue : ArFSFileMetaData = {
      appName,
      appVersion,
      unixTime,
      contentType,
      entityType: 'file',
      driveId: arDriveId,
      parentFolderId: parentFolderId.fileId,
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
    };
    addFileToSyncTable(newFileToQueue);
  }
};

const queueFolder = async (folderPath: string, syncFolderPath: string, privateArDriveId: string, publicArDriveId: string) => {
  let parentFolderId = null;
  let stats = null;

  // Check if the folder is already in the Sync Table, therefore we do not need to add a new one.
  const isQueuedOrCompleted = await getFolderOrDriveFromSyncTable(folderPath);
  if (isQueuedOrCompleted) {
    // The folder is already in the queue, or it is the root and we do not want to process.
  } else {
    console.log('%s queueing folder', folderPath);
    try {
      stats = fs.statSync(folderPath);
    } catch (err) {
      console.log('Folder not ready yet %s', folderPath);
      return;
    }

    let isPublic = 0;
    let arDriveId = privateArDriveId;
    if (folderPath.indexOf(syncFolderPath.concat('\\Public')) !== -1) {
      // Public by choice, do not encrypt
      isPublic = 1;
      arDriveId = publicArDriveId;
    }

    const unixTime = Math.round(new Date().getTime() / 1000);
    const contentType = 'application/json';
    const fileId = uuidv4();
    let fileName = folderPath.split(sep).pop();
    if (fileName === undefined)
    {
      fileName = "";
    }
    const lastModifiedDate = stats.mtimeMs;
    let entityType = 'folder'
    let fileMetaDataSyncStatus = 1; // Set sync status to 1 for meta data transaction

    if (folderPath === syncFolderPath) {
      parentFolderId = uuidv4(); // This will act as the root parent Folder ID
      fileMetaDataSyncStatus = 0; // Set sync status to 0
    } else {
      const parentFolderPath = dirname(folderPath);
      parentFolderId = await getFolderOrDriveFromSyncTable(parentFolderPath);
      parentFolderId = parentFolderId.fileId;

      // We do not upload the Private and Public Folders as these are represented by Drive entity-types instead.
      if (folderPath === syncFolderPath.concat('\\Public')) {
        fileMetaDataSyncStatus = 0;
        entityType = 'drive'
      }
      if (folderPath === syncFolderPath.concat('\\Private')) {
        fileMetaDataSyncStatus = 0;
        entityType = 'drive'
      }
      if (folderPath === syncFolderPath) {
        fileMetaDataSyncStatus = 0;
        entityType = 'drive'
      }
    }

    const folderToQueue : ArFSFileMetaData = {
      appName,
      appVersion,
      unixTime,
      contentType,
      entityType,
      driveId: arDriveId,
      parentFolderId,
      fileId,
      filePath: folderPath,
      fileName,
      fileHash: '0',
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
    };
    addFileToSyncTable(folderToQueue);
  }
};

const watchFolder = (syncFolderPath: string, privateArDriveId: string, publicArDriveId: string) => {
  const log = console.log.bind(console);
  const watcher = chokidar.watch(syncFolderPath, {
    persistent: true,
    ignoreInitial: false,
    usePolling: true,
    interval: 10000,
    binaryInterval: 10000,
    ignored: '*.enc',
    awaitWriteFinish: {
      stabilityThreshold: 10000,
      pollInterval: 10000,
    },
  });
  watcher
    .on('add', async (path: any) => queueFile(path, syncFolderPath, privateArDriveId, publicArDriveId))
    .on('change', (path: any) => queueFile(path, syncFolderPath, privateArDriveId, publicArDriveId))
    .on('unlink', (path: any) => log(`File ${path} has been removed`))
    .on('addDir', async (path: any) => queueFolder(path, syncFolderPath, privateArDriveId, publicArDriveId))
    .on('unlinkDir', (path: any) => log(`Directory ${path} has been removed`))
    .on('error', (error: any) => log(`Watcher error: ${error}`))
    .on('ready', () => log('Initial scan complete. Ready for changes'));
  return 'Watched';
};

const resolveFileDownloadConflict = async (resolution: string, fileName: string, filePath: string, id: string) => {
  const folderPath = dirname(filePath);
  switch (resolution) {
    case 'R': {
      // Rename by adding - copy at the end.
      let newFileName: string[] | string = fileName.split('.');
      newFileName = newFileName[0].concat(' - Copy.', newFileName[1]);
      const newFilePath = folderPath.concat(newFileName);
      console.log('   ...renaming existing file to : %s', newFilePath);
      fs.renameSync(filePath, newFilePath);
      break;
    }
    case 'O': // Overwrite existing file
      setPermaWebFileToOverWrite(id);
      break;
    case 'I':
      setPermaWebFileToIgnore(id);
      break;
    default:
      // Skipping this time
      break;
  }
};

export { watchFolder, resolveFileDownloadConflict };
