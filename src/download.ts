/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
// upload.js
import * as fs from 'fs';
import { dirname } from 'path';
import { sleep, asyncForEach, gatewayURL, extToMime, setAllFolderHashes, Utf8ArrayToStr, setAllFileHashes } from './common';
import { getTransactionMetaData, getAllMyDataFileTxs, getTransactionData } from './arweave';
import { decryptFile, decryptFileMetaData } from './crypto';
import {
  getFilesToDownload,
  getFoldersToCreate,
  updateFileDownloadStatus,
  addFileToSyncTable,
  getByMetaDataTxFromSyncTable,
  getLatestFileVersionFromSyncTable,
  setPermaWebFileToIgnore,
  getMyFileDownloadConflicts,
  getFolderNameFromSyncTable,
  getFolderParentIdFromSyncTable,
  setFilePath,
  getAllMissingPathsFromSyncTable,
  getArDriveSyncFolderPathFromProfile,
  getAllLatestFileAndFolderVersionsFromSyncTable,
  setFileToDownload,
  getLatestFolderVersionFromSyncTable,
  getAllDrivesByPrivacyFromDriveTable,
} from './db';
import { ArDriveUser, ArFSDriveMetadata, ArFSFileMetaData } from './types';

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

// Downloads a single file from ArDrive by transaction
async function downloadArDriveFileByTx(
  user: ArDriveUser,
  filePath: string,
  dataTxId: string,
  isPublic: number,
) {
  try {
    const folderPath = dirname(filePath);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      await sleep(1000);
    }
    const data = await getTransactionData(dataTxId);

    //console.log("FOUND PERMAFILE! %s is on the Permaweb, but not local.  Downloading...", full_path, data)
    if (+isPublic === 1) {
      fs.writeFileSync(filePath, data);
      console.log('DOWNLOADED %s', filePath);
    } else {
      // Method with decryption
      console.log("shouldnt be decrypting...")
      fs.writeFileSync(filePath.concat('.enc'), data);
      await sleep(500);
      await decryptFile(filePath.concat('.enc'), user.dataProtectionKey, user.walletPrivateKey);
      await sleep(500);
      fs.unlinkSync(filePath.concat('.enc'));
      console.log('DOWNLOADED AND DECRYPTED %s', filePath);
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
    };
    const { node } = fileDataTx;
    const { tags } = node;
    const metaDataTxId = node.id;

    // DOUBLE CHECK THIS
    // Is the File or Folder already present in the database?  If it is, lets ensure its already downloaded
    const isMetaDataSynced = await getByMetaDataTxFromSyncTable(metaDataTxId);
    if (isMetaDataSynced) {
      // this file is already downloaded and synced
      return 0;
    }

    // Download the File's Metadata using the metadata transaction ID
    const data : string | Uint8Array = await getTransactionMetaData(metaDataTxId);
    let dataString = await Utf8ArrayToStr(data);
    let dataJSON = await JSON.parse(dataString);

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
        default:
          break;
      }
    });

    // If it is a private file, it should be decrypted
    // THIS MUST BE UPDATED TO USE LATEST ENCRYPTION
    if (Object.prototype.hasOwnProperty.call(dataJSON, 'iv')) {
      fileToSync.isPublic = 0;
      dataJSON = await decryptFileMetaData(dataJSON.iv, dataJSON.encryptedText, user.dataProtectionKey, user.walletPrivateKey);
    } else {
      fileToSync.isPublic = 1;
    }

    // Set metadata for Folder and File entities
    fileToSync.fileSize = dataJSON.size;
    fileToSync.fileName = dataJSON.name;
    fileToSync.fileHash = '';
    fileToSync.fileDataSyncStatus = 3;
    fileToSync.fileMetaDataSyncStatus = 3;
    fileToSync.metaDataTxId = metaDataTxId;

    // If it is a file, copy the lastModifiedDate from the JSON
    // If a folder, use the Unix TIme
    if (fileToSync.entityType === 'file') {
      fileToSync.lastModifiedDate = dataJSON.lastModifiedDate;
    }
    else if (fileToSync.entityType === 'folder') {
      fileToSync.lastModifiedDate = fileToSync.unixTime;
    }

    fileToSync.dataTxId = '0';

    // Perform specific actions for File, Folder and Drive entities
    if (fileToSync.entityType === 'file') {
      // Since the File MetaData Tx does not have the content type of underlying file, we get it here
      fileToSync.dataTxId = dataJSON.dataTxId;
      fileToSync.contentType = extToMime(dataJSON.name);
      fileToSync.permaWebLink = gatewayURL.concat(dataJSON.dataTxId);

      // Check to see if a previous version exists, and if so, increment the version.
      // Versions are determined by comparing old/new file hash.
      const latestFile = await getLatestFileVersionFromSyncTable(fileToSync.fileId)
      if (latestFile !== undefined) {
        if (latestFile.fileDataTx !== fileToSync.dataTxId) {
          fileToSync.fileVersion = +latestFile.fileVersion + 1;
          console.log ("%s has a new version %s", dataJSON.name, fileToSync.fileVersion)
        }
        // If the previous file data tx matches, then we do not increment the version
        else {
          fileToSync.fileVersion = latestFile.fileVersion;
        }
      }
    // Perform specific actions for Folder entities
    } else if (fileToSync.entityType === 'folder') {
      fileToSync.permaWebLink = gatewayURL.concat(metaDataTxId);
    } 

    console.log('%s | %s is unsynchronized and needs to be downloaded', fileToSync.fileName, fileToSync.fileId);
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
  let drives : ArFSDriveMetadata[] = await getAllDrivesByPrivacyFromDriveTable("private");
  await asyncForEach(drives, async (drive: ArFSDriveMetadata) => {
    const privateTxIds = await getAllMyDataFileTxs(user.walletPublicKey, drive.driveId);
    await asyncForEach(privateTxIds, async (privateTxId: string) => {
      await getFileMetaDataFromTx(privateTxId, user); 
    });
  });

  // Get your public files
  console.log('---Getting all your Public ArDrive files---');
  drives = await getAllDrivesByPrivacyFromDriveTable("public");
  await asyncForEach(drives, async (drive: ArFSDriveMetadata) => {
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
  try {
    console.log('---Downloading any unsynced files---');
    // Check the latest file versions to ensure they exist locally, if not set them to download
    const localFiles : ArFSFileMetaData[] = await getAllLatestFileAndFolderVersionsFromSyncTable()
    await asyncForEach(localFiles, async (localFile: ArFSFileMetaData) => {
      fs.access(localFile.filePath, async (err) => {
        if (err) {
          await setFileToDownload(localFile.metaDataTxId); // The file doesnt exist, so lets download it
        }
      })
    })

    // Get the Files and Folders which have isLocal set to 0 that we are not ignoring
    const filesToDownload : ArFSFileMetaData[] = await getFilesToDownload();
    const foldersToCreate : ArFSFileMetaData[] =  await getFoldersToCreate();

    // Get the special batch of File Download Conflicts
    const fileConflictsToDownload : ArFSFileMetaData[] = await getMyFileDownloadConflicts();

    // Process any files to download
    if (filesToDownload.length > 0) {
      // There are unsynced files to process
      await asyncForEach(
        filesToDownload,
        async (fileToDownload: ArFSFileMetaData) => {
          // Establish the file path first
          if (fileToDownload.filePath === '') {
            fileToDownload.filePath = await determineFilePath(user.syncFolderPath, fileToDownload.parentFolderId, fileToDownload.fileName)
            await setFilePath (fileToDownload.filePath, fileToDownload.id)
          }

          // Get the latest file version from the DB
          const latestFileVersion : ArFSFileMetaData = await getLatestFileVersionFromSyncTable(fileToDownload.fileId);

          // Only download if this is the latest version
          if (fileToDownload.id === latestFileVersion.id) {
            // If there is a file already in this location with a different size, then skip mark as a conflict with isLocal 2
            console.log ("Downloading the latest file version %s", fileToDownload.filePath)
            await downloadArDriveFileByTx(
              user,
              fileToDownload.filePath,
              fileToDownload.dataTxId,
              fileToDownload.isPublic,
            );

            // Ensure the file downloaded has the same lastModifiedDate as before
            let currentDate = new Date()
            let lastModifiedDate = new Date(Number(fileToDownload.lastModifiedDate))
            fs.utimesSync(fileToDownload.filePath, currentDate, lastModifiedDate)
            console.log ("woot downloaded! setting to 1")
            await updateFileDownloadStatus('1', fileToDownload.id);
            return 'Downloaded';
          } else {
            // This is an older version, and we ignore it for now.
            await updateFileDownloadStatus('0', fileToDownload.id); // Mark older version as not local ignored
            await setPermaWebFileToIgnore(fileToDownload.id); // Mark older version as ignored
          }
          return 'Checked file';
        },
      );
    }
    // Process any folders to create
    if (foldersToCreate.length > 0) {
      // there are new folders to create
      await asyncForEach(foldersToCreate, async (folderToCreate: { id: any; parentFolderId: string; fileName: string; filePath: any, fileId: string }) => {
        // Establish the folder path first
        if (folderToCreate.filePath === '') {
          folderToCreate.filePath = await determineFilePath(user.syncFolderPath, folderToCreate.parentFolderId, folderToCreate.fileName)
          await setFilePath (folderToCreate.filePath, folderToCreate.id)
        }
        // Get the latest folder version from the DB
        const latestFolderVersion: ArFSFileMetaData= await getLatestFolderVersionFromSyncTable(folderToCreate.fileId);

        // If this folder is the same name/path then download
        if (latestFolderVersion.filePath === folderToCreate.filePath) {
          if (!fs.existsSync(folderToCreate.filePath)) {
            console.log('Creating new folder from permaweb %s', folderToCreate.filePath);
            fs.mkdirSync(folderToCreate.filePath);
          }
          await updateFileDownloadStatus('1', folderToCreate.id);
        } else {
          // This is an older version, and we ignore it for now.
          await updateFileDownloadStatus('0', folderToCreate.id); // Mark older fodler version as not local and ignored
          await setPermaWebFileToIgnore(folderToCreate.id); // Mark older folder version as ignored
        }
      });
    }
    // Process any previously conflicting file downloads
    if (fileConflictsToDownload.length > 0) {
      await asyncForEach(
        fileConflictsToDownload,
        async (fileConflictToDownload: ArFSFileMetaData) => {
          // This file is on the Permaweb, but it is not local or the user wants to overwrite the local file
          console.log('Overwriting local file %s', fileConflictToDownload.filePath);
          await downloadArDriveFileByTx(
            user,
            fileConflictToDownload.filePath,
            fileConflictToDownload.dataTxId,
            fileConflictToDownload.isPublic,
          );
          await updateFileDownloadStatus('1', fileConflictToDownload.id);
          return 'File Overwritten';
        },
      );
    }

    // Ensure all of the folder hashes are set properly
    await setAllFolderHashes();
    await setAllFileHashes();

    return 'Downloaded all ArDrive files';
  } catch (err) {
    console.log(err);
    return 'Error downloading all ArDrive files';
  }
};
