/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
// upload.js
import * as fs from 'fs';
import path, { dirname } from 'path';
import { sleep, asyncForEach, gatewayURL, extToMime, setAllFolderHashes, Utf8ArrayToStr, setAllFileHashes, setAllParentFolderIds, setNewFilePaths, setFolderChildrenPaths, updateFilePath, checkForMissingLocalFiles, setAllFolderSizes } from './common';
import { getAllMyDataFileTxs, getPrivateTransactionCipherIV, getTransactionData } from './arweave';
import { deriveDriveKey, deriveFileKey, fileDecrypt } from './crypto';
import {
  getFilesToDownload,
  getFoldersToCreate,
  updateFileDownloadStatus,
  addFileToSyncTable,
  getByMetaDataTxFromSyncTable,
  getLatestFileVersionFromSyncTable,
  setPermaWebFileToCloudOnly,
  getMyFileDownloadConflicts,
  setFilePath,
  getLatestFolderVersionFromSyncTable,
  getAllDrivesByPrivacyFromDriveTable,
  getPreviousFileVersionFromSyncTable,
} from './db';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from './types';

// Downloads a single file from ArDrive by transaction
async function downloadArDriveFileByTx(
  user: ArDriveUser,
  fileToDownload: ArFSFileMetaData,
) {
  try {

    // Get the parent folder's path
    const parentFolder : ArFSFileMetaData = await getLatestFolderVersionFromSyncTable(fileToDownload.parentFolderId);

    // Check if this file's path has the right path from its parent folder.  This ensures folders moved on the web are properly moved locally
    if (parentFolder.filePath !== path.dirname(fileToDownload.filePath)) {
      // Update the file path in the database
      console.log ("Fixing file path to ", parentFolder.filePath);
      fileToDownload.filePath = path.join(parentFolder.filePath, fileToDownload.fileName);
      await setFilePath(fileToDownload.filePath, fileToDownload.id);
    }

    const folderPath = dirname(fileToDownload.filePath);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      await sleep(250);
    }
    
    // Get the transaction data
    const data = await getTransactionData(fileToDownload.dataTxId);

    if (+fileToDownload.isPublic === 1) {
      fs.writeFileSync(fileToDownload.filePath, data);
      console.log('DOWNLOADED %s', fileToDownload.filePath);
    } else {
      // Get the transaction IV
      const dataBuffer = Buffer.from(data);
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToDownload.driveId, user.walletPrivateKey);
      const fileKey : Buffer = await deriveFileKey (fileToDownload.fileId, driveKey);
      const decryptedData = await fileDecrypt(fileToDownload.dataCipherIV, fileKey, dataBuffer);
      fs.writeFileSync(fileToDownload.filePath, decryptedData)
      console.log('DOWNLOADED AND DECRYPTED %s', fileToDownload.filePath);
    }
    return 'Success';
  } catch (err) {
    console.log(err);
    // console.log ("FOUND PERMAFILE %s but not ready to be downloaded yet", full_path)
    return 'Error downloading file';
  }
}

