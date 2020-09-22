import { JWKInterface } from 'arweave/node/lib/wallet';

export interface Wallet {
  walletPrivateKey: JWKInterface;
  walletPublicKey: string;
}

export interface arDriveUser {
  login: any,
  privateArDriveId: any,
  privateArDriveTx: any,
  publicArDriveId: any,
  publicArDriveTx: any,
  dataProtectionKey: any,
  walletPrivateKey: any,
  walletPublicKey: any,
  syncFolderPath: any,
}