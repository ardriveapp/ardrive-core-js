import { JWKInterface } from 'arweave/node/lib/wallet';
import { PublicKey, ArweaveAddress } from './types';
import { Wallet } from './wallet';
export declare class JWKWallet implements Wallet {
    private readonly jwk;
    constructor(jwk: JWKInterface);
    getPublicKey(): Promise<PublicKey>;
    getPrivateKey(): JWKInterface;
    getAddress(): Promise<ArweaveAddress>;
    sign(data: Uint8Array): Promise<Uint8Array>;
}