// Takes an ArDrive File Data Transaction and writes to the database.
async function getFileMetaDataFromTx(
  fileDataTx: any,
  user: ArDriveUser,
) {
  try {
    const fileToSync : ArFSFileMetaData = {
      id: 0,
      login: user.login,
      appName: '',
      appVersion: '',
      unixTime: 0,
      contentType: '',
      entityType: '',
      driveId: '',
      parentFolderId: '',
      fileId: '',
      fileSize: 0,
      fileName: '',
      fileHash: '',
      filePath: '',
      fileVersion: 0,
      lastModifiedDate: 0,
      isPublic: 0,
      isLocal: 0,
      fileDataSyncStatus: 0,
      fileMetaDataSyncStatus: 0,
      permaWebLink: '',
      metaDataTxId: '',
      dataTxId: '',
      cipher: '',
      dataCipherIV: '',
      metaDataCipherIV: '',
      cloudOnly: 0,
    };
    const { node } = fileDataTx;
    const { tags } = node;
    fileToSync.metaDataTxId = node.id;

    // DOUBLE CHECK THIS
    // Is the File or Folder already present in the database?  If it is, lets ensure its already downloaded
    const isMetaDataSynced = await getByMetaDataTxFromSyncTable(fileToSync.metaDataTxId);
    if (isMetaDataSynced) {
      // this file is already downloaded and synced
      return "Synced Already";
    }

    // Download the File's Metadata using the metadata transaction ID
    const data : string | Uint8Array = await getTransactionData(fileToSync.metaDataTxId);

    // Enumerate through each tag to pull the data
    tags.forEach((tag: any) => {
      const key = tag.name;
      const { value } = tag;
      switch (key) {
        case 'App-Name':
          fileToSync.appName = value;
          break;
        case 'App-Version':
          fileToSync.appVersion = value;
          break;
        case 'Unix-Time':
          fileToSync.unixTime = value;
          break;
        case 'Content-Type':
          fileToSync.contentType = value;
          break;
        case 'Entity-Type':
          fileToSync.entityType = value;
          break;
        case 'Drive-Id':
          fileToSync.driveId = value;
          break;
        case 'File-Id':
          fileToSync.fileId = value;
          break;
        case 'Folder-Id':
          fileToSync.fileId = value;
          break;
        case 'Parent-Folder-Id':
          fileToSync.parentFolderId = value;
          break;
        case 'Cipher':
          fileToSync.cipher = value;
          break;
        case 'Cipher-IV':
          fileToSync.metaDataCipherIV = value;
          break;
        default:
          break;
      }
    });

    let dataJSON;
    let decryptedData = Buffer.from('');

    // If it is a private file or folder, the data will need decryption.
    if (fileToSync.cipher === 'AES256-GCM') {
      fileToSync.isPublic = 0;
      const dataBuffer = Buffer.from(data);
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToSync.driveId, user.walletPrivateKey);
      if (fileToSync.entityType === 'file') {
        // Decrypt files using a File Key derived from the Drive key
        const fileKey : Buffer = await deriveFileKey (fileToSync.fileId, driveKey);
        decryptedData = await fileDecrypt(fileToSync.metaDataCipherIV, fileKey, dataBuffer);
      } else if (fileToSync.entityType === 'folder') {
        // Decrypt folders using the Drive Key only
        decryptedData = await fileDecrypt(fileToSync.metaDataCipherIV, driveKey, dataBuffer);
      }

      // Handle an error with decryption by ignoring this file.  THIS NEEDS TO BE IMPROVED.
      if (decryptedData.toString('ascii') === 'Error') {
        console.log ("There was a problem decrypting a private %s with TXID: %s", fileToSync.entityType, fileToSync.metaDataTxId);
        console.log ("Skipping this file...")
        fileToSync.fileSize = 0;
        fileToSync.fileName = '';
        fileToSync.fileHash = '';
        fileToSync.fileDataSyncStatus = 0;
        fileToSync.fileMetaDataSyncStatus = 3;
        fileToSync.dataTxId = '0';
        fileToSync.lastModifiedDate = fileToSync.unixTime;
        fileToSync.permaWebLink = gatewayURL.concat(fileToSync.metaDataTxId);
        fileToSync.cloudOnly = 1;
        await addFileToSyncTable(fileToSync);  // This must be handled better.
        return 'Error Decrypting'
      } else {
        dataJSON = await JSON.parse(decryptedData.toString('ascii'));
      }
    } else {
      // the file is public and does not require decryption
      let dataString = await Utf8ArrayToStr(data);
      dataJSON = await JSON.parse(dataString);
      fileToSync.isPublic = 1;
    }

    // Set metadata for Folder and File entities
    fileToSync.fileSize = dataJSON.size;
    fileToSync.fileName = dataJSON.name;
    fileToSync.fileHash = '';
    fileToSync.fileDataSyncStatus = 3;
    fileToSync.fileMetaDataSyncStatus = 3;
    fileToSync.dataTxId = '0';

    // Perform specific actions for File, Folder and Drive entities
    if (fileToSync.entityType === 'file') {

      // The actual data transaction ID, lastModifiedDate, and Filename of the underlying file are pulled from the metadata transaction
      fileToSync.lastModifiedDate = dataJSON.lastModifiedDate; // Convert to milliseconds
      fileToSync.dataTxId = dataJSON.dataTxId;
      fileToSync.contentType = extToMime(dataJSON.name);
      fileToSync.permaWebLink = gatewayURL.concat(dataJSON.dataTxId);

      if (fileToSync.isPublic === 0) {
        // if this is a private file, the CipherIV of the Data transaction should also be captured
        fileToSync.dataCipherIV = await getPrivateTransactionCipherIV(fileToSync.dataTxId)
      }

      // Check to see if a previous version exists, and if so, increment the version.
      // Versions are determined by comparing old/new file hash.
      const latestFile = await getLatestFileVersionFromSyncTable(fileToSync.fileId)
      if (latestFile !== undefined) {
        if (latestFile.fileDataTx !== fileToSync.dataTxId) {
          fileToSync.fileVersion = +latestFile.fileVersion + 1;
          // console.log ("%s has a new version %s", dataJSON.name, fileToSync.fileVersion)
        }
        // If the previous file data tx matches, then we do not increment the version
        else {
          fileToSync.fileVersion = latestFile.fileVersion;
        }
      }
    // Perform specific actions for Folder entities
    } else if (fileToSync.entityType === 'folder') {
      fileToSync.lastModifiedDate = fileToSync.unixTime;
      fileToSync.permaWebLink = gatewayURL.concat(fileToSync.metaDataTxId);
    } 

    console.log('QUEUING %s %s | Id: %s | Tx: %s for download', fileToSync.entityType, fileToSync.fileName, fileToSync.fileId, fileToSync.metaDataTxId);
    await addFileToSyncTable(fileToSync);
    return 'Success';
  } catch (err) {
    console.log(err);
    // console.log ("FOUND PERMAFILE %s but not ready to be downloaded yet", full_path)
    return 'Error syncing file metadata';
  }
}

