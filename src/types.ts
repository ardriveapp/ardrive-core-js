import { JWKInterface } from 'arweave/node/lib/wallet';

export interface Wallet {
  walletPrivateKey: JWKInterface;
  walletPublicKey: string;
};

export interface ArDriveUser {
  login: any,
  privateArDriveId: any,
  privateArDriveTx: any,
  publicArDriveId: any,
  publicArDriveTx: any,
  dataProtectionKey: any,
  walletPrivateKey: any,
  walletPublicKey: any,
  syncFolderPath: any,
};

export interface UploadBatch {
  totalArDrivePrice: number,
  totalSize: string,
  totalNumberOfFileUploads: number,
  totalNumberOfMetaDataUploads: number,
  totalNumberOfFolderUploads: number
};

export interface FileToUpload {
  id: any,
  appName: string,
  appVersion: string,
  unixTime: string,
  contentType: string,
  entityType: string,
  driveId: string,
  parentFolderId: string,
  fileId: string,
  fileSize: string,
  filePath: any,
  fileName: string,
  arDrivePath: any,
  fileHash: any,
  lastModifiedDate: any,
  fileVersion: any,
  isPublic: any,
  fileDataSyncStatus: any,
  fileMetaDataSyncStatus: any,
  dataTxId: any,
};

export interface ArFSDriveMetadata {
  contentType: string,
  cipher: string,
  cipherIV: string,
  appName: string,
  unixTime: string,
  entityType: string,
  driveId: string,
  drivePrivacy: string,
  driveAuthMode: string,
}

export interface ArFSFileMetaData {
  appName: string,
  appVersion: string,
  unixTime: number,
  contentType: string,
  entityType: string,
  driveId: string,
  parentFolderId: string,
  fileId: string,
  fileSize: number,
  fileName: string,
  fileHash: string,
  filePath: string,
  fileVersion: number,
  lastModifiedDate: number,
  isLocal: number,
  isPublic: number,
  permaWebLink: string,
  metaDataTxId: string,
  dataTxId: string,
  fileDataSyncStatus: number,
  fileMetaDataSyncStatus: number,
};