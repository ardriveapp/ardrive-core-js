import * as fs from 'fs';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { arweave } from './public/arweave';
import { Wallet } from './types/arfs_Types';
import { ArDriveUser } from './types/base_Types';
import { getAllDrivesByLoginFromDriveTable, getUserFromProfile } from './db/db_get';
import { decryptText, encryptText } from './crypto';
import { removeByDriveIdFromSyncTable, removeFromDriveTable, removeFromProfileTable } from './db/db_delete';
import { ArFSDriveMetaData } from './types/base_Types';
import { asyncForEach } from './common';
import { createArDriveProfile } from './db/db_update';

// Gets a public key for a given JWK
export async function getAddressForWallet(walletPrivateKey: JWKInterface): Promise<string> {
	return arweave.wallets.jwkToAddress(walletPrivateKey);
}

// Imports an existing wallet as a JWK from a user's local harddrive
export async function getCachedWallet(
	existingWalletPath: string
): Promise<{ walletPrivateKey: JWKInterface; walletPublicKey: string }> {
	const walletPrivateKey: JWKInterface = JSON.parse(fs.readFileSync(existingWalletPath).toString());
	const walletPublicKey = await getAddressForWallet(walletPrivateKey);
	return { walletPrivateKey, walletPublicKey };
}

export const getLocalWallet = getCachedWallet;

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

// Encrypts the user's keys and adds a user to the database
export async function addNewUser(loginPassword: string, user: ArDriveUser): Promise<string> {
	try {
		const encryptedWalletPrivateKey = await encryptText(user.walletPrivateKey, loginPassword);
		const encryptedDataProtectionKey = await encryptText(user.dataProtectionKey, loginPassword);
		user.dataProtectionKey = JSON.stringify(encryptedDataProtectionKey);
		user.walletPrivateKey = JSON.stringify(encryptedWalletPrivateKey);
		await createArDriveProfile(user);
		console.log('New ArDrive user added!');
		return 'Success';
	} catch (err) {
		console.log(err);
		return 'Error';
	}
}

// Deletes a user and all of their associated drives and files in the database
export async function deleteUserAndDrives(login: string): Promise<string> {
	// Delete profile matching login
	await removeFromProfileTable(login);
	// Get DriveIDs for login
	const drivesToDelete: ArFSDriveMetaData[] = getAllDrivesByLoginFromDriveTable(login);
	// Delete drives and files matching login
	await asyncForEach(drivesToDelete, async (drive: ArFSDriveMetaData) => {
		// Delete files in the sync table with matching DriveIDs
		await removeByDriveIdFromSyncTable(drive.driveId);
		// Remove the drive itself from the Drive Table
		await removeFromDriveTable(drive.driveId);
	});
	return 'Success';
}

// Checks if the user's password is valid
export async function passwordCheck(loginPassword: string, login: string): Promise<boolean> {
	try {
		const user: ArDriveUser = await getUserFromProfile(login);
		user.walletPrivateKey = await decryptText(JSON.parse(user.walletPrivateKey), loginPassword);
		if (user.walletPrivateKey === 'ERROR') {
			return false;
		}
		return true;
	} catch (err) {
		return false;
	}
}

// Decrypts user's private key information and unlocks their ArDrive
export async function getUser(loginPassword: string, login: string): Promise<ArDriveUser> {
	const user: ArDriveUser = await getUserFromProfile(login);
	user.dataProtectionKey = await decryptText(JSON.parse(user.dataProtectionKey), loginPassword);
	user.walletPrivateKey = await decryptText(JSON.parse(user.walletPrivateKey), loginPassword);
	console.log('');
	console.log('ArDrive unlocked!!');
	console.log('');
	return user;
}
