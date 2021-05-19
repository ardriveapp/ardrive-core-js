import * as fs from 'fs';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { weightedRandom } from './common';
import { appName, appVersion, arFSVersion } from './constants';

import { ArFSDriveEntity, ArFSFileData, ArFSFileFolderEntity, Wallet } from './types/arfs_Types';
import { readContract } from 'smartweave';
import Arweave from 'arweave';
import deepHash from 'arweave/node/lib/deepHash';
import ArweaveBundles from 'arweave-bundles';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import Transaction from 'arweave/node/lib/transaction';

// ArDrive Profit Sharing Community Smart Contract
const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';

// Initialize Arweave
const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Initialize the arweave-bundles API used for ANS102 Transactions
const deps = {
	utils: Arweave.utils,
	crypto: Arweave.crypto,
	deepHash: deepHash
};

// Arweave Bundles are used for ANS102 Transactions
const arBundles = ArweaveBundles(deps);

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
		balance = await arweave.ar.winstonToAr(balance);
		return +balance;
	} catch (err) {
		console.log(err);
		return 0;
	}
}

// Gets the price of AR based on amount of data
export async function getWinston(bytes: number): Promise<number> {
	const response = await fetch(`https://arweave.net/price/${bytes}`);
	// const response = await fetch(`https://perma.online/price/${bytes}`);
	const winston = await response.json();
	return winston;
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

// Gets only the data of a given ArDrive Data transaction (U8IntArray)
export async function getTransactionData(txid: string): Promise<string | Uint8Array> {
	try {
		const data = await arweave.transactions.getData(txid, { decode: true });
		return data;
	} catch (err) {
		console.log('Error getting transaction data for Txid %s', txid);
		console.log(err);
		return Promise.reject(err);
	}
}

// Get the latest status of a transaction
export async function getTransactionStatus(txid: string): Promise<number> {
	try {
		const response = await arweave.transactions.getStatus(txid);
		return response.status;
	} catch (err) {
		// console.log(err);
		return 0;
	}
}

// Get the latest block height
export async function getLatestBlockHeight(): Promise<number> {
	try {
		const info = await arweave.network.getInfo();
		return info.height;
	} catch (err) {
		console.log('Failed getting latest block height');
		return 0;
	}
}

// Creates an arweave transaction to upload a drive entity
export async function createDriveTransaction(
	driveJSON: string,
	driveMetaData: ArFSDriveEntity,
	walletPrivateKey?: JWKInterface
): Promise<Transaction> {
	// Create transaction
	let transaction: Transaction;
	if (walletPrivateKey) {
		transaction = await arweave.createTransaction({ data: driveJSON }, walletPrivateKey);
	} else {
		transaction = await arweave.createTransaction({ data: driveJSON }); // Will use ArConnect if no wallet present
	}
	// Tag file with ArFS Tags
	transaction.addTag('App-Name', driveMetaData.appName);
	transaction.addTag('App-Version', driveMetaData.appVersion);
	transaction.addTag('Unix-Time', driveMetaData.unixTime.toString());
	transaction.addTag('Drive-Id', driveMetaData.driveId);
	transaction.addTag('Drive-Privacy', driveMetaData.drivePrivacy);
	transaction.addTag('Content-Type', driveMetaData.contentType);
	transaction.addTag('ArFS', driveMetaData.arFS);
	transaction.addTag('Entity-Type', 'drive');

	// Sign file
	if (walletPrivateKey) {
		await arweave.transactions.sign(transaction, walletPrivateKey);
	} else {
		await arweave.transactions.sign(transaction); // Will use ArConnect if no wallet present
	}
	return transaction;
}

// This will prepare and sign v2 data transaction using ArFS File Data Tags
export async function createFileDataTransaction(
	fileData: Buffer,
	fileMetaData: ArFSFileData,
	walletPrivateKey?: JWKInterface
): Promise<Transaction> {
	let transaction: Transaction;
	// Create the arweave transaction using the file data and private key
	if (walletPrivateKey) {
		transaction = await arweave.createTransaction({ data: fileData }, walletPrivateKey);
	} else {
		transaction = await arweave.createTransaction({ data: fileData }); // Will use ArConnect if no wallet present
	}

	// Tag file with public tags only
	transaction.addTag('App-Name', fileMetaData.appName);
	transaction.addTag('App-Version', fileMetaData.appVersion);
	transaction.addTag('Content-Type', fileMetaData.contentType);

	// Sign the transaction
	if (walletPrivateKey) {
		await arweave.transactions.sign(transaction, walletPrivateKey);
	} else {
		await arweave.transactions.sign(transaction); // Will use ArConnect if no wallet present
	}

	return transaction;
}

// This will prepare and sign a v2 data transaction using ArFS File Metadata Tags
export async function createFileFolderMetaDataTransaction(
	metaData: ArFSFileFolderEntity,
	secondaryFileMetaData: string,
	walletPrivateKey?: JWKInterface
): Promise<Transaction> {
	let transaction: Transaction;
	if (walletPrivateKey) {
		// Create the arweave transaction using the file data and private key
		transaction = await arweave.createTransaction({ data: secondaryFileMetaData }, walletPrivateKey);
	} else {
		transaction = await arweave.createTransaction({ data: secondaryFileMetaData }); // Will use ArConnect if no wallet present
	}

	// Tag file with ArFS Tags
	transaction.addTag('App-Name', metaData.appName);
	transaction.addTag('App-Version', metaData.appVersion);
	transaction.addTag('Unix-Time', metaData.unixTime.toString());
	transaction.addTag('Content-Type', metaData.contentType);
	transaction.addTag('ArFS', metaData.arFS);
	transaction.addTag('Entity-Type', metaData.entityType);
	transaction.addTag('Drive-Id', metaData.driveId);

	// Add file or folder specific tags
	if (metaData.entityType === 'file') {
		transaction.addTag('File-Id', metaData.entityId);
		transaction.addTag('Parent-Folder-Id', metaData.parentFolderId);
	} else {
		transaction.addTag('Folder-Id', metaData.entityId);
		if (metaData.parentFolderId !== '0') {
			// If the parentFolderId is 0, then this is a root folder
			transaction.addTag('Parent-Folder-Id', metaData.parentFolderId);
		}
	}

	// Sign the transaction
	if (walletPrivateKey) {
		await arweave.transactions.sign(transaction, walletPrivateKey);
	} else {
		await arweave.transactions.sign(transaction); // Will use ArConnect if no wallet present
	}

	return transaction;
}

// Creates an arweave data item transaction (ANS-102) using ArFS Tags
export async function createFileDataItemTransaction(
	fileData: Buffer,
	fileMetaData: ArFSFileData,
	walletPrivateKey: JWKInterface
): Promise<DataItemJson | string> {
	try {
		// Create the item using the data buffer
		const item = await arBundles.createData({ data: fileData }, walletPrivateKey);

		// Tag file with common tags
		arBundles.addTag(item, 'App-Name', fileMetaData.appName);
		arBundles.addTag(item, 'App-Version', fileMetaData.appVersion);
		// Only tag the file with public tags
		arBundles.addTag(item, 'Content-Type', fileMetaData.contentType);

		// Sign the data, ready to be added to a bundle
		const signedItem = await arBundles.sign(item, walletPrivateKey);
		return signedItem;
	} catch (err) {
		console.log('Error creating data item');
		console.log(err);
		return 'Error';
	}
}

// Creates an arweave data item transaction (ANS-102) using ArFS Tags
export async function createFileFolderMetaDataItemTransaction(
	metaData: ArFSFileFolderEntity,
	secondaryFileMetaData: string,
	walletPrivateKey: JWKInterface
): Promise<DataItemJson | string> {
	try {
		// Create the item using the data buffer or string
		const item = await arBundles.createData({ data: secondaryFileMetaData }, walletPrivateKey);

		// Tag file
		arBundles.addTag(item, 'App-Name', metaData.appName);
		arBundles.addTag(item, 'App-Version', metaData.appVersion);
		arBundles.addTag(item, 'Unix-Time', metaData.unixTime.toString());
		arBundles.addTag(item, 'Content-Type', 'application/json');
		arBundles.addTag(item, 'ArFS', arFSVersion);
		arBundles.addTag(item, 'Entity-Type', metaData.entityType);
		arBundles.addTag(item, 'Drive-Id', metaData.driveId);
		arBundles.addTag(item, 'File-Id', metaData.entityId);

		// Add file or folder specific tags
		if (metaData.entityType === 'file') {
			arBundles.addTag(item, 'File-Id', metaData.entityId);
			arBundles.addTag(item, 'Parent-Folder-Id', metaData.parentFolderId);
		} else {
			arBundles.addTag(item, 'Folder-Id', metaData.entityId);
			if (metaData.parentFolderId !== '0') {
				// If the parentFolderId is 0, then this is a root folder
				arBundles.addTag(item, 'Parent-Folder-Id', metaData.parentFolderId);
			}
		}

		// Sign the data, ready to be added to a bundle
		const signedItem = await arBundles.sign(item, walletPrivateKey);
		return signedItem;
	} catch (err) {
		console.log('Error creating data item');
		console.log(err);
		return 'Error';
	}
}

// Creates a bundled data transaction (ANS-102)
export async function createBundledDataTransaction(
	walletPrivateKey: JWKInterface,
	items: DataItemJson[]
): Promise<Transaction | null> {
	try {
		// Bundle up all individual items into a single data bundle
		const dataBundle = await arBundles.bundleData(items);
		const dataBuffer: Buffer = Buffer.from(JSON.stringify(dataBundle));

		// Create the transaction for the entire data bundle
		const transaction = await arweave.createTransaction({ data: dataBuffer }, walletPrivateKey);

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Bundle-Format', 'json');
		transaction.addTag('Bundle-Version', '1.0.0');
		transaction.addTag('Content-Type', 'application/json');

		// Sign the bundle
		await arweave.transactions.sign(transaction, walletPrivateKey);
		return transaction;
	} catch (err) {
		console.log('Error creating data bundle');
		console.log(err);
		return null;
	}
}

// Creates a Transaction uploader object for a given arweave transaction
export async function createDataUploader(transaction: Transaction): Promise<TransactionUploader> {
	// Create an uploader object
	const uploader = await arweave.transactions.getUploader(transaction);
	return uploader;
}

// Creates an arweave transaction to upload file data (and no metadata) to arweave
// Saves the upload chunk of the object in case the upload has to be restarted
export async function uploadDataChunk(uploader: TransactionUploader): Promise<TransactionUploader | null> {
	try {
		await uploader.uploadChunk();
		return uploader;
	} catch (err) {
		console.log('Uploading this chunk has failed');
		console.log(err);
		return null;
	}
}

// Sends a fee to ArDrive Profit Sharing Community holders
export async function sendArDriveFee(walletPrivateKey: string, arPrice: number): Promise<string> {
	try {
		// Get the latest ArDrive Community Fee from the Community Smart Contract
		let fee = arPrice * ((await getArDriveFee()) / 100);

		// If the fee is too small, we assign a minimum
		if (fee < 0.00001) {
			fee = 0.00001;
		}

		// Probabilistically select the PST token holder
		const holder = await selectTokenHolder();

		// send a fee. You should inform the user about this fee and amount.
		const transaction = await arweave.createTransaction(
			{ target: holder, quantity: arweave.ar.arToWinston(fee.toString()) },
			JSON.parse(walletPrivateKey)
		);

		// Tag file with data upload Tipping metadata
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Type', 'fee');
		transaction.addTag('Tip-Type', 'data upload');

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));

		// Submit the transaction
		const response = await arweave.transactions.post(transaction);
		if (response.status === 200 || response.status === 202) {
			// console.log('SUCCESS ArDrive fee of %s was submitted with TX %s to %s', fee.toFixed(9), transaction.id, holder);
		} else {
			// console.log('ERROR submitting ArDrive fee with TX %s', transaction.id);
		}
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'ERROR sending ArDrive fee';
	}
}

