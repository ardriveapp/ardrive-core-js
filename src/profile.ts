// index.js
import * as fs from 'fs';
import path from 'path';
import { getPrivateDriveRootFolderTxId, getPublicDriveRootFolderTxId, getSharedPublicDrive } from './arweave';
import { asyncForEach } from './common';
import { encryptText, decryptText } from './crypto';
import { addDriveToDriveTable, addFileToSyncTable, createArDriveProfile, getAllDrivesByLoginFromDriveTable, getFolderFromSyncTable, getUserFromProfile, removeByDriveIdFromSyncTable, removeFromDriveTable, removeFromProfileTable } from './db';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from './types';

// This creates all of the Drives found for the user
export const setupDrives = async (login: string, syncFolderPath: string) => {
  try {
    console.log ("Initializing ArDrives");
    // check if the root sync folder exists, if not create it
    if (!fs.existsSync(syncFolderPath)) {
      fs.mkdirSync(syncFolderPath);
    }

    // get all drives
    const drives : ArFSDriveMetaData[] = await getAllDrivesByLoginFromDriveTable(login)

    // for each drive, check if drive folder exists
    await asyncForEach(drives, async (drive: ArFSDriveMetaData) => {

      // Check if the drive path exists, if not, create it
      const drivePath : string = path.join(syncFolderPath, drive.driveName);
      if (!fs.existsSync(drivePath)) {
        fs.mkdirSync(drivePath);
      }

      // check if drive folder entity is setup already in sync table
      const driveFolderEntity : ArFSFileMetaData = await getFolderFromSyncTable(drivePath)
      if (driveFolderEntity === undefined) {
        // if not, add it to the sync table
        // determine if the files are private or public
        // this should be refactored, and isPublic should change to drivePrivacy
        let isPublic = 1;
        let rootFolderMetaData = {
          metaDataTxId: '',
          cipher: '',
          cipherIV: '',
        }
        if (drive.drivePrivacy === 'private') {
          isPublic = 0;
          rootFolderMetaData = await getPrivateDriveRootFolderTxId(drive.driveId, drive.rootFolderId);
        } else {
          // Get the root folder ID for this drive
          rootFolderMetaData.metaDataTxId = await getPublicDriveRootFolderTxId(drive.driveId, drive.rootFolderId)
        }

        // Prepare a new folder to add to the sync table
        // This folder will require a metadata transaction to arweave
        const driveRootFolderToAdd : ArFSFileMetaData = {
          id: 0,
          login,
          appName: drive.appName,
          appVersion: drive.appVersion,
          unixTime: drive.unixTime,
          contentType: 'application/json',
          entityType: 'folder',
          driveId: drive.driveId,
          parentFolderId: '0', // Root folders have no parent folder ID.
          fileId: drive.rootFolderId,
          filePath: drivePath,
          fileName: drive.driveName,
          fileHash: '0',
          fileSize: 0,
          lastModifiedDate: drive.unixTime,
          fileVersion: 0,
          isPublic,
          isLocal: 1,
          metaDataTxId: rootFolderMetaData.metaDataTxId, 
          dataTxId: '0',
          permaWebLink: '',
          fileDataSyncStatus: 0, // Folders do not require a data tx
          fileMetaDataSyncStatus: drive.metaDataSyncStatus, // Sync status of 1 requries a metadata tx
          cipher: rootFolderMetaData.cipher,
          dataCipherIV: '',
          metaDataCipherIV: rootFolderMetaData.cipherIV,
          cloudOnly: 0,
        };
        await addFileToSyncTable(driveRootFolderToAdd);
      }
    });
    console.log ("Initialization completed")
    return "Initialization completed"
  }
  catch (err) {
    console.log (err)
    return "Error"
  }
};

// Encrypts the user's keys and adds a user to the database
export const addNewUser = async (loginPassword: string, user: ArDriveUser) => {
  try {
    const encryptedWalletPrivateKey = await encryptText(user.walletPrivateKey, loginPassword);
    const encryptedDataProtectionKey = await encryptText(user.dataProtectionKey, loginPassword);
    user.dataProtectionKey = JSON.stringify(encryptedDataProtectionKey);
    user.walletPrivateKey = JSON.stringify(encryptedWalletPrivateKey);
    await createArDriveProfile(user)
    console.log('New ArDrive user added!');
    return "Success";
  }
  catch (err) {
    console.log(err);
    return "Error";
  }
};

