/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
// upload.js
import * as fs from 'fs';
import { dirname } from 'path';
import { sleep, asyncForEach, gatewayURL, extToMime } from './common';
import { getTransactionMetaData, getAllMyDataFileTxs, getTransactionData } from './arweave';
import { checksumFile, decryptFile, decryptFileMetaData } from './crypto';
import {
  getFilesToDownload,
  getFoldersToCreate,
  updateFileDownloadStatus,
  addFileToSyncTable,
  getByMetaDataTxFromSyncTable,
  getByFilePathAndHashFromSyncTable,
  updateFileInSyncTable,
  getLatestFileVersionFromSyncTable,
  setPermaWebFileToIgnore,
  getMyFileDownloadConflicts,
} from './db';

async function binArrayToJSON(binArray: any) {
  let str = '';
  for (const i of binArray) {
    str += String.fromCharCode(parseInt(binArray[i], 10));
  }
  return JSON.parse(str);
}

// Downloads a single file from ArDrive by transaction
async function downloadArDriveFileByTx(
  user: { syncFolderPath: string; password: string; jwk: string },
  filePath: any,
  dataTxId: string,
  isPublic: string,
) {
  try {
    const folderPath = dirname(filePath);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      await sleep(1000);
    }
    const data = await getTransactionData(dataTxId);

    // console.log("FOUND PERMAFILE! %s is on the Permaweb, but not local.  Downloading...", full_path, data)
    if (isPublic === '1') {
      fs.writeFileSync(filePath, data);
      console.log('DOWNLOADED %s', filePath);
    } else {
      // Method with decryption
      fs.writeFileSync(filePath.concat('.enc'), data);
      await sleep(500);
      await decryptFile(filePath.concat('.enc'), user.password, user.jwk);
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
  user: {
    syncFolderPath: string;
    walletPublicKey: string;
    arDriveId: string;
    password: string;
    jwk: string;
  },
) {
  try {
    const newFileToDownload = {
      appName: '',
      appVersion: '',
      unixTime: '',
      contentType: '',
      entityType: '',
      arDriveId: '',
      parentFolderId: '',
      fileId: '',
      fileSize: '',
      filePath: '',
      fileName: '',
      arDrivePath: '',
      fileHash: '',
      fileModifiedDate: '',
      fileVersion: 0,
      isPublic: '',
      isLocal: 0,
      fileDataSyncStatus: 0,
      fileMetaDataSyncStatus: 0,
      permaWebLink: '',
      metaDataTxId: '',
      dataTxId: '',
      isShared: '',
    };

    const { node } = fileDataTx;
    const metaDataTxId = node.id;
    const isCompleted = await getByMetaDataTxFromSyncTable(metaDataTxId);
    if (isCompleted) {
      // Does the file actual exist?
      fs.access(isCompleted.filePath, async (err) => {
        if (err) {
          await updateFileDownloadStatus('0', isCompleted.id);
        }
        return 0;
      });
    }
    const { tags } = node;
    const data = await getTransactionMetaData(metaDataTxId);
    let dataJSON = await binArrayToJSON(data);
    tags.forEach((tag: any) => {
      const key = tag.name;
      const { value } = tag;
      switch (key) {
        case 'App-Name':
          newFileToDownload.appName = value;
          break;
        case 'App-Version':
          newFileToDownload.appVersion = value;
          break;
        case 'Unix-Time':
          newFileToDownload.unixTime = value;
          break;
        case 'Content-Type':
          newFileToDownload.contentType = value;
          break;
        case 'Entity-Type':
          newFileToDownload.entityType = value;
          break;
        case 'Drive-Id':
          newFileToDownload.arDriveId = value;
          break;
        case 'File-Id':
          newFileToDownload.fileId = value;
          break;
        case 'Parent-Folder-Id':
          newFileToDownload.parentFolderId = value;
          break;
        default:
          break;
      }
    });

    if (Object.prototype.hasOwnProperty.call(dataJSON, 'iv')) {
      newFileToDownload.isPublic = '0';
      dataJSON = await decryptFileMetaData(dataJSON.iv, dataJSON.encryptedText, user.password, user.jwk);
    } else {
      newFileToDownload.isPublic = '1';
    }

    let filePath: string;
    let permaWebLink: string;
    if (newFileToDownload.entityType === 'file') {
      filePath = user.syncFolderPath.concat(dataJSON.path, dataJSON.name);
      newFileToDownload.contentType = extToMime(filePath); // Since the File MetaData Tx does not have the content type of underlying file, we get it here
      permaWebLink = gatewayURL.concat(dataJSON.dataTxId);
    } else {
      filePath = user.syncFolderPath.concat(dataJSON.path);
      permaWebLink = gatewayURL.concat(metaDataTxId);
    }

    let isShared = '0';
    if (filePath.indexOf(user.syncFolderPath.concat('\\Shared\\')) !== -1) {
      // Shared by choice, encrypt with new password
      isShared = '1';
    }

    newFileToDownload.fileSize = dataJSON.size;
    newFileToDownload.filePath = filePath;
    newFileToDownload.fileName = dataJSON.name;
    newFileToDownload.arDrivePath = dataJSON.path;
    newFileToDownload.fileHash = dataJSON.hash;
    newFileToDownload.fileModifiedDate = dataJSON.modifiedDate;
    newFileToDownload.fileVersion = dataJSON.fileVersion;
    newFileToDownload.fileDataSyncStatus = 3;
    newFileToDownload.fileMetaDataSyncStatus = 3;
    newFileToDownload.permaWebLink = permaWebLink;
    newFileToDownload.metaDataTxId = metaDataTxId;
    newFileToDownload.dataTxId = dataJSON.dataTxId;
    newFileToDownload.isShared = isShared;

    const exactFileMatch = {
      filePath,
      fileHash: dataJSON.hash,
    };
    // Check if the exact file already exists in the same location
    const exactMatch = await getByFilePathAndHashFromSyncTable(exactFileMatch);
    if (exactMatch) {
      const fileToUpdate = {
        arDriveId: newFileToDownload.arDriveId,
        parentFolderId: newFileToDownload.parentFolderId,
        fileId: newFileToDownload.fileId,
        fileVersion: newFileToDownload.fileVersion,
        metaDataTxId: newFileToDownload.metaDataTxId,
        dataTxId: newFileToDownload.dataTxId,
        fileDataSyncStatus: '3',
        fileMetaDataSyncStatus: '3',
        permaWebLink,
        id: exactMatch.id,
      };
      await updateFileInSyncTable(fileToUpdate);
      // console.log('%s is already local', filePath);
    } else {
      console.log('%s is unsynchronized', filePath);
      addFileToSyncTable(newFileToDownload);
    }
    return 'Success';
  } catch (err) {
    console.log(err);
    // console.log ("FOUND PERMAFILE %s but not ready to be downloaded yet", full_path)
    return 'Error downloading file';
  }
}

// Gets all of the files from your ArDrive (via ARQL) and loads them into the database.
export const getMyArDriveFilesFromPermaWeb = async (user: {
  syncFolderPath: string;
  walletPublicKey: string;
  arDriveId: string;
  password: string;
  jwk: string;
}) => {
  // console.log ("FOUND PERMAFILE %s but not ready to be downloaded yet", full_path)
  console.log('---Getting all your ArDrive files---');
  const txids = await getAllMyDataFileTxs(user.walletPublicKey, user.arDriveId);
  await asyncForEach(txids, async (txid: string) => {
    await getFileMetaDataFromTx(txid, user);
  });
};

// Downloads all ardrive files that are not local
export const downloadMyArDriveFiles = async (user: { syncFolderPath: string; password: string; jwk: string }) => {
  try {
    console.log('---Downloading any unsynced files---');
    const filesToDownload = await getFilesToDownload();
    const foldersToCreate = await getFoldersToCreate();
    const fileConflictsToDownload = await getMyFileDownloadConflicts();
    if (filesToDownload.length > 0) {
      // There are unsynced files to process
      await asyncForEach(
        filesToDownload,
        async (fileToDownload: {
          id: any;
          filePath: any;
          fileName: string;
          dataTxId: string;
          isPublic: string;
          fileHash: string;
          fileId: string;
          isLocal: string;
        }) => {
          // Get the latest file version from the DB
          const latestFileVersion = await getLatestFileVersionFromSyncTable(fileToDownload.fileId);
          // console.log ("Latest file version is %s", latestFileVersion.filePath)
          // Only download if this is the latest version
          if (fileToDownload.id === latestFileVersion.id) {
            // Does the file exist?
            if (fs.existsSync(latestFileVersion.filePath)) {
              // Does it have the same hash i.e. is the same version?
              const localFileHash = await checksumFile(latestFileVersion.filePath);
              if (localFileHash === latestFileVersion.fileHash) {
                await updateFileDownloadStatus('1', latestFileVersion.id); // Mark latest version as local
                return 'PermaWeb file is already local';
              }
              // The file hash is different, therefore we have a conflicting version but the same name.  The user must remediate.
              await updateFileDownloadStatus('2', latestFileVersion.id);
              return 'PermaWeb file conflicts with the local file.  Please resolve before continuing.';
            }
            // This file is on the Permaweb, but it is not local
            await downloadArDriveFileByTx(
              user,
              latestFileVersion.filePath,
              latestFileVersion.dataTxId,
              latestFileVersion.isPublic,
            );
            await updateFileDownloadStatus('1', fileToDownload.id);
          } else {
            // This is an older version, and we ignore it for now.
            await updateFileDownloadStatus('0', fileToDownload.id); // Mark older version as not local ignored
            await setPermaWebFileToIgnore(fileToDownload.id); // Mark older version as ignored
          }
          return 'Checked file';
        },
      );
    }
    if (foldersToCreate.length > 0) {
      // there are new folders to create
      await asyncForEach(foldersToCreate, async (folderToCreate: { id: any; filePath: any }) => {
        if (!fs.existsSync(folderToCreate.filePath)) {
          console.log('Creating new folder from permaweb %s', folderToCreate.filePath);
          fs.mkdirSync(folderToCreate.filePath);
        }
        await updateFileDownloadStatus('1', folderToCreate.id);
      });
    }
    if (fileConflictsToDownload.length > 0) {
      await asyncForEach(
        fileConflictsToDownload,
        async (fileConflictToDownload: { id: any; filePath: any; dataTxId: string; isPublic: string }) => {
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
    return 'Downloaded all ArDrive files';
  } catch (err) {
    console.log(err);
    return 'Error downloading all ArDrive files';
  }
};
