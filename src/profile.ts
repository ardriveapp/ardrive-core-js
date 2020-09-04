// index.js
import * as fs from 'fs';
import { sep } from 'path';
import { encryptText, decryptText } from './crypto';
import { createArDriveProfile, getAllFromProfileWithWalletPublicKey } from './db';

export const setupArDriveSyncFolder = async (syncFolderPath: string) => {
  try {
    const stats = fs.statSync(syncFolderPath);
    if (stats.isDirectory()) {
      if (!fs.existsSync(syncFolderPath.concat(sep, 'Public'))) {
        fs.mkdirSync(syncFolderPath.concat(sep, 'Public'));
      }
      console.log('Using %s as the local ArDrive folder.', syncFolderPath);
      return syncFolderPath;
    }
    console.log('The path you have entered is not a directory, please enter a correct path for ArDrive.');
    return '0';
  } catch (err) {
    console.log('Folder not found.  Creating new directory at %s', syncFolderPath);
    fs.mkdirSync(syncFolderPath);
    fs.mkdirSync(syncFolderPath.concat(sep, 'Public'));
    return syncFolderPath;
  }
};

// First Time Setup
export const setUser = async (
  owner: any,
  arDriveId: string,
  syncFolderPath: any,
  walletPrivateKey: any,
  walletPublicKey: any,
  loginPassword: any,
  dataProtectionKey: any,
) => {
  const encryptedWalletPrivateKey = await encryptText(JSON.stringify(walletPrivateKey), loginPassword);
  const encryptedDataProtectionKey = await encryptText(dataProtectionKey, loginPassword);

  // Set sync schedule, not modifiable at this time
  const syncSchedule = '1 minute';
  // 5 minutes, 15 mintues, 30 minutes, 60 minutes
  // Save to Database
  const profileToAdd = {
    owner,
    arDriveId,
    syncSchedule,
    dataProtectionKey: JSON.stringify(encryptedDataProtectionKey),
    walletPrivateKey: JSON.stringify(encryptedWalletPrivateKey),
    walletPublicKey,
    syncFolderPath,
    email: null,
  };

  await createArDriveProfile(profileToAdd);

  console.log('New ArDrive user added!');
  return {
    owner,
    arDriveId,
    password: dataProtectionKey,
    jwk: JSON.stringify(walletPrivateKey),
    walletPublicKey,
    syncFolderPath,
  };
};

// Decrypts user's private key information and unlocks their ArDrive
export const getUser = async (walletPublicKey: string, loginPassword: any) => {
  try {
    const profile = await getAllFromProfileWithWalletPublicKey(walletPublicKey);
    const jwk = await decryptText(JSON.parse(profile.walletPrivateKey), loginPassword);
    const dataProtectionKey = await decryptText(JSON.parse(profile.dataProtectionKey), loginPassword);
    console.log('');
    console.log('ArDrive unlocked!!');
    console.log('');
    return {
      password: dataProtectionKey,
      jwk,
      walletPublicKey,
      owner: profile.owner,
      arDriveId: profile.arDriveId,
      syncFolderPath: profile.syncFolderPath,
    };
  } catch (err) {
    console.log(err);
    console.log('Incorrect Password!! Cannot unlock ArDrive');
    return 0;
  }
};

// TO DO
// Create an ArDrive password and save to DB
// export const resetArDrivePassword = async function () {};
