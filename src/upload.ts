// upload.js
import * as fs from 'fs';
import {
  createArDriveMetaDataTransaction,
  createArDriveDataTransaction,
  sendArDriveFee,
  getTransactionStatus,
  createPublicArDriveTransaction,
  createPrivateArDriveTransaction,
  createArDrivePublicDataTransaction,
} from './arweave';
import { asyncForEach, getWinston, formatBytes, gatewayURL, sleep, checkFileExistsSync } from './common';
import { encryptFile, encryptTag } from './crypto';
import {
  getFilesToUploadFromSyncTable,
  getAllUploadedFilesFromSyncTable,
  removeFromSyncTable,
  completeFileDataFromSyncTable,
  completeFileMetaDataFromSyncTable,
  deleteFromSyncTable,
  getNewDriveFromSyncTable,
} from './db';
import { ArDriveUser, FileToUpload, UploadBatch } from './types';

export const getPriceOfNextUploadBatch = async () => {
  let totalWinstonData = 0;
  let totalArweaveMetadataPrice = 0;
  let totalSize = 0;
  let winston = 0;
  let uploadBatch: UploadBatch = {
    totalArDrivePrice: 0,
    totalSize: '0',
    totalNumberOfFileUploads: 0,
    totalNumberOfMetaDataUploads: 0,
    totalNumberOfFolderUploads: 0,
  }

  // Get all files that are ready to be uploaded
  const filesToUpload = await getFilesToUploadFromSyncTable();
  if (Object.keys(filesToUpload).length > 0) {
    await asyncForEach(
      filesToUpload,
      async (fileToUpload: {
        id: string;
        filePath: string;
        entityType: string;
        fileMetaDataSyncStatus: any;
        fileDataSyncStatus: any;
        fileSize: string | number;
      }) => {
        // If the file doesnt exist, we must remove it from the Sync table and not include it in our upload price
        if (!checkFileExistsSync(fileToUpload.filePath)) {
          console.log('%s is not local anymore.  Removing from the queue.', fileToUpload.filePath);
          await deleteFromSyncTable(fileToUpload.id);
          return 'File not local anymore';
        }
        if (fileToUpload.fileMetaDataSyncStatus === '1' && fileToUpload.entityType === 'folder') {
          totalArweaveMetadataPrice += 0.0000005;
          uploadBatch.totalNumberOfFolderUploads += 1;
        }
        if (fileToUpload.fileMetaDataSyncStatus === '1' && fileToUpload.fileDataSyncStatus === '1') {
          totalSize += +fileToUpload.fileSize;
          winston = await getWinston(fileToUpload.fileSize);
          totalWinstonData += +winston + 0.0000005;
          uploadBatch.totalNumberOfFileUploads += 1;
        } else if (fileToUpload.entityType === 'file') {
          totalArweaveMetadataPrice += 0.0000005;
          uploadBatch.totalNumberOfMetaDataUploads += 1;
        }
        return 'Calculated price';
      },
    );
    const totalArweaveDataPrice = totalWinstonData * 0.000000000001;
    let arDriveFee = +totalArweaveDataPrice.toFixed(9) * 0.15;
    if (arDriveFee < 0.00001 && totalArweaveDataPrice > 0) {
      arDriveFee = 0.00001;
    }
    uploadBatch.totalArDrivePrice = +totalArweaveDataPrice.toFixed(9) + arDriveFee + totalArweaveMetadataPrice;
    uploadBatch.totalSize = formatBytes(totalSize);
    return uploadBatch;
  }
  return uploadBatch;
};

