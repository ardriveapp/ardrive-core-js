// index.js
import * as mime from 'mime-types';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { sep, extname } from 'path';
import { Wallet } from './types';

export const gatewayURL = 'https://arweave.net/';
export const appName = 'ArDrive';
export const appVersion = '0.1.2';
export const arFSVersion = '0.9';
export const cipher = "AES256-GCM"

// Pauses application
const sleep = async (ms: number) => {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    setTimeout(resolve, ms);
  });
};

// Asyncronous ForEach function
const asyncForEach = async (array: any[], callback: any) => {
  for (let index = 0; index < array.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
};

// Format byte size to something nicer.  This is minified...
const formatBytes = (bytes: number) => {
  const marker = 1024; // Change to 1000 if required
  const decimal = 3; // Change as required
  const kiloBytes = marker; // One Kilobyte is 1024 bytes
  const megaBytes = marker * marker; // One MB is 1024 KB
  const gigaBytes = marker * marker * marker; // One GB is 1024 MB
  // const teraBytes = marker * marker * marker * marker; // One TB is 1024 GB

  // return bytes if less than a KB
  if (bytes < kiloBytes) return `${bytes} Bytes`;
  // return KB if less than a MB
  if (bytes < megaBytes) return `${(bytes / kiloBytes).toFixed(decimal)} KB`;
  // return MB if less than a GB
  if (bytes < gigaBytes) return `${(bytes / megaBytes).toFixed(decimal)} MB`;
  // return GB if less than a TB
  return `${(bytes / gigaBytes).toFixed(decimal)} GB`;
};

const extToMime = (fullpath: string): string => {
  let extension = extname(fullpath);
  extension = extension.toLowerCase();
  const m = mime.lookup(extension);
  return m === false ? 'unknown' : m;
};

// Gets the price of AR based on amount of data
const getWinston = async (bytes: any) => {
  // const response = await fetch(`https://arweave.net/price/${bytes}`);
  const response = await fetch(`https://perma.online/price/${bytes}`);
  const winston = await response.json();
  return winston;
};

// Checks path if it exists, and creates if not
const checkOrCreateFolder = (folderPath = '') => {
  try {
    const stats = fs.statSync(folderPath);
    if (stats.isDirectory()) {
      return folderPath;
    }
    console.log(
      'The path you have entered is not a directory, please enter a correct path for your ArDrive wallet backup.',
    );
    return '';
  } catch (err) {
    console.log('Folder not found.  Creating new directory at %s', folderPath);
    fs.mkdirSync(folderPath);
    return folderPath;
  }
};

const checkFileExistsSync = (filePath: string) => {
  let exists = true;
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
  } catch (e) {
    exists = false;
  }
  return exists;
};

const backupWallet = async (backupWalletPath: string, wallet: Wallet, owner: string) => {
  try {
    const backupWalletFile = backupWalletPath.concat(sep, 'ArDrive_Backup_', owner, '.json');
    console.log('Writing your ArDrive Wallet backup to %s', backupWalletFile);
    fs.writeFileSync(backupWalletFile, JSON.stringify(wallet.walletPrivateKey));
    return 'Success!';
  } catch (err) {
    console.log(err);
    return 0;
  }
};

export {
  sleep,
  asyncForEach,
  formatBytes,
  extToMime,
  getWinston,
  checkOrCreateFolder,
  backupWallet,
  checkFileExistsSync,
};
