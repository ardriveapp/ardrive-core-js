// index.js
import * as fs from 'fs';
import { sep } from 'path';
import { encryptText, decryptText } from './crypto';
import {
  createArDriveProfile,
  getAll_fromProfileWithWalletPublicKey,
} from './db';

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
    console.log(
      'The path you have entered is not a directory, please enter a correct path for ArDrive.'
    );
    return '0';
  } catch (err) {
    console.log(
      'Folder not found.  Creating new directory at %s',
      syncFolderPath
    );
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
  dataProtectionKey: any
) => {
  const encryptedWalletPrivateKey = await encryptText(
    JSON.stringify(walletPrivateKey),
    loginPassword
  );
  const encryptedDataProtectionKey = await encryptText(
    dataProtectionKey,
    loginPassword
  );

  // Set sync schedule, not modifiable at this time
  const syncSchedule = '1 minute';
  // 5 minutes, 15 mintues, 30 minutes, 60 minutes
  // Save to Database
  const profileToAdd = {
    owner,
    arDriveId,
    sync_schedule: syncSchedule,
    data_protection_key: JSON.stringify(encryptedDataProtectionKey),
    wallet_private_key: JSON.stringify(encryptedWalletPrivateKey),
    wallet_public_key: walletPublicKey,
    sync_folder_path: syncFolderPath,
    email: null,
  };

  await createArDriveProfile(profileToAdd);

  console.log('New ArDrive user added!');
  return {
    owner,
    arDriveId,
    password: dataProtectionKey,
    jwk: JSON.stringify(walletPrivateKey),
    wallet_public_key: walletPublicKey,
    sync_folder_path: syncFolderPath,
  };
};

// Decrypts user's private key information and unlocks their ArDrive
export const getUser = async (
  wallet_public_key: string,
  loginPassword: any
) => {
  try {
    const profile = await getAll_fromProfileWithWalletPublicKey(
      wallet_public_key
    );
    const jwk = await decryptText(
      JSON.parse(profile.wallet_private_key),
      loginPassword
    );
    const dataProtectionKey = await decryptText(
      JSON.parse(profile.data_protection_key),
      loginPassword
    );
    console.log('');
    console.log('ArDrive unlocked!!');
    console.log('');
    return {
      password: dataProtectionKey,
      jwk,
      wallet_public_key,
      owner: profile.owner,
      arDriveId: profile.arDriveId,
      sync_folder_path: profile.sync_folder_path,
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
