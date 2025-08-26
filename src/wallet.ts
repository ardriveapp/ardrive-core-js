import { PublicKey, ArweaveAddress, WalletAddresses } from './types';
import { Signer } from '@dha-team/arbundles';
import Transaction from 'arweave/node/lib/transaction';
import { JWKInterface } from 'arweave/node/lib/wallet';

export interface Wallet {
	getPublicKey(): Promise<PublicKey>;
	/**
	 * Gets the L1 normalized arweave address for the wallet
	 * @deprecated prefer to use getAllAddresses()
	 * */
	getAddress(): Promise<ArweaveAddress>;
	/** Gets all potential L1 and L2 normalized arweave addresses for the wallet */
	getAllAddresses(): Promise<WalletAddresses>;
	sign(data: Uint8Array): Promise<Uint8Array>;
	signTransaction(tx: Transaction): Promise<void>;
	getSigner(): Signer;
	getPrivateKey(): JWKInterface;
}
