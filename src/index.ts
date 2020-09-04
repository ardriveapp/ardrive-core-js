import { JWKInterface } from 'arweave/node/lib/wallet';

export interface Wallet {
  walletPrivateKey: JWKInterface;
  walletPublicKey: string;
}

export { getWalletBalance, getLocalWallet, createArDriveWallet, getAllMyArDriveIds } from './arweave';
export { setupDatabase, getAll_fromProfile, getMyFileDownloadConflicts } from './db';
export { sleep, checkOrCreateFolder, backupWallet } from './common';
export { getMyArDriveFilesFromPermaWeb, downloadMyArDriveFiles } from './download';
export { watchFolder, resolveFileDownloadConflict } from './files';
export { checkUploadStatus, uploadArDriveFiles, getPriceOfNextUploadBatch } from './upload';
export { getUser, setUser } from './profile';