// Gets all of the files from your ArDrive (via ARQL) and loads them into the database.
export const getMyArDriveFilesFromPermaWeb = async (user: ArDriveUser) => {

  // Get your private files
  console.log('---Getting all your Private ArDrive files---');
  let drives : ArFSDriveMetaData[] = await getAllDrivesByPrivacyFromDriveTable("private");
  await asyncForEach(drives, async (drive: ArFSDriveMetaData) => {
    const privateTxIds = await getAllMyDataFileTxs(user.walletPublicKey, drive.driveId);
    await asyncForEach(privateTxIds, async (privateTxId: string) => {
      await getFileMetaDataFromTx(privateTxId, user); 
    });
  });

  // Get your public files
  console.log('---Getting all your Public ArDrive files---');
  drives = await getAllDrivesByPrivacyFromDriveTable("public");
  await asyncForEach(drives, async (drive: ArFSDriveMetaData) => {
    const publicTxIds = await getAllMyDataFileTxs(user.walletPublicKey, drive.driveId);
    await asyncForEach(publicTxIds, async (publicTxId: string) => {
      await getFileMetaDataFromTx(publicTxId, user);
    });
  });

  // File path is not present by default, so we must generate them for each new file, folder or drive found
  await setNewFilePaths();

};

// Downloads all ardrive files that are not local
export const downloadMyArDriveFiles = async (user: ArDriveUser) => {
  console.log('---Downloading any unsynced files---');
  // Get the Files and Folders which have isLocal set to 0 that we are not ignoring
  const filesToDownload : ArFSFileMetaData[] = await getFilesToDownload();
  const foldersToCreate : ArFSFileMetaData[] =  await getFoldersToCreate();

  // Get the special batch of File Download Conflicts
  const fileConflictsToDownload : ArFSFileMetaData[] = await getMyFileDownloadConflicts();

  // Process any folders to create
  if (foldersToCreate.length > 0) {
    // there are new folders to create
    await asyncForEach(foldersToCreate, async (folderToCreate: ArFSFileMetaData) => {
      // Establish the folder path first
      if (folderToCreate.filePath === '') {
        folderToCreate.filePath = await updateFilePath(folderToCreate)
      }
      // Get the latest folder version from the DB
      const latestFolderVersion: ArFSFileMetaData = await getLatestFolderVersionFromSyncTable(folderToCreate.fileId);
      // If this folder is the latest version, then we should create the folder
      try {
        if (latestFolderVersion.filePath === folderToCreate.filePath) {
            // Compare against the previous version for a different file name or parent folder
            // If it does then this means there was a rename or move, and then we do not download a new file, rather rename/move the old
            const previousFolderVersion : ArFSFileMetaData = await getPreviousFileVersionFromSyncTable(folderToCreate.fileId);
            // If undefined, then there is no previous folder version.
            if (previousFolderVersion === undefined) {
              if (!fs.existsSync(folderToCreate.filePath)) {
                console.log('Creating new folder from permaweb %s', folderToCreate.filePath);
                fs.mkdirSync(folderToCreate.filePath);
              }
            }
            else if ((+previousFolderVersion.isLocal === 1) && (folderToCreate.fileName !== previousFolderVersion.fileName || folderToCreate.parentFolderId !== previousFolderVersion.parentFolderId)) {
              // There is a previous folder version, so we must rename/move it to the latest file path
              // Need error handling here in case file is in use
              fs.renameSync(previousFolderVersion.filePath, folderToCreate.filePath)

              // All children of the folder need their paths update in the database
              await setFolderChildrenPaths(folderToCreate)

              // Change the older version to not local/ignored since it has been renamed or moved
              await updateFileDownloadStatus('0', previousFolderVersion.id); // Mark older version as not local
              await setPermaWebFileToCloudOnly(previousFolderVersion.id); // Mark older version as ignored
            }
          else if (!fs.existsSync(folderToCreate.filePath)) {
            console.log('Creating new folder from permaweb %s', folderToCreate.filePath);
            fs.mkdirSync(folderToCreate.filePath);
          }
          await updateFileDownloadStatus('1', folderToCreate.id);
        } else {
          // This is an older version, and we ignore it for now.
          await updateFileDownloadStatus('0', folderToCreate.id); // Mark older fodler version as not local and ignored
          await setPermaWebFileToCloudOnly(folderToCreate.id); // Mark older folder version as ignored
        }
      } catch (err) {
        console.log (err)
      }
    });
  }
  // Process any files to download
  if (filesToDownload.length > 0) {
    // There are unsynced files to process
    await asyncForEach(filesToDownload, async (fileToDownload: ArFSFileMetaData) => {
        // Establish the file path first
        if (fileToDownload.filePath === '') {
          fileToDownload.filePath = await updateFilePath(fileToDownload)
        }

        // Get the latest file version from the DB
        const latestFileVersion : ArFSFileMetaData = await getLatestFileVersionFromSyncTable(fileToDownload.fileId);
        try {
          // Only download if this is the latest version
          if (fileToDownload.id === latestFileVersion.id) {
            // Compare against the previous version for a different file name or parent folder
            // If it does then this means there was a rename or move, and then we do not download a new file, rather rename/move the old
            const previousFileVersion : ArFSFileMetaData = await getPreviousFileVersionFromSyncTable(fileToDownload.fileId);

            // If undefined, then there is no previous file version.
            if (previousFileVersion === undefined) {
              // Download and decrypt the file if necessary
              await downloadArDriveFileByTx(user, fileToDownload);

              // Ensure the file downloaded has the same lastModifiedDate as before
              let currentDate = new Date()
              let lastModifiedDate = new Date(Number(fileToDownload.lastModifiedDate))
              fs.utimesSync(fileToDownload.filePath, currentDate, lastModifiedDate)
            }
            else if ((+previousFileVersion.isLocal === 1) && (fileToDownload.fileName !== previousFileVersion.fileName || fileToDownload.parentFolderId !== previousFileVersion.parentFolderId)) {
              // Need error handling here in case file is in use
              fs.renameSync(previousFileVersion.filePath, fileToDownload.filePath)

              // Change the older version to not local/ignored since it has been renamed or moved
              await updateFileDownloadStatus('0', previousFileVersion.id); // Mark older version as not local
              await setPermaWebFileToCloudOnly(previousFileVersion.id); // Mark older version as ignored
            } else {
              // Download and decrypt the file if necessary
              await downloadArDriveFileByTx(user, fileToDownload);

              // Ensure the file downloaded has the same lastModifiedDate as before
              let currentDate = new Date()
              let lastModifiedDate = new Date(Number(fileToDownload.lastModifiedDate))
              fs.utimesSync(fileToDownload.filePath, currentDate, lastModifiedDate)
            }

            // Update the database
            await updateFileDownloadStatus('1', fileToDownload.id);
            return 'Downloaded';
          } else {
            // This is an older version, and we ignore it for now.
            await updateFileDownloadStatus('0', fileToDownload.id); // Mark older version as not local
            await setPermaWebFileToCloudOnly(fileToDownload.id); // Mark older version as ignored
          }
          return 'Checked file';
        } catch (err) {
          console.log (err)
          return 'Error downloading file'
        }
      },
    );
  }
  // Process any previously conflicting file downloads
  if (fileConflictsToDownload.length > 0) {
    await asyncForEach(
      fileConflictsToDownload,
      async (fileConflictToDownload: ArFSFileMetaData) => {
        // This file is on the Permaweb, but it is not local or the user wants to overwrite the local file
        console.log('Overwriting local file %s', fileConflictToDownload.filePath);
        await downloadArDriveFileByTx(user, fileConflictToDownload);
        await updateFileDownloadStatus('1', fileConflictToDownload.id);
        return 'File Overwritten';
      },
    );
  }

  // Run some other processes to ensure downloaded files are set properly
  await setAllFolderHashes();
  await setAllFileHashes();
  await setAllParentFolderIds();
  await setAllFolderSizes();
  await checkForMissingLocalFiles();

  return 'Downloaded all ArDrive files';
};
