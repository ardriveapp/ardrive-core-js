/// <reference types="node" />
import * as types from '../types/base_Types';
import { ArDriveUser } from '../types/base_Types';
import { Wallet } from '../wallet';
export declare function sleep(ms: number): Promise<number>;
export declare function asyncForEach(array: any[], callback: any): Promise<string>;
export declare function formatBytes(bytes: number): string;
export declare function extToMime(fullPath: string): string;
export declare function moveFolder(oldFolderPath: string, newFolderPath: string): string;
export declare function checkOrCreateFolder(folderPath: string): string;
export declare function checkFolderExistsSync(folderPath: string): boolean;
export declare function checkFileExistsSync(filePath: string): boolean;
export declare function checkExactFileExistsSync(filePath: string, lastModifiedDate: number): boolean;
export declare function backupWallet(backupWalletPath: string, wallet: Wallet, owner: string): Promise<string>;
export declare function createPrivateFileSharingLink(user: ArDriveUser, fileToShare: types.ArFSFileMetaData): Promise<string>;
export declare function createPublicFileSharingLink(fileToShare: types.ArFSFileMetaData): Promise<string>;
export declare function createPublicDriveSharingLink(driveToShare: types.ArFSDriveMetaData): Promise<string>;
export declare function Utf8ArrayToStr(array: any): Promise<string>;
export declare function weightedRandom(dict: Record<string, number>): string | undefined;
export declare function sanitizePath(path: string): Promise<string>;
/**
 * Converts Winston value into AR
 *
 * @throws Error when Winston value is not an integer
 *
 * @TODO Handle integer overflow
 */
export declare function winstonToAr(winston: number): number;
export declare function encryptFileOrFolderData(itemToUpload: types.ArFSFileMetaData, driveKey: Buffer, secondaryFileMetaDataJSON: string): Promise<types.ArFSEncryptedData>;
export declare function readJWKFile(path: string): Wallet;
export declare function fetchMempool(): Promise<string[]>;
export declare function urlEncodeHashKey(keyBuffer: Buffer): string;