// Tags and Uploads a single file to your ArDrive
async function uploadArDriveFileData(
  user: ArDriveUser,
  fileToUpload: FileToUpload,
) {
  try {
    const winston = await getWinston(fileToUpload.fileSize);
    const arPrice = +winston * 0.000000000001;
    let dataTxId: string;
    console.log('Uploading %s (%d bytes) at %s to the Permaweb', fileToUpload.filePath, fileToUpload.fileSize, arPrice);

    if (fileToUpload.isPublic === '1') {
      // Public file, do not encrypt
      dataTxId = await createArDrivePublicDataTransaction(
        user.walletPrivateKey,
        fileToUpload.filePath,
        fileToUpload.contentType,
        fileToUpload.id,
      );
    } else {
      // Private file, so it must be encrypted
      const encryptedFilePath = fileToUpload.filePath.concat('.enc');
      await encryptFile(fileToUpload.filePath, user.dataProtectionKey, user.walletPrivateKey);
      await sleep(250);

      // If encrypted file is not bigger than non-encrypted file, then there is a problem and we skip for now
      const encryptedStats = fs.statSync(encryptedFilePath);
      if (encryptedStats.size < +fileToUpload.fileSize) {
        return 0;
      }
      dataTxId = await createArDriveDataTransaction(user.walletPrivateKey, encryptedFilePath, fileToUpload.contentType, fileToUpload.id);
      fs.unlinkSync(encryptedFilePath);
    }
    await sendArDriveFee(user.walletPrivateKey, arPrice);
    return dataTxId;
  } catch (err) {
    console.log(err);
    return 'Error uploading file data';
  }
}

// Tags and Uploads a single file/folder metadata to your ArDrive
async function uploadArDriveFileMetaData(
  user: ArDriveUser,
  fileToUpload: FileToUpload 
) {
  try {
    // create primary metadata, used to tag this transaction
    const primaryFileMetaDataTags = {
      appName: fileToUpload.appName,
      appVersion: fileToUpload.appVersion,
      unixTime: fileToUpload.unixTime,
      contentType: 'application/json',
      entityType: fileToUpload.entityType,
      arDriveId: fileToUpload.arDriveId,
      parentFolderId: fileToUpload.parentFolderId,
      fileId: fileToUpload.fileId,
    };
    // create secondary metadata, used to further ID the file (with encryption if necessary)
    const secondaryFileMetaDataTags = {
      name: fileToUpload.fileName,
      size: fileToUpload.fileSize,
      hash: fileToUpload.fileHash,
      path: fileToUpload.arDrivePath,
      modifiedDate: fileToUpload.fileModifiedDate,
      dataTxId: fileToUpload.dataTxId,
      fileVersion: fileToUpload.fileVersion,
    };
    // Convert to JSON string
    const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);

    if (fileToUpload.isPublic === '1') {
      // Public file, do not encrypt
      await createArDriveMetaDataTransaction(
        user.walletPrivateKey,
        primaryFileMetaDataTags,
        secondaryFileMetaDataJSON,
        fileToUpload.filePath,
        fileToUpload.id,
      );
    } else {
      // Private file, so it must be encrypted
      const encryptedSecondaryFileMetaDataJSON = await encryptTag(
        JSON.stringify(secondaryFileMetaDataTags),
        user.dataProtectionKey,
        user.walletPrivateKey,
      );
      await createArDriveMetaDataTransaction(
        user.walletPrivateKey,
        primaryFileMetaDataTags,
        JSON.stringify(encryptedSecondaryFileMetaDataJSON),
        fileToUpload.filePath,
        fileToUpload.id,
      );
    }
    return 'Success';
  } catch (err) {
    console.log(err);
    return 'Error uploading file metadata';
  }
}

