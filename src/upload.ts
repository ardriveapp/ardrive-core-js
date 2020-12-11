// upload.js
import { DataItemJson } from 'arweave-bundles';
import {
  getTransactionStatus,
  createPublicDriveTransaction,
  createPrivateDriveTransaction,
  sendArDriveFee,
  getArDriveFee,
  createArDrivePublicDataItemTransaction,
  createArDrivePrivateDataItemTransaction,
  createArDrivePublicMetaDataItemTransaction,
  createArDrivePrivateMetaDataItemTransaction,
  createArDriveBundledDataTransaction,
} from './arweave';
import { asyncForEach, getWinston, formatBytes, gatewayURL, checkFileExistsSync } from './common';
import { deriveDriveKey, deriveFileKey, } from './crypto';
import {
  getFilesToUploadFromSyncTable,
  deleteFromSyncTable,
  getNewDrivesFromDriveTable, 
  getDriveRootFolderFromSyncTable, 
  getAllUploadedDrivesFromDriveTable, 
  completeDriveMetaDataFromDriveTable,
  setFileMetaDataSyncStatus,
  updateFileUploadTimeInSyncTable,
  getAllUploadedBundlesFromBundleTable,
  completeFileDataItemFromSyncTable,
  getAllUploadedDataItemsFromSyncTable,
  updateFileBundleTxId,
  getBundleUploadTimeFromBundleTable,
  setFileDataItemSyncStatus,
  completeBundleFromBundleTable,
} from './db';
import { ArDriveBundle, ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData, UploadBatch } from './types';

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
        // If this is a file we calculate the cost and add up the size.  We do not bundle/approve more than 2GB of data at a time
        if (+fileToUpload.fileDataSyncStatus === 1 && fileToUpload.entityType === 'file' && totalSize <= 2000000000) {
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
/*async function uploadArDriveFileData(
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
} */

// Tags and Uploads a single file/folder metadata to your ArDrive
/* async function uploadArDriveFileMetaData(
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
} */

// Tags and Uploads a single file/folder metadata to your ArDrive
/*async function uploadArDriveFolderMetaData(
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
} */

// Tags and creates a new data item (ANS-102) to be bundled
async function uploadArDriveFileDataItem(user: ArDriveUser, fileToUpload: ArFSFileMetaData) : Promise<DataItemJson | null> {
  let dataItem : DataItemJson | null;
  try {
    // Public file, do not encrypt
    if (+fileToUpload.isPublic === 1) {
      console.log('Uploading %s (%d bytes) to the Permaweb', fileToUpload.filePath, fileToUpload.fileSize);
      dataItem = await createArDrivePublicDataItemTransaction(
        user.walletPrivateKey,
        fileToUpload.filePath,
        fileToUpload.contentType,
        fileToUpload.id,
      );
    } else {
      // Private file, so it must be encrypted
      console.log('Encrypting and Uploading %s (%d bytes) to the Permaweb', fileToUpload.filePath, fileToUpload.fileSize);
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToUpload.driveId, user.walletPrivateKey);
      const fileKey : Buffer = await deriveFileKey (fileToUpload.fileId, driveKey);
      dataItem = await createArDrivePrivateDataItemTransaction(fileKey, fileToUpload, user.walletPrivateKey);
    }
    // Update the uploadTime of the file so we can track the status
    const currentTime = Math.round(Date.now() / 1000)
    await updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime)
    return dataItem;
  } catch (err) {
    console.log(err);
    console.log ("Error uploading file data item")
    return null;
  }
}

// Tags and creates a single file metadata item (ANS-102) to your ArDrive
async function uploadArDriveFileMetaDataItem(user: ArDriveUser, fileToUpload: ArFSFileMetaData) : Promise<DataItemJson | null> {
  let dataItem : DataItemJson | null;
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
      dataItem = await createArDrivePublicMetaDataItemTransaction(user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    } else {
      // Private file, so it must be encrypted
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToUpload.driveId, user.walletPrivateKey);
      const fileKey : Buffer = await deriveFileKey (fileToUpload.fileId, driveKey);
      dataItem = await createArDrivePrivateMetaDataItemTransaction(fileKey, user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    }

    // Update the uploadTime of the file so we can track the status
    const currentTime = Math.round(Date.now() / 1000)
    await updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime)
    return dataItem;
  } catch (err) {
    console.log(err);
    console.log ("Error uploading file metadata item")
    return null;
  }
}

// Tags and creates a single folder metadata item (ANS-102) to your ArDrive
async function uploadArDriveFolderMetaDataItem(user: ArDriveUser, fileToUpload: ArFSFileMetaData) : Promise<DataItemJson | null> {
  let dataItem : DataItemJson | null;
  try {
    // create secondary metadata, used to further ID the file (with encryption if necessary)
    const secondaryFileMetaDataTags = {
      name: fileToUpload.fileName,
    };
    // Convert to JSON string
    const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
    if (+fileToUpload.isPublic === 1) {
      // Public file, do not encrypt
      dataItem = await createArDrivePublicMetaDataItemTransaction(user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    } else {
      // Private file, so it must be encrypted using the Drive Key
      const driveKey : Buffer = await deriveDriveKey (user.dataProtectionKey, fileToUpload.driveId, user.walletPrivateKey);
      dataItem = await createArDrivePrivateMetaDataItemTransaction(driveKey, user.walletPrivateKey, fileToUpload, secondaryFileMetaDataJSON);
    }

    // Update the uploadTime of the file so we can track the status
    const currentTime = Math.round(Date.now() / 1000)
    await updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime)

    return dataItem;
  } catch (err) {
    console.log(err);
    console.log ("Error uploading folder metadata item")
    return null;
  }
}

