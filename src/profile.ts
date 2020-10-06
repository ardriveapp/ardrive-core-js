// index.js
import * as fs from 'fs';
import { sep } from 'path';
import { getDriveRootFolderTxId } from './arweave';
import { asyncForEach } from './common';
import { encryptText, decryptText } from './crypto';
import { addFileToSyncTable, createArDriveProfile, getAllDrivesFromDriveTable, getFolderFromSyncTable, getUserFromProfile } from './db';
import { ArDriveUser, ArFSDriveMetadata, ArFSFileMetaData } from './types';


export const setupArDriveSyncFolder = async (syncFolderPath: string) => {
  try {
    const stats = fs.statSync(syncFolderPath);
    if (stats.isDirectory()) {
      if (!fs.existsSync(syncFolderPath.concat(sep, 'Public'))) {
        fs.mkdirSync(syncFolderPath.concat(sep, 'Public'));
      }
      if (!fs.existsSync(syncFolderPath.concat(sep, 'Private'))) {
        fs.mkdirSync(syncFolderPath.concat(sep, 'Private'));
      }
      console.log('Using %s as your local Sync Folder Path for ArDrive.', syncFolderPath);
      return "Exists";
    }
    console.log('The path you have entered is not a valid folder, please enter a correct Sync Folder Path for your Public and Private ArDrives.');
    return 'Invalid';
  } catch (err) {
    console.log('Folder not found.  Creating new directory at %s', syncFolderPath);
    fs.mkdirSync(syncFolderPath);
    fs.mkdirSync(syncFolderPath.concat(sep, 'Public'));
    fs.mkdirSync(syncFolderPath.concat(sep, 'Private'));
    return "Created";
  }
};

// This creates all of the Drives found for the user
export const setupDrives = async (walletPublicKey: string, syncFolderPath: string) => {
  try {
    console.log ("Initializing ArDrives");
    // check if the root sync folder exists, if not create it
    if (!fs.existsSync(syncFolderPath)) {
      fs.mkdirSync(syncFolderPath);
    }

    // get all drives
    const drives : ArFSDriveMetadata[] = await getAllDrivesFromDriveTable()

    // for each drive, check if drive folder exists
    await asyncForEach(drives, async (drive: ArFSDriveMetadata) => {

      // Check if the drive path exists, if not, create it
      const drivePath : string = syncFolderPath + '\\' + drive.driveName;
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
        if (drive.drivePrivacy === 'private') {
          isPublic = 0;
        }

        // Get the root folder ID for this drive
        const rootFolderTxId: string = await getDriveRootFolderTxId(walletPublicKey, drive.driveId, drive.rootFolderId)

        // Prepare a new folder to add to the sync table
        // This folder will require a metadata transaction to arweave
        const driveFolderToAdd : ArFSFileMetaData = {
          id: 0,
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
          metaDataTxId: rootFolderTxId, 
          dataTxId: '0',
          permaWebLink: '',
          fileDataSyncStatus: 0, // Folders do not require a data tx
          fileMetaDataSyncStatus: drive.metaDataSyncStatus, // Sync status of 1 requries a metadata tx
        };
        await addFileToSyncTable(driveFolderToAdd);
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
    const encryptedWalletPrivateKey = await encryptText(JSON.stringify(user.walletPrivateKey), loginPassword);
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

// TO DO
// Create an ArDrive password and save to DB
// export const resetArDrivePassword = async function () {};
