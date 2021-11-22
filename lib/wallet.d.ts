import { PublicKey, ArweaveAddress } from './types';
export interface Wallet {
    getPublicKey(): Promise<PublicKey>;
    getAddress(): Promise<ArweaveAddress>;
    sign(data: Uint8Array): Promise<Uint8Array>;
}
