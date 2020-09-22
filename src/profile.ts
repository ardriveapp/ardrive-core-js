// index.js
import * as fs from 'fs';
import { sep } from 'path';
import { encryptText, decryptText } from './crypto';
import { createArDriveProfile, getAllFromProfileWithWalletPublicKey } from './db';
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

// First Time Setup
export const setUser = async (loginPassword: string, user: ArDriveUser) => {
  try {
    const encryptedWalletPrivateKey = await encryptText(JSON.stringify(user.walletPrivateKey), loginPassword);
    const encryptedDataProtectionKey = await encryptText(user.dataProtectionKey, loginPassword);
  
    // Save to Database
    const userToAdd: ArDriveUser = {
      login: user.login,
      privateArDriveId: user.privateArDriveId,
      privateArDriveTx: user.privateArDriveTx,
      publicArDriveId: user.publicArDriveId,
      publicArDriveTx: user.publicArDriveTx,
      dataProtectionKey: JSON.stringify(encryptedDataProtectionKey),
      walletPrivateKey: JSON.stringify(encryptedWalletPrivateKey),
      walletPublicKey: user.walletPublicKey,
      syncFolderPath: user.syncFolderPath,
    };
  
    await createArDriveProfile(userToAdd)
  
    console.log('New ArDrive user added!');
    return userToAdd;
  }
  catch (err) {
    console.log(err);
    console.log('Error setting up new user');
    return "Error";
  }
};

// Decrypts user's private key information and unlocks their ArDrive
export const getUser = async (walletPublicKey: string, loginPassword: any) => {
  try {
    const profile: ArDriveUser = await getAllFromProfileWithWalletPublicKey(walletPublicKey);
    const dataProtectionKey = await decryptText(JSON.parse(profile.dataProtectionKey), loginPassword);
    const walletPrivateKey = await decryptText(JSON.parse(profile.walletPrivateKey), loginPassword);

    const userToReturn: ArDriveUser = {
      login: profile.login,
      privateArDriveId: profile.privateArDriveId,
      privateArDriveTx: profile.privateArDriveTx,
      publicArDriveId: profile.publicArDriveId,
      publicArDriveTx: profile.publicArDriveTx,
      dataProtectionKey: dataProtectionKey,
      walletPrivateKey: walletPrivateKey,
      walletPublicKey: profile.walletPublicKey,
      syncFolderPath: profile.syncFolderPath,
  };
    console.log('');
    console.log('ArDrive unlocked!!');
    console.log('');
    return userToReturn;

  } catch (err) {
    console.log(err);
    console.log('Incorrect Password!! Cannot unlock ArDrive');
    return 0;
  }
};

// TO DO
// Create an ArDrive password and save to DB
// export const resetArDrivePassword = async function () {};