// Uploads all queued files
export const uploadArDriveFiles = async (user: ArDriveUser) => {
  try {
    let filesUploaded = 0;
    console.log('---Uploading All Queued Files---');
    const filesToUpload = await getFilesToUploadFromSyncTable();
    if (Object.keys(filesToUpload).length > 0) {
      // Ready to upload
      await asyncForEach(
        filesToUpload,
        async (fileToUpload: FileToUpload) => {
          if (fileToUpload.fileDataSyncStatus === '1') {
            // file data and metadata transaction
            const dataTxId = await uploadArDriveFileData(user, fileToUpload);
            fileToUpload.dataTxId = dataTxId;
            await uploadArDriveFileMetaData(user, fileToUpload);
            // console.log('Metadata and file uploaded.');
          } else if (fileToUpload.fileMetaDataSyncStatus === '1') {
            await uploadArDriveFileMetaData(user, fileToUpload);
            // console.log('Metadata uploaded!');
          }
          filesUploaded += 1;
        },
      );
    }
    if (filesUploaded > 0) {
      console.log('Uploaded %s files to your ArDrive!', filesUploaded);

      // Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
      const publicDriveId = await getNewDriveFromSyncTable("Public");
      if (publicDriveId !== undefined || publicDriveId.length !== 0)
      {
        // Upload public drive arweave transaction
        createPublicArDriveTransaction(user.walletPrivateKey, publicDriveId.id)
      }
      const privateDriveId = await getNewDriveFromSyncTable("Public");
      if (privateDriveId === undefined || privateDriveId.length === 0)
      {
        // Upload private drive arweave transaction
        createPrivateArDriveTransaction(user.walletPrivateKey, privateDriveId.id)
      }
    }
    return 'SUCCESS';
  } catch (err) {
    console.log(err);
    return 'ERROR processing files';
  }
};

// Scans through the queue & checks if a file has been mined, and if it has moves to Completed Table. If a file is not on the permaweb it will be uploaded
export const checkUploadStatus = async () => {
  try {
    console.log('---Checking Upload Status---');
    let permaWebLink: string;
    const unsyncedFiles = await getAllUploadedFilesFromSyncTable();
    let status: any;
    await asyncForEach(
      unsyncedFiles,
      async (unsyncedFile: {
        id: any;
        filePath: any;
        fileDataSyncStatus: any;
        fileMetaDataSyncStatus: any;
        dataTxId: any;
        metaDataTxId: any;
      }) => {
        // Is the file uploaded on the web?
        if (unsyncedFile.fileDataSyncStatus === '2') {
          status = await getTransactionStatus(unsyncedFile.dataTxId);
          if (status === 200) {
            permaWebLink = gatewayURL.concat(unsyncedFile.dataTxId);
            console.log('SUCCESS! %s data was uploaded with TX of %s', unsyncedFile.filePath, unsyncedFile.dataTxId);
            console.log('...you can access the file here %s', gatewayURL.concat(unsyncedFile.dataTxId));
            const fileToComplete = {
              fileDataSyncStatus: '3',
              permaWebLink,
              id: unsyncedFile.id,
            };
            await completeFileDataFromSyncTable(fileToComplete);
          }
        } else if (status === 202) {
          console.log('%s data is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
        } else if (status === 410) {
          console.log('%s data failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
        } else {
          // CHECK IF FILE EXISTS AND IF NOT REMOVE FROM QUEUE
          fs.access(unsyncedFile.filePath, async (err) => {
            if (err) {
              console.log('%s data was not found locally anymore.  Removing from the queue', unsyncedFile.filePath);
              await removeFromSyncTable(unsyncedFile.id);
            }
          });
        }
        if (unsyncedFile.fileMetaDataSyncStatus === '2') {
          status = await getTransactionStatus(unsyncedFile.metaDataTxId);
          if (status === 200) {
            permaWebLink = gatewayURL.concat(unsyncedFile.metaDataTxId);
            console.log(
              'SUCCESS! %s metadata was uploaded with TX of %s',
              unsyncedFile.filePath,
              unsyncedFile.metaDataTxId,
            );
            const fileMetaDataToComplete = {
              fileMetaDataSyncStatus: '3',
              permaWebLink,
              id: unsyncedFile.id,
            };
            await completeFileMetaDataFromSyncTable(fileMetaDataToComplete);
          }
        } else if (status === 202) {
          console.log('%s metadata is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
        } else if (status === 410) {
          console.log('%s metadata failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
        }
      },
    );
    return 'Success checking upload file status';
  } catch (err) {
    console.log(err);
    return 'Error checking upload file status';
  }
};
