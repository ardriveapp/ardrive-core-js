/// <reference types="node" />
import { CipherIV, DriveID, DriveKey, EntityID } from '../types';
import { JWKWallet } from '../jwk_wallet';
export declare type EntityMetaDataTransactionData = {
    [key: string]: string | number | EntityID;
};
interface PrivateKeyDataParams {
    readonly driveKeys?: DriveKey[];
    readonly password?: string;
    readonly wallet?: JWKWallet;
}
/**
 * A utility class that uses optional private key data to safely decrypt metadata
 * transaction data (the data JSON). Upon a successful decryption, the class
 * will cache the verified driveId and driveKey as a pair for future use.
 */
export declare class PrivateKeyData {
    private readonly password?;
    private readonly wallet?;
    private readonly driveKeyCache;
    private unverifiedDriveKeys;
    constructor({ password, driveKeys, wallet }: PrivateKeyDataParams);
    /** Safely decrypts a private data buffer into a decrypted transaction data */
    safelyDecryptToJson<T extends EntityMetaDataTransactionData>(cipherIV: CipherIV, driveId: DriveID, dataBuffer: Buffer, placeholder: T): Promise<T>;
    /**
     * Decrypts a private data buffer into a decrypted transaction data
     *
     * @throws when the provided driveKey or cipher fails to decrypt the transaction data
     */
    decryptToJson<T extends EntityMetaDataTransactionData>(cipherIV: CipherIV, encryptedDataBuffer: Buffer, driveKey: DriveKey): Promise<T>;
    /** Synchronously returns a driveKey from the cache by its driveId */
    driveKeyForDriveId(driveId: DriveID): DriveKey | false;
}
export {};
