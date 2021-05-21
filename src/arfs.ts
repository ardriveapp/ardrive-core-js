// arfs.js
import * as arweave from './arweave';
import * as clientTypes from './types/client_Types';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import { JWKInterface } from './types/arfs_Types';

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
export async function newArFSFileDataItem(
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalFile,
	fileData: Buffer
): Promise<{ file: clientTypes.ArFSLocalFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | string;
	try {
		console.log('Bundling %s (%d bytes) to the Permaweb', file.path, file.size);
		dataItem = await arweave.createFileDataItemTransaction(fileData, file.data, walletPrivateKey);

		if (typeof dataItem != 'string') {
			console.log('SUCCESS %s data item was created with TX %s', file.path, dataItem.id);

			// Set the file metadata to syncing
			file.data.syncStatus = 2;
			file.data.txId = dataItem.id;
			return { file, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error bundling file data item');
		return null;
	}
}

// Tags and creates a single file metadata item (ANS-102) to your ArDrive
export async function newArFSFileMetaDataItem(
	file: clientTypes.ArFSLocalFile,
	walletPrivateKey: JWKInterface
): Promise<{ file: clientTypes.ArFSLocalFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | string;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		secondaryFileMetaDataTags = {
			name: file.entity.name,
			size: file.size,
			lastModifiedDate: file.entity.lastModifiedDate,
			dataTxId: file.data.txId,
			dataContentType: file.data.contentType
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		// Public file, do not encrypt
		dataItem = await arweave.createFileFolderMetaDataItemTransaction(
			file.entity,
			secondaryFileMetaDataJSON,
			walletPrivateKey
		);

		if (typeof dataItem != 'string') {
			console.log('SUCCESS %s data item was created with TX %s', file.path, dataItem.id);
			// Set the file metadata to syncing
			file.entity.syncStatus = 2;
			file.entity.txId = dataItem.id;
			return { file, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error uploading file metadata item');
		return null;
	}
}

// Tags and creates a single folder metadata item (ANS-102) to your ArDrive
export async function newArFSFolderMetaDataItem(
	folder: clientTypes.ArFSLocalFolder,
	walletPrivateKey: JWKInterface
): Promise<{ folder: clientTypes.ArFSLocalFolder; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | string;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata specifically for a folder
		secondaryFileMetaDataTags = {
			name: folder.entity.name
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		// Public file, do not encrypt
		dataItem = await arweave.createFileFolderMetaDataItemTransaction(
			folder.entity,
			secondaryFileMetaDataJSON,
			walletPrivateKey
		);

		if (typeof dataItem != 'string') {
			console.log('SUCCESS %s data item was created with TX %s', folder.path, dataItem.id);
			// Set the file metadata to syncing
			folder.entity.syncStatus = 2;
			folder.entity.txId = dataItem.id;
			return { folder, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error uploading file metadata item');
		return null;
	}
}

// Takes a buffer and ArFS File Metadata and creates an ArFS Data Transaction using V2 Transaction with proper GQL tags
export async function newArFSFileData(
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalFile,
	fileData: Buffer
): Promise<{ file: clientTypes.ArFSLocalFile; uploader: TransactionUploader } | null> {
	try {
		// The file is public
		console.log('Uploading the PUBLIC file %s (%d bytes) at %s to the Permaweb', file.path, file.size);

		// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
		const transaction = await arweave.createFileDataTransaction(fileData, file.entity, walletPrivateKey);

		// Update the file's data transaction ID
		file.data.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Takes ArFS File Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function newArFSFileMetaData(
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalFile
): Promise<{ file: clientTypes.ArFSLocalFile; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		secondaryFileMetaDataTags = {
			name: file.entity.name,
			size: file.size,
			lastModifiedDate: file.entity.lastModifiedDate,
			dataTxId: file.data.txId,
			dataContentType: file.data.contentType
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		// Public file, do not encrypt
		(transaction = await arweave.createFileFolderMetaDataTransaction(file.entity, secondaryFileMetaDataJSON)),
			walletPrivateKey;

		// Update the file's data transaction ID
		file.data.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Takes ArFS Folder Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function newArFSFolderMetaData(
	walletPrivateKey: JWKInterface,
	folder: clientTypes.ArFSLocalFolder
): Promise<{ folder: clientTypes.ArFSLocalFolder; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata specifically for a folder
		secondaryFileMetaDataTags = {
			name: folder.entity.name
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		// Public file, do not encrypt
		(transaction = await arweave.createFileFolderMetaDataTransaction(folder.entity, secondaryFileMetaDataJSON)),
			walletPrivateKey;

		// Update the file's data transaction ID
		folder.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { folder, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}