// Uploads all queued files
export const uploadArDriveFiles = async (user: ArDriveUser) => {
  try {
    let items : DataItemJson[] = [];
    let filesUploaded = 0;
    let totalPrice = 0;
    let totalSize = 0;
    console.log('---Uploading All Queued Files and Folders---');
    const filesToUpload : ArFSFileMetaData[] = await getFilesToUploadFromSyncTable(user.login);
    if (Object.keys(filesToUpload).length > 0) {
      await asyncForEach(filesToUpload, async (fileToUpload: ArFSFileMetaData) => {
          // If the total size of the items is greater than 2GB, then we do not add any more files
          if (fileToUpload.entityType === 'file') {
            console.log ("Preparing file - %s", fileToUpload.fileName)
            // If fileDataSync is 1 and we have not exceeded our 2GB max bundle size, then we submit file data AND metadata
            if (+fileToUpload.fileDataSyncStatus === 1 && totalSize <= 2000000000) {
              const fileDataItem : DataItemJson | null = await uploadArDriveFileDataItem(user, fileToUpload);
              if (fileDataItem !== null) {
                // Get the price of this upload
                const winston = await getWinston(fileToUpload.fileSize);
                totalSize += fileToUpload.fileSize
                totalPrice += +winston * 0.000000000001; // Sum up all of the fees paid
                fileToUpload.dataTxId = fileDataItem.id;
                items.push(fileDataItem);
                filesUploaded += 1;
              }
              const fileMetaDataItem = await uploadArDriveFileMetaDataItem(user, fileToUpload);
              if (fileMetaDataItem !== null) {
                items.push(fileMetaDataItem);
              }
            // If only metaDataSync is 1, then we only submit file metadata
            } else if (+fileToUpload.fileMetaDataSyncStatus === 1) {
              const fileMetaDataItem = await uploadArDriveFileMetaDataItem(user, fileToUpload);
              if (fileMetaDataItem !== null) {
                items.push(fileMetaDataItem);
                filesUploaded += 1;
              }
            }
          }
          // If this is a folder, we create folder metadata
          else if (fileToUpload.entityType === 'folder') {
            const folderMetaDataItem = await uploadArDriveFolderMetaDataItem(user, fileToUpload);
            if (folderMetaDataItem !== null) {
              items.push(folderMetaDataItem);
              filesUploaded += 1;
            }
          }
        },
      );
    }

    if (filesUploaded > 0) {
      // Submit the master bundled transaction
      console.log ("Submitting a bundled TX for %s file(s)", filesUploaded)
      const bundledDataTxId = await createArDriveBundledDataTransaction(items, user.walletPrivateKey, user.login)
      console.log ("Bundled TX: ", bundledDataTxId)
      
      // Update all files/folders with the bundled TX ID that were submitted as part of this bundle
      for (let n = 0; n < filesUploaded; ++n) {
        await updateFileBundleTxId(bundledDataTxId, filesToUpload[n].id);
      }
      // Send the tip to the ArDrive community
      await sendArDriveFee(user.walletPrivateKey, totalPrice);
      console.log('Uploaded %s file(s) (totaling %s AR) to your ArDrive!', filesUploaded, totalPrice);

      // Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
      // Check for unsynced drive entitcies and create if necessary
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
          await uploadArDriveFolderMetaDataItem(user, driveRootFolder);
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
    let status: any;

    // Get all data bundles that need to have their V2 transactions checked (bundleSyncStatus of 2)
    const unsyncedBundles : ArDriveBundle[] = await getAllUploadedBundlesFromBundleTable(login)
    await asyncForEach(unsyncedBundles, async (unsyncedBundle : ArDriveBundle) => {
      status = await getTransactionStatus(unsyncedBundle.bundleTxId);
      if (status === 200) {
        console.log('SUCCESS! Data bundle was uploaded with TX of %s', unsyncedBundle.bundleTxId);
        console.log('...your most recent files can now be accessed on the PermaWeb!');
        await completeBundleFromBundleTable(unsyncedBundle.id)
        const dataItemsToComplete : ArFSFileMetaData[] = await getAllUploadedDataItemsFromSyncTable(login, unsyncedBundle.bundleTxId);
        await asyncForEach(dataItemsToComplete, async (dataItemToComplete : ArFSFileMetaData) => {
          permaWebLink = gatewayURL.concat(dataItemToComplete.dataTxId);
          // Complete the files by setting permaWebLink, fileMetaDataSyncStatus and fileDataSyncStatus to 3
          await completeFileDataItemFromSyncTable(permaWebLink, dataItemToComplete.id); 
        });
      } else if (status === 202) {
        console.log('%s data bundle is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedBundle.bundleTxId);
      } else if (status === 410 || status === 404) {
        const uploadTime = await getBundleUploadTimeFromBundleTable(unsyncedBundle.id)
        const currentTime = Math.round(Date.now() / 1000);
        if ((currentTime - uploadTime) < 1800000) { // 30 minutes
          console.log('%s data bundle failed to be uploaded (TX_FAILED)', unsyncedBundle.bundleTxId);
          // Retry data transaction
          const dataItemsToRetry : ArFSFileMetaData[] = await getAllUploadedDataItemsFromSyncTable(login, unsyncedBundle.bundleTxId);
          await asyncForEach(dataItemsToRetry, async (dataItemToRetry : ArFSFileMetaData) => {
            // Retry the files by setting fileMetaDataSyncStatus and fileDataSyncStatus to 1
            await setFileDataItemSyncStatus (dataItemToRetry.id)
          });
        };
      };
    });
    
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

// Old Upload File and Check Status
// Uses V2 TXs and no data bundles
/*export const uploadArDriveFiles = async (user: ArDriveUser) => {
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
};*/