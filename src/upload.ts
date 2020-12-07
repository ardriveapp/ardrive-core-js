// upload.js
import * as fs from 'fs';
import {
  createArDrivePublicMetaDataTransaction,
  createArDrivePrivateMetaDataTransaction,
  getTransactionStatus,
  createPublicDriveTransaction,
  createPrivateDriveTransaction,
  createArDrivePublicDataTransaction,
  //sendArDriveFee,
  createArDrivePrivateDataTransaction,
  sendArDriveFee,
  getArDriveFee,
} from './arweave';
import { asyncForEach, getWinston, formatBytes, gatewayURL, checkFileExistsSync } from './common';
import { deriveDriveKey, deriveFileKey, } from './crypto';
import {
  getFilesToUploadFromSyncTable,
  getAllUploadedFilesFromSyncTable,
  removeFromSyncTable,
  completeFileDataFromSyncTable,
  completeFileMetaDataFromSyncTable,
  deleteFromSyncTable,
  getNewDrivesFromDriveTable, 
  getDriveRootFolderFromSyncTable, 
  getAllUploadedDrivesFromDriveTable, 
  completeDriveMetaDataFromDriveTable,
  setFileMetaDataSyncStatus,
  setFileDataSyncStatus,
  updateFileUploadTimeInSyncTable,
  getFileUploadTimeFromSyncTable,
} from './db';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData, UploadBatch } from './types';

export const getPriceOfNextUploadBatch = async (login: string) => {
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
  const filesToUpload : ArFSFileMetaData[] = await getFilesToUploadFromSyncTable(login);
  if (Object.keys(filesToUpload).length > 0) {
    const priceFor1MB = await getWinston(1000000);
    const pricePerByte = priceFor1MB / (1003210)
    await asyncForEach(
      filesToUpload,
      async (fileToUpload: ArFSFileMetaData) => {
        // If the file doesnt exist, we must remove it from the Sync table and not include it in our upload price
        if (!checkFileExistsSync(fileToUpload.filePath)) {
          console.log('%s is not local anymore.  Removing from the queue.', fileToUpload.filePath);
          await deleteFromSyncTable(fileToUpload.id);
          return 'File not local anymore';
        }
        // Calculate folders that are ready to be uploaded, but have no TX already
        if (+fileToUpload.fileMetaDataSyncStatus === 1 && fileToUpload.entityType === 'folder') {
          totalArweaveMetadataPrice += 0.0000005; // Ths is the price we assume it costs for a metadata tx
          uploadBatch.totalNumberOfFolderUploads += 1;
        }
        if (+fileToUpload.fileDataSyncStatus === 1 && fileToUpload.entityType === 'file') {
          totalSize += +fileToUpload.fileSize;
          //winston = await getWinston(fileToUpload.fileSize);
          winston = (fileToUpload.fileSize + 3210) * pricePerByte;
          totalWinstonData += +winston + 0.0000005;
          uploadBatch.totalNumberOfFileUploads += 1;
        }
        if (+fileToUpload.fileMetaDataSyncStatus === 1 && fileToUpload.entityType === 'file') {
          totalArweaveMetadataPrice += 0.0000005;
          uploadBatch.totalNumberOfMetaDataUploads += 1;
        }
        return 'Calculated price';
      },
    );

    const totalArweaveDataPrice = totalWinstonData * 0.000000000001;
    let arDriveFee = +totalArweaveDataPrice.toFixed(9) * (await getArDriveFee() / 100);
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
  fileToUpload: ArFSFileMetaData,
) {
  let dataTxId = '';
  let arPrice = 0;
  try {
    const winston = await getWinston(fileToUpload.fileSize);
    arPrice = +winston * 0.000000000001;

    // Public file, do not encrypt
    if (+fileToUpload.isPublic === 1) {
      console.log('Uploading %s (%d bytes) at %s to the Permaweb', fileToUpload.filePath, fileToUpload.fileSize, arPrice);
      dataTxId = await createArDrivePublicDataTransaction(
        user.walletPrivateKey,
        fileToUpload.filePath,
        fileToUpload.contentType,
        fileToUpload.id,
      );
    } else {
      // Private file, so it must be encrypted
      console.log('Encrypting and Uploading %s (%d bytes) at %s to the Permaweb', fileToUpload.filePath, fileToUpload.fileSize, arPrice);
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToUpload.driveId, user.walletPrivateKey);
      const fileKey : Buffer = await deriveFileKey (fileToUpload.fileId, driveKey);
      dataTxId = await createArDrivePrivateDataTransaction(fileKey, fileToUpload, user.walletPrivateKey);
    }
    // Update the uploadTime of the file so we can track the status
    const currentTime = Math.round(Date.now() / 1000)
    await updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime)

    // Send the ArDrive Profit Sharing Community Fee
    // THIS IS COMMENTED OUT FOR THE ARDRIVE COMMUNITY DISTRIBUTION

    return {dataTxId, arPrice};
  } catch (err) {
    console.log(err);
    return {dataTxId, arPrice}
  }
}

