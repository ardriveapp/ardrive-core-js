// index.js
import * as fs from 'fs';
import { sep } from 'path';
import { encryptText, decryptText } from './crypto';
import { createArDriveProfile, getUserFromProfileById } from './db';
import { ArDriveUser } from './types';


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

// Decrypts user's private key information and unlocks their ArDrive
export const getUser = async (loginPassword: string, userId: string) => {
  try {
    let user: ArDriveUser = await getUserFromProfileById(userId);
    user.dataProtectionKey = await decryptText(JSON.parse(user.dataProtectionKey), loginPassword);
    user.walletPrivateKey = await decryptText(JSON.parse(user.walletPrivateKey), loginPassword);
    console.log('');
    console.log('ArDrive unlocked!!');
    console.log('');
    return user;
  } catch (err) {
    console.log(err);
    console.log('Incorrect Password!! Cannot unlock ArDrive');
    return 0;
  }
};

// TO DO
// Create an ArDrive password and save to DB
// export const resetArDrivePassword = async function () {};
