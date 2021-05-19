// arfs.js
import * as arweave from './arweave';
import * as arweavePrivate from './arweave_private';
import * as types from './types/base_Types';
import * as clientTypes from './types/client_Types';
import { fileEncrypt, deriveDriveKey, deriveFileKey, getFileAndEncrypt } from './crypto';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import { JWKInterface } from './types/arfs_Types';

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
export async function newArFSPrivateFileDataItem(
	user: types.ArDriveUser,
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalPrivateFile,
	fileData: Buffer
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | string;
	try {
		// Private file, so it must be encrypted
		console.log('Encrypting and bundling %s (%d bytes) to the Permaweb', file.path, file.size);

		// Derive the keys needed for encryption
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);

		// Get the encrypted version of the file
		const encryptedData: types.ArFSEncryptedData = await fileEncrypt(fileKey, fileData);

		// Set the private file metadata
		file.entity.cipherIV;
		file.entity.cipher;

		// Get a signed data item for the encrypted data
		dataItem = await arweave.createFileDataItemTransaction(encryptedData.data, file.entity, walletPrivateKey);

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
		console.log('Error bundling file data item');
		return null;
	}
}
// Tags and creates a single file metadata item (ANS-102) to your ArDrive
export async function newArFSPrivateFileMetaDataItem(
	user: types.ArDriveUser,
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalPrivateFile
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | string;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (file.entity.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: file.entity.name
			};
		} else if (file.entity.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: file.entity.name,
				size: file.size,
				lastModifiedDate: file.entity.unixTime,
				dataTxId: file.data.txId,
				dataContentType: file.entity.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);

		// Private file, so it must be encrypted
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);
		const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
			fileKey,
			Buffer.from(secondaryFileMetaDataJSON)
		);

		// Update the file privacy metadata
		file.entity.cipherIV = encryptedData.cipherIV;
		file.entity.cipher = encryptedData.cipher;
		dataItem = await arweavePrivate.createPrivateFileFolderMetaDataItemTransaction(
			file.entity,
			encryptedData.data,
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
// Takes a buffer and ArFS File Metadata and creates an ArFS Data Transaction using V2 Transaction with proper GQL tags
export async function newArFSPrivateFileData(
	user: types.ArDriveUser,
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalPrivateFile
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; uploader: TransactionUploader } | null> {
	try {
		// The file is private and we must encrypt
		console.log(
			'Encrypting and uploading the PRIVATE file %s (%d bytes) at %s to the Permaweb',
			file.path,
			file.size
		);
		// Derive the drive and file keys in order to encrypt it with ArFS encryption
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);

		// Encrypt the data with the file key
		const encryptedData: types.ArFSEncryptedData = await getFileAndEncrypt(fileKey, file.path);

		// Update the file metadata
		file.entity.cipherIV = encryptedData.cipherIV;
		file.entity.cipher = encryptedData.cipher;

		// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
		const transaction = await arweavePrivate.createPrivateFileDataTransaction(
			encryptedData.data,
			file.entity,
			walletPrivateKey
		);

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
// Takes ArFS File (or folder) Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function newArFSPrivateFileMetaData(
	user: types.ArDriveUser,
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalPrivateFile
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (file.entity.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: file.entity.name
			};
		} else if (file.entity.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: file.entity.name,
				size: file.size,
				lastModifiedDate: file.entity.unixTime,
				dataTxId: file.data.txId,
				dataContentType: file.entity.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);

		// Private file, so the metadata must be encrypted
		// Get the drive and file key needed for encryption
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);
		const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
			fileKey,
			Buffer.from(secondaryFileMetaDataJSON)
		);

		// Update the file privacy metadata
		file.entity.cipherIV = encryptedData.cipherIV;
		file.entity.cipher = encryptedData.cipher;
		transaction = await arweavePrivate.createPrivateFileFolderMetaDataTransaction(
			file.entity,
			encryptedData.data,
			walletPrivateKey
		);

		// Update the file's data transaction ID
		file.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}