// Add a Shared Public drive, using a DriveId
export const addSharedPublicDrive = async (user: ArDriveUser, driveId: string) => {
  try {
    // Get the drive information from arweave
    const sharedPublicDrive : ArFSDriveMetaData = await getSharedPublicDrive(driveId);
    sharedPublicDrive.login = user.login;
    // Check if the drive path exists, if not, create it
    const drivePath : string = path.join(user.syncFolderPath, sharedPublicDrive.driveName);
    if (!fs.existsSync(drivePath)) {
      fs.mkdirSync(drivePath);
    }

    // Get the root folder ID for this drive
    const metaDataTxId = await getPublicDriveRootFolderTxId(sharedPublicDrive.driveId, sharedPublicDrive.rootFolderId)

    // Setup Drive Root Folder
    const driveRootFolderToAdd : ArFSFileMetaData = {
      id: 0,
      login: user.login,
      appName: sharedPublicDrive.appName,
      appVersion: sharedPublicDrive.appVersion,
      unixTime: sharedPublicDrive.unixTime,
      contentType: 'application/json',
      entityType: 'folder',
      driveId: sharedPublicDrive.driveId,
      parentFolderId: '0', // Root folders have no parent folder ID.
      fileId: sharedPublicDrive.rootFolderId,
      filePath: drivePath,
      fileName: sharedPublicDrive.driveName,
      fileHash: '0',
      fileSize: 0,
      lastModifiedDate: sharedPublicDrive.unixTime,
      fileVersion: 0,
      isPublic: 1,
      isLocal: 1,
      metaDataTxId, 
      dataTxId: '0',
      permaWebLink: '',
      fileDataSyncStatus: 0, // Folders do not require a data tx
      fileMetaDataSyncStatus: 3,
      cipher: '',
      dataCipherIV: '',
      metaDataCipherIV: '',
      cloudOnly: 0,
    };

    // Add Drive to Drive Table
    await addDriveToDriveTable(sharedPublicDrive);

    // Add the Root Folder to the Sync Table
    await addFileToSyncTable(driveRootFolderToAdd);
    return 'Shared Public Drive Added'
  }
  catch (err) {
    console.log (err)
    console.log ('Error adding Shared Public Drive')
    return 'Error'
  }

}

// Deletes a user and all of their associated drives and files in the database
export const deleteUserAndDrives = async (login: string) => {
  // Delete profile matching login
  await removeFromProfileTable(login);
  // Get DriveIDs for login
  const drivesToDelete : ArFSDriveMetaData[] = await getAllDrivesByLoginFromDriveTable(login);
  // Delete drives and files matching login
  await asyncForEach(drivesToDelete, async (drive: ArFSDriveMetaData) => {
    // Delete files in the sync table with matching DriveIDs
    await removeByDriveIdFromSyncTable(drive.driveId);
    // Remove the drive itself from the Drive Table
    await removeFromDriveTable(drive.driveId);
  })
}

// Deletes a single drive and its files in the database
export const deleteDrive = async (driveId: string) => {
  await removeByDriveIdFromSyncTable(driveId);
  await removeFromDriveTable(driveId);
}

// Checks if the user's password is valid
export const passwordCheck = async (loginPassword: string, login: string) : Promise<boolean> => {
  try {
    let user: ArDriveUser = await getUserFromProfile(login);
    user.dataProtectionKey = await decryptText(JSON.parse(user.dataProtectionKey), loginPassword);
    user.walletPrivateKey = await decryptText(JSON.parse(user.walletPrivateKey), loginPassword);
    return true;
  }
  catch (err) {
    return false;
  }
};

// Decrypts user's private key information and unlocks their ArDrive
export const getUser = async (loginPassword: string, login: string) => {
  let user: ArDriveUser = await getUserFromProfile(login)
  user.dataProtectionKey = await decryptText(JSON.parse(user.dataProtectionKey), loginPassword);
  user.walletPrivateKey = await decryptText(JSON.parse(user.walletPrivateKey), loginPassword);
  console.log('');
  console.log('ArDrive unlocked!!');
  console.log('');
  return user;
};

