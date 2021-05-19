import { JWKInterface } from 'arweave/node/lib/wallet';
import { arFSVersion } from './constants';
import { ArFSPrivateDriveEntity, ArFSPrivateFileData, ArFSPrivateFileFolderEntity } from './types/arfs_Types';
import Arweave from 'arweave';
import deepHash from 'arweave/node/lib/deepHash';
import ArweaveBundles from 'arweave-bundles';
import { DataItemJson } from 'arweave-bundles';
import Transaction from 'arweave/node/lib/transaction';

// ArDrive Profit Sharing Community Smart Contract

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

// Creates an arweave transaction to upload a drive entity
export async function createPrivateDriveTransaction(
	driveJSON: Buffer, // must be an encrypted buffer
	driveMetaData: ArFSPrivateDriveEntity,
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
	// Tag file with Content-Type, Cipher and Cipher-IV and Drive-Auth-Mode
	transaction.addTag('Cipher', driveMetaData.cipher);
	transaction.addTag('Cipher-IV', driveMetaData.cipherIV);
	transaction.addTag('Drive-Auth-Mode', driveMetaData.driveAuthMode);
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

// This will prepare and sign a private v2 data transaction using ArFS File Data Tags including privacy tags
export async function createPrivateFileDataTransaction(
	fileData: Buffer, // the buffer must already be encrypted
	fileMetaData: ArFSPrivateFileData,
	walletPrivateKey?: JWKInterface
): Promise<Transaction> {
	let transaction: Transaction;
	// Create the arweave transaction using the file data and private key
	if (walletPrivateKey) {
		transaction = await arweave.createTransaction({ data: fileData }, walletPrivateKey);
	} else {
		transaction = await arweave.createTransaction({ data: fileData }); // Will use ArConnect if no wallet present
	}

	// Tag file with Content-Type, Cipher and Cipher-IV
	transaction.addTag('App-Name', fileMetaData.appName);
	transaction.addTag('App-Version', fileMetaData.appVersion);
	transaction.addTag('Content-Type', 'application/octet-stream');
	transaction.addTag('Cipher', fileMetaData.cipher);
	transaction.addTag('Cipher-IV', fileMetaData.cipherIV);

	// Sign the transaction
	if (walletPrivateKey) {
		await arweave.transactions.sign(transaction, walletPrivateKey);
	} else {
		await arweave.transactions.sign(transaction); // Will use ArConnect if no wallet present
	}

	return transaction;
}

// This will prepare and sign a private v2 data transaction using ArFS File Metadata Tags including privacy tags
export async function createPrivateFileFolderMetaDataTransaction(
	metaData: ArFSPrivateFileFolderEntity,
	secondaryFileMetaData: Buffer, // the buffer must already be encrypted
	walletPrivateKey?: JWKInterface
): Promise<Transaction> {
	let transaction: Transaction;
	if (walletPrivateKey) {
		// Create the arweave transaction using the file data and private key
		transaction = await arweave.createTransaction({ data: secondaryFileMetaData }, walletPrivateKey);
	} else {
		transaction = await arweave.createTransaction({ data: secondaryFileMetaData }); // Will use ArConnect if no wallet present
	}

	// Tag file with ArFS Tags including tags needed for privacy
	transaction.addTag('App-Name', metaData.appName);
	transaction.addTag('App-Version', metaData.appVersion);
	transaction.addTag('Unix-Time', metaData.unixTime.toString());
	transaction.addTag('Content-Type', 'application/octet-stream');
	transaction.addTag('Cipher', metaData.cipher);
	transaction.addTag('Cipher-IV', metaData.cipherIV);
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

// Creates a private arweave data item transaction (ANS-102) using ArFS Tags including privacy tags
export async function createPrivateFileDataItemTransaction(
	fileData: Buffer, // the buffer must already be encrypted
	fileMetaData: ArFSPrivateFileData,
	walletPrivateKey: JWKInterface
): Promise<DataItemJson | string> {
	try {
		// Create the item using the data buffer
		const item = await arBundles.createData({ data: fileData }, walletPrivateKey);

		// Tag file with common tags
		arBundles.addTag(item, 'App-Name', fileMetaData.appName);
		arBundles.addTag(item, 'App-Version', fileMetaData.appVersion);

		// Tag file with Privacy tags, Content-Type, Cipher and Cipher-IV
		arBundles.addTag(item, 'Content-Type', 'application/octet-stream');
		arBundles.addTag(item, 'Cipher', fileMetaData.cipher);
		arBundles.addTag(item, 'Cipher-IV', fileMetaData.cipherIV);

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
export async function createPrivateFileFolderMetaDataItemTransaction(
	metaData: ArFSPrivateFileFolderEntity,
	secondaryFileMetaData: Buffer, // the buffer must already be encrypted
	walletPrivateKey: JWKInterface
): Promise<DataItemJson | string> {
	try {
		// Create the item using the data buffer or string
		const item = await arBundles.createData({ data: secondaryFileMetaData }, walletPrivateKey);

		// Tag file
		arBundles.addTag(item, 'App-Name', metaData.appName);
		arBundles.addTag(item, 'App-Version', metaData.appVersion);
		arBundles.addTag(item, 'Unix-Time', metaData.unixTime.toString());
		// If the file is private, we use extra tags
		// Tag file with Content-Type, Cipher and Cipher-IV
		arBundles.addTag(item, 'Content-Type', 'application/octet-stream');
		arBundles.addTag(item, 'Cipher', metaData.cipher);
		arBundles.addTag(item, 'Cipher-IV', metaData.cipherIV);
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
