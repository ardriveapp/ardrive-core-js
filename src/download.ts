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
  updateArDriveRootDirectoryTx,
} from './db';
import { ArDriveUser } from './types';


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

// Downloads a single file from ArDrive by transaction
async function downloadArDriveFileByTx(
  user: ArDriveUser,
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
      lastModifiedDate: '',
      fileVersion: 0,
      isPublic: '',
      isLocal: 0,
      fileDataSyncStatus: 0,
      fileMetaDataSyncStatus: 0,
      permaWebLink: '',
      metaDataTxId: '',
      dataTxId: '',
    };
    const { node } = fileDataTx;
    const metaDataTxId = node.id;
    const isCompleted = await getByMetaDataTxFromSyncTable(metaDataTxId);
    if (isCompleted) {
      // Does the file actually exist?
      fs.access(isCompleted.filePath, async (err) => {
        // console.log ("The file %s already exists", isCompleted.fileName)
        if (err) {
          await updateFileDownloadStatus('0', isCompleted.id); // The file doesnt exist, so lets download it
        }
      });
      return 0;
    }
    const { tags } = node;
    const data : string | Uint8Array = await getTransactionMetaData(metaDataTxId);

    let dataString = await Utf8ArrayToStr(data);
    let dataJSON = await JSON.parse(dataString);

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

    // Start to decrypt
    if (Object.prototype.hasOwnProperty.call(dataJSON, 'iv')) {
      newFileToDownload.isPublic = '0';
      dataJSON = await decryptFileMetaData(dataJSON.iv, dataJSON.encryptedText, user.dataProtectionKey, user.walletPrivateKey);
    } else {
      newFileToDownload.isPublic = '1';
    }

    // Perform specific actions for File entities
    let filePath = "";
    let permaWebLink = "";

    // By default, every file and folder is version 0
    newFileToDownload.fileVersion = 0

    if (newFileToDownload.entityType === 'file') {
      // Since the File MetaData Tx does not have the content type of underlying file, we get it here
      filePath = user.syncFolderPath.concat(dataJSON.path, dataJSON.name);
      newFileToDownload.contentType = extToMime(filePath);
      permaWebLink = gatewayURL.concat(dataJSON.dataTxId);

      // Check to see if a previous version exists, and if so, increment the version.
      // Versions are determined by comparing old/new file hash.
      const latestFile = await getLatestFileVersionFromSyncTable(newFileToDownload.fileId)
      if (latestFile !== undefined) {
        if (latestFile.fileHash !== newFileToDownload.fileHash) {
          newFileToDownload.fileVersion = +latestFile.fileVersion + 1;
          console.log ("%s has a new version %s", newFileToDownload.fileName, newFileToDownload.fileVersion)
        }
        // If the previous file id matches, but the hashes are same, then we do not increment the version
        else {
          newFileToDownload.fileVersion = latestFile.fileVersion;
        }
      }
    // Perform specific actions for Folder entities
    } else if (newFileToDownload.entityType === 'folder') {
      filePath = user.syncFolderPath.concat(dataJSON.path);
      permaWebLink = gatewayURL.concat(metaDataTxId);
    } else if (newFileToDownload.entityType === 'drive') {
      // update the sync table directly by exact file path and file name metaDataTxId for public ardrive
      filePath = user.syncFolderPath.concat("\\Public");
      permaWebLink = gatewayURL.concat(metaDataTxId);
      await updateArDriveRootDirectoryTx(metaDataTxId, permaWebLink, dataJSON.rootFolderId, "Public", filePath)
      return 'Success';
    }

    newFileToDownload.fileSize = dataJSON.size;
    newFileToDownload.filePath = filePath;
    newFileToDownload.fileName = dataJSON.name;
    newFileToDownload.arDrivePath = dataJSON.path;
    newFileToDownload.fileHash = dataJSON.hash;
    newFileToDownload.lastModifiedDate = dataJSON.lastModifiedDate;
    // newFileToDownload.fileVersion = dataJSON.fileVersion; Version is being deprecated from ArFS
    newFileToDownload.fileDataSyncStatus = 3;
    newFileToDownload.fileMetaDataSyncStatus = 3;
    newFileToDownload.permaWebLink = permaWebLink;
    newFileToDownload.metaDataTxId = metaDataTxId;
    newFileToDownload.dataTxId = dataJSON.dataTxId;

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
export const getMyArDriveFilesFromPermaWeb = async (user: ArDriveUser) => {
  // Get your private files
  console.log('---Getting all your Private ArDrive files---');
  const privateTxIds = await getAllMyDataFileTxs(user.walletPublicKey, user.privateArDriveId);
  await asyncForEach(privateTxIds, async (privateTxId: string) => {
    await getFileMetaDataFromTx(privateTxId, user);
  });

  // Get your public files
  console.log('---Getting all your Public ArDrive files---');
  const publicTxIds = await getAllMyDataFileTxs(user.walletPublicKey, user.publicArDriveId);
  await asyncForEach(publicTxIds, async (publicTxId: string) => {
    await getFileMetaDataFromTx(publicTxId, user);
  });
};

// Downloads all ardrive files that are not local
export const downloadMyArDriveFiles = async (user: ArDriveUser) => {
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
