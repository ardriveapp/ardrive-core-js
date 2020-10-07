import { JWKInterface } from 'arweave/node/lib/wallet';
import { Path } from 'typescript';

export interface Wallet {
  walletPrivateKey: JWKInterface;
  walletPublicKey: string;
};

export interface ArDriveUser {
  login: any,
  dataProtectionKey: any,
  walletPrivateKey: any,
  walletPublicKey: any,
  syncFolderPath: Path,
};

export interface UploadBatch {
  totalArDrivePrice: number,
  totalSize: string,
  totalNumberOfFileUploads: number,
  totalNumberOfMetaDataUploads: number,
  totalNumberOfFolderUploads: number
};

export interface ArFSDriveMetadata {
  id: number,
  appName: string,
  appVersion: string,
  driveName: string,
  rootFolderId: string,
  cipher: string,
  cipherIV: string,
  unixTime: number,
  arFS: string,
  driveId: string,
  drivePrivacy: string,
  driveAuthMode: string,
  metaDataTxId: string,
  metaDataSyncStatus: number,
  permaWebLink: string,
};

export interface ArFSFileMetaData {
  id: number,
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