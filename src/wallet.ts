import * as fs from 'fs';
import { JWKInterface } from 'arweave/node/lib/wallet';

import { arweave } from './public/arweave';
import { Wallet } from './types/arfs_Types';

// Gets a public key for a given JWK
export async function getAddressForWallet(walletPrivateKey: JWKInterface): Promise<string> {
	return arweave.wallets.jwkToAddress(walletPrivateKey);
}

// Imports an existing wallet as a JWK from a user's local harddrive
export async function getLocalWallet(
	existingWalletPath: string
): Promise<{ walletPrivateKey: JWKInterface; walletPublicKey: string }> {
	const walletPrivateKey: JWKInterface = JSON.parse(fs.readFileSync(existingWalletPath).toString());
	const walletPublicKey = await getAddressForWallet(walletPrivateKey);
	return { walletPrivateKey, walletPublicKey };
}

// Get the balance of an Arweave wallet
export async function getWalletBalance(walletPublicKey: string): Promise<number> {
	try {
		let balance = await arweave.wallets.getBalance(walletPublicKey);
		balance = arweave.ar.winstonToAr(balance);
		return +balance;
	} catch (err) {
		console.log(err);
		return 0;
	}
}

// Creates a new Arweave wallet JWK comprised of a private key and public key
export async function createArDriveWallet(): Promise<Wallet> {
	try {
		const walletPrivateKey = await arweave.wallets.generate();
		const walletPublicKey = await getAddressForWallet(walletPrivateKey);
		console.log('SUCCESS! Your new wallet public address is %s', walletPublicKey);
		return { walletPrivateKey, walletPublicKey };
	} catch (err) {
		console.error('Cannot create Wallet');
		console.error(err);
		return Promise.reject(err);
	}
}
