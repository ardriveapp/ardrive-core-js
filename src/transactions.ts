import { arweave } from './arweave';
import Transaction from 'arweave/node/lib/transaction';
import { ArFSDriveEntity, ArFSFileData, ArFSFileFolderEntity, JWKInterface } from './types/arfs_Types';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';

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

// Creates a Transaction uploader object for a given arweave transaction
export async function createDataUploader(transaction: Transaction): Promise<TransactionUploader> {
	// Create an uploader object
	const uploader = await arweave.transactions.getUploader(transaction);
	return uploader;
}