// Calls the ArDrive Community Smart Contract to pull the fee
export async function getArDriveFee(): Promise<number> {
	try {
		const contract = await readContract(arweave, communityTxId);
		const arDriveCommunityFee = contract.settings.find(
			(setting: (string | number)[]) => setting[0].toString().toLowerCase() === 'fee'
		);
		return arDriveCommunityFee ? arDriveCommunityFee[1] : 15;
	} catch {
		return 0.15; // Default fee of 15% if we cannot pull it from the community contract
	}
}

// Gets a random ArDrive token holder based off their weight (amount of tokens they hold)
export async function selectTokenHolder(): Promise<string | undefined> {
	// Read the ArDrive Smart Contract to get the latest state
	const state = await readContract(arweave, communityTxId);
	const balances = state.balances;
	const vault = state.vault;

	// Get the total number of token holders
	let total = 0;
	for (const addr of Object.keys(balances)) {
		total += balances[addr];
	}

	// Check for how many tokens the user has staked/vaulted
	for (const addr of Object.keys(vault)) {
		if (!vault[addr].length) continue;

		const vaultBalance = vault[addr]
			.map((a: { balance: number; start: number; end: number }) => a.balance)
			.reduce((a: number, b: number) => a + b, 0);

		total += vaultBalance;

		if (addr in balances) {
			balances[addr] += vaultBalance;
		} else {
			balances[addr] = vaultBalance;
		}
	}

	// Create a weighted list of token holders
	const weighted: { [addr: string]: number } = {};
	for (const addr of Object.keys(balances)) {
		weighted[addr] = balances[addr] / total;
	}
	// Get a random holder based off of the weighted list of holders
	const randomHolder = weightedRandom(weighted);
	return randomHolder;
}