// Tags and Uploads a single file/folder metadata to your ArDrive
async function uploadArDriveFileMetaData(
  user: ArDriveUser,
  fileToUpload: ArFSFileMetaData 
) {
  try {
    // create secondary metadata, used to further ID the file (with encryption if necessary)
    const secondaryFileMetaDataTags = {
      name: fileToUpload.fileName,
      size: fileToUpload.fileSize,
      lastModifiedDate: fileToUpload.lastModifiedDate,
      dataTxId: fileToUpload.dataTxId,
      dataContentType: fileToUpload.contentType,
    };
    // Convert to JSON string
    const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
    if (+fileToUpload.isPublic === 1) {
      // Public file, do not encrypt
      await createArDrivePublicMetaDataTransaction(user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    } else {
      // Private file, so it must be encrypted
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToUpload.driveId, user.walletPrivateKey);
      const fileKey : Buffer = await deriveFileKey (fileToUpload.fileId, driveKey);
      await createArDrivePrivateMetaDataTransaction(fileKey, user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    }

    // Update the uploadTime of the file so we can track the status
    const currentTime = Math.round(Date.now() / 1000)
    await updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime)

    return 'Success';
  } catch (err) {
    console.log(err);
    return 'Error uploading file metadata';
  }
}

// Tags and Uploads a single file/folder metadata to your ArDrive
async function uploadArDriveFolderMetaData(
  user: ArDriveUser,
  fileToUpload: ArFSFileMetaData 
) {
  try {
    // create secondary metadata, used to further ID the file (with encryption if necessary)
    const secondaryFileMetaDataTags = {
      name: fileToUpload.fileName,
    };
    // Convert to JSON string
    const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
    if (+fileToUpload.isPublic === 1) {
      // Public file, do not encrypt
      // console.log ("Getting ready to upload public metadata for %s", fileToUpload.fileName)
      await createArDrivePublicMetaDataTransaction(user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    } else {
      // Private file, so it must be encrypted using the Drive Key
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToUpload.driveId, user.walletPrivateKey);
      await createArDrivePrivateMetaDataTransaction(driveKey, user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    }

    // Update the uploadTime of the file so we can track the status
    const currentTime = Math.round(Date.now() / 1000)
    await updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime)

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
    let totalPrice = 0;
    console.log('---Uploading All Queued Files and Folders---');
    const filesToUpload = await getFilesToUploadFromSyncTable(user.login);
    if (Object.keys(filesToUpload).length > 0) {
      // Ready to upload
      await asyncForEach(
        filesToUpload,
        async (fileToUpload: ArFSFileMetaData) => {
          if (fileToUpload.entityType === 'file') {
            // console.log ("Uploading file - %s", fileToUpload.fileName)
            // Check to see if we have to upload the File Data and Metadata
            // If not, we just check to see if we have to update metadata.
            if (+fileToUpload.fileDataSyncStatus === 1) {
              const uploadedFile = await uploadArDriveFileData(user, fileToUpload);
              fileToUpload.dataTxId = uploadedFile.dataTxId;
              totalPrice += uploadedFile.arPrice; // Sum up all of the fees paid
              await uploadArDriveFileMetaData(user, fileToUpload);
            } else if (+fileToUpload.fileMetaDataSyncStatus === 1) {
              await uploadArDriveFileMetaData(user, fileToUpload);
            }
          }
          else if (fileToUpload.entityType === 'folder') {
            //console.log ("Uploading folder - %s", fileToUpload.fileName)
            await uploadArDriveFolderMetaData(user, fileToUpload);
          }
          filesUploaded += 1;
        },
      );
    }
    if (filesUploaded > 0) {
      // Send the tip to the ArDrive community
      await sendArDriveFee(user.walletPrivateKey, totalPrice);
      console.log('Uploaded %s files to your ArDrive!', filesUploaded);

      // Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
      // Check for unsynced drive entities and create if necessary
      const newDrives : ArFSFileMetaData[] = await getNewDrivesFromDriveTable(user.login)
      if (newDrives.length > 0)
      {
        console.log ("   Wow that was your first ARDRIVE Transaction!  Congrats!")
        console.log ("   Lets finish setting up your profile by submitting a few more small transactions to the network.")
        await asyncForEach (newDrives, async (newDrive : ArFSDriveMetaData) => {
          if (newDrive.drivePrivacy === 'public') {
            // Create a public drive
            await createPublicDriveTransaction(user.walletPrivateKey, newDrive)
          }
          else if (newDrive.drivePrivacy === 'private') {
            // Create a new drive key
            const driveKey = await deriveDriveKey(user.dataProtectionKey, newDrive.driveId, user.walletPrivateKey);
            // Create a public drive
            await createPrivateDriveTransaction(driveKey, user.walletPrivateKey, newDrive);
          }
          // Create the Drive Root folder
          const driveRootFolder : ArFSFileMetaData = await getDriveRootFolderFromSyncTable(newDrive.rootFolderId);
          await uploadArDriveFolderMetaData(user, driveRootFolder);
        })
      }
    }
    return 'SUCCESS';
  } catch (err) {
    console.log(err);
    return 'ERROR processing files';
  }
};

