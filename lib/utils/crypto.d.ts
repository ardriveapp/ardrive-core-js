/// <reference types="node" />
import * as crypto from 'crypto';
import { ArFSEncryptedData } from '../types/base_Types';
import { JWK } from 'jwk-to-pem';
export declare function getArweaveWalletSigningKey(jwk: JWK, data: Uint8Array): Promise<Uint8Array>;
export declare function deriveDriveKey(dataEncryptionKey: crypto.BinaryLike, driveId: string, walletPrivateKey: string): Promise<Buffer>;
export declare function deriveFileKey(fileId: string, driveKey: Buffer): Promise<Buffer>;
export declare function driveEncrypt(driveKey: Buffer, data: Buffer): Promise<ArFSEncryptedData>;
export declare function fileEncrypt(fileKey: Buffer, data: Buffer): Promise<ArFSEncryptedData>;
export declare function getFileAndEncrypt(fileKey: Buffer, filePath: string): Promise<ArFSEncryptedData>;
export declare function driveDecrypt(cipherIV: string, driveKey: Buffer, data: Buffer): Promise<Buffer>;
export declare function fileDecrypt(cipherIV: string, fileKey: Buffer, data: Buffer): Promise<Buffer>;
export declare function checksumFile(path: string): Promise<string>;
export declare function encryptText(text: crypto.BinaryLike, password: string): Promise<{
    iv: string;
    encryptedText: string;
}>;
export declare function decryptText(text: {
    iv: {
        toString: () => string;
    };
    encryptedText: {
        toString: () => string;
    };
}, password: string): Promise<string>;
