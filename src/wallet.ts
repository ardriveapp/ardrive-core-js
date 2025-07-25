import { PublicKey, ArweaveAddress } from './types';
import { Signer } from '@dha-team/arbundles';
import Transaction from 'arweave/node/lib/transaction';
import { JWKInterface } from 'arweave/node/lib/wallet';

export interface Wallet {
	getPublicKey(): Promise<PublicKey>;
	getAddress(): Promise<ArweaveAddress>;
	sign(data: Uint8Array): Promise<Uint8Array>;
	signTransaction(tx: Transaction): Promise<void>;
	getSigner(): Signer;

	getPrivateKey(): JWKInterface;
}