// Scans through the queue & checks if a file has been mined, and if it has moves to Completed Table. If a file is not on the permaweb it will be uploaded
export const checkUploadStatus = async (login: string) => {
  try {
    console.log('---Checking Upload Status---');
    let permaWebLink: string;

    // Get all files and folders that need to have their transactions checked (metaDataSyncStatus of 2)
    const unsyncedFiles : ArFSFileMetaData[] = await getAllUploadedFilesFromSyncTable(login);
    let status: any;
    await asyncForEach(
      unsyncedFiles,
      async (unsyncedFile : ArFSFileMetaData) => {
        // Is the file data uploaded on the web?
        if (+unsyncedFile.fileDataSyncStatus === 2) {
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
          } else if (status === 202) {
          console.log('%s data is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
          } else if (status === 410 || status === 404) {
            const uploadTime = await getFileUploadTimeFromSyncTable(unsyncedFile.id)
            const currentTime = Math.round(Date.now() / 1000);
            if ((currentTime - uploadTime) < 1800000) { // 30 minutes
              console.log('%s data failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
              // Retry data transaction
              await setFileDataSyncStatus ('1', unsyncedFile.id)
            }
          } else {
            // CHECK IF FILE EXISTS AND IF NOT REMOVE FROM QUEUE
            fs.access(unsyncedFile.filePath, async (err) => {
              if (err) {
                console.log('%s data was not found locally anymore.  Removing from the queue', unsyncedFile.filePath);
                await removeFromSyncTable(unsyncedFile.id);
              }
            });
          }
        }

        // Is the file metadata uploaded on the web?
        if (+unsyncedFile.fileMetaDataSyncStatus === 2) {
          status = await getTransactionStatus(unsyncedFile.metaDataTxId);
          if (status === 200) {
            permaWebLink = gatewayURL.concat(unsyncedFile.dataTxId);
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
          } else if (status === 202) {
          console.log('%s metadata is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
          } else if (status === 410 || status === 404) {
            const uploadTime = await getFileUploadTimeFromSyncTable(unsyncedFile.id)
            const currentTime = Math.round(Date.now() / 1000);
            if ((currentTime - uploadTime) < 1800000) { // 30 minutes
              console.log('%s metadata failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
              // Retry metadata transaction
              await setFileMetaDataSyncStatus ('1', unsyncedFile.id)
            }
          }
        }
      }
    );
    
    // Get all drives that need to have their transactions checked (metaDataSyncStatus of 2)
    const unsyncedDrives : ArFSDriveMetaData[] = await getAllUploadedDrivesFromDriveTable();
    await asyncForEach(unsyncedDrives, async (unsyncedDrive: ArFSDriveMetaData) => {
      status = await getTransactionStatus(unsyncedDrive.metaDataTxId);
      if (status === 200) {
        permaWebLink = gatewayURL.concat(unsyncedDrive.metaDataTxId);
        console.log(
          'SUCCESS! %s Drive metadata was uploaded with TX of %s',
          unsyncedDrive.driveName,
          unsyncedDrive.metaDataTxId,
        );
        // Update the drive sync status to 3 so it is not checked any more
        let metaDataSyncStatus = 3;
        await completeDriveMetaDataFromDriveTable(metaDataSyncStatus, permaWebLink, unsyncedDrive.driveId);
      } else if (status === 202) {
        console.log('%s Drive metadata is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedDrive.driveName);
      } else if (status === 410 || status === 404) {
        console.log('%s Drive metadata failed to be uploaded (TX_FAILED)', unsyncedDrive.driveName);
        // Retry metadata transaction
        await setFileMetaDataSyncStatus ('1', unsyncedDrive.id)
      }
    })
    return 'Success checking upload file, folder and drive sync status';
  } catch (err) {
    console.log(err);
    return 'Error checking upload file status';
  }
};
