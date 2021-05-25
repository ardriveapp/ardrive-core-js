// arfs.js
import * as arweave from './arweave';
import * as fs from 'fs';
import * as clientTypes from '../types/client_Types';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import { JWKInterface } from './../types/arfs_Types';
import { ArDriveUser, ArFSDriveMetaData, ArFSEncryptedData, ArFSFileMetaData } from './../types/base_Types';
import * as updateDb from './../db/db_update';
import { deriveDriveKey, deriveFileKey, driveEncrypt, fileEncrypt, getFileAndEncrypt } from '../crypto';
import { getWinston } from '../node';
import { createFileDataItemTransaction, createFileFolderMetaDataItemTransaction } from '../bundles';
import { createDataUploader, createFileDataTransaction, createFileFolderMetaDataTransaction } from './../transactions';
// Tags and creates a new data item (ANS-102) to be bundled and uploaded
export async function newArFSFileDataItem(
	walletPrivateKey: JWKInterface,
	file: clientTypes.ArFSLocalFile,
	fileData: Buffer
): Promise<{ file: clientTypes.ArFSLocalFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | string;
	try {
		console.log('Bundling %s (%d bytes) to the Permaweb', file.path, file.size);
		dataItem = await createFileDataItemTransaction(fileData, file.data, walletPrivateKey);

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
		dataItem = await createFileFolderMetaDataItemTransaction(
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
		dataItem = await createFileFolderMetaDataItemTransaction(
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
		const transaction = await createFileDataTransaction(fileData, file.entity, walletPrivateKey);

		// Update the file's data transaction ID
		file.data.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

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
		(transaction = await createFileFolderMetaDataTransaction(file.entity, secondaryFileMetaDataJSON)),
			walletPrivateKey;

		// Update the file's data transaction ID
		file.data.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
export async function createArFSFileDataItem(
	user: ArDriveUser,
	fileToUpload: ArFSFileMetaData
): Promise<DataItemJson | null> {
	let dataItem: DataItemJson | null;
	try {
		if (fileToUpload.isPublic === 0) {
			// Private file, so it must be encrypted
			console.log(
				'Encrypting and bundling %s (%d bytes) to the Permaweb',
				fileToUpload.filePath,
				fileToUpload.fileSize
			);

			// Derive the keys needed for encryption
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToUpload.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileToUpload.fileId, driveKey);

			// Get the encrypted version of the file
			const encryptedData: ArFSEncryptedData = await getFileAndEncrypt(fileKey, fileToUpload.filePath);

			// Set the private file metadata
			fileToUpload.dataCipherIV;
			fileToUpload.cipher;

			// Get a signed data item for the encrypted data
			dataItem = await arweave.prepareArFSDataItemTransaction(user, encryptedData.data, fileToUpload);
		} else {
			console.log('Bundling %s (%d bytes) to the Permaweb', fileToUpload.filePath, fileToUpload.fileSize);
			const fileData = fs.readFileSync(fileToUpload.filePath);
			dataItem = await arweave.prepareArFSDataItemTransaction(user, fileData, fileToUpload);
		}
		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', fileToUpload.filePath, dataItem.id);

			// Set the file metadata to syncing
			fileToUpload.fileDataSyncStatus = 2;
			fileToUpload.dataTxId = dataItem.id;

			// Update the queue since the file is now being uploaded
			await updateDb.updateFileDataSyncStatus(
				fileToUpload.fileDataSyncStatus,
				fileToUpload.dataTxId,
				fileToUpload.dataCipherIV,
				fileToUpload.cipher,
				fileToUpload.id
			);

			// Update the uploadTime of the file so we can track the status
			const currentTime = Math.round(Date.now() / 1000);
			await updateDb.updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime);
		}
		return dataItem;
	} catch (err) {
		console.log(err);
		console.log('Error bundling file data item');
		return null;
	}
}

// Tags and creates a single file metadata item (ANS-102) to your ArDrive
export async function createArFSFileMetaDataItem(
	user: ArDriveUser,
	fileToUpload: ArFSFileMetaData
): Promise<DataItemJson | null> {
	let dataItem: DataItemJson | null;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (fileToUpload.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: fileToUpload.fileName
			};
		} else if (fileToUpload.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: fileToUpload.fileName,
				size: fileToUpload.fileSize,
				lastModifiedDate: fileToUpload.lastModifiedDate,
				dataTxId: fileToUpload.dataTxId,
				dataContentType: fileToUpload.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (fileToUpload.isPublic === 1) {
			// Public file, do not s
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileToUpload, secondaryFileMetaDataJSON);
		} else {
			// Private file, so it must be encrypted
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToUpload.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileToUpload.fileId, driveKey);
			const encryptedData: ArFSEncryptedData = await fileEncrypt(fileKey, Buffer.from(secondaryFileMetaDataJSON));

			// Update the file privacy metadata
			fileToUpload.metaDataCipherIV = encryptedData.cipherIV;
			fileToUpload.cipher = encryptedData.cipher;
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileToUpload, encryptedData.data);
		}
		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', fileToUpload.filePath, dataItem.id);
			// Set the file metadata to syncing
			fileToUpload.fileMetaDataSyncStatus = 2;
			fileToUpload.metaDataTxId = dataItem.id;
			await updateDb.updateFileMetaDataSyncStatus(
				fileToUpload.fileMetaDataSyncStatus,
				fileToUpload.metaDataTxId,
				fileToUpload.metaDataCipherIV,
				fileToUpload.cipher,
				fileToUpload.id
			);
			// Update the uploadTime of the file so we can track the status
			const currentTime = Math.round(Date.now() / 1000);
			await updateDb.updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime);
		}
		return dataItem;
	} catch (err) {
		console.log(err);
		console.log('Error uploading file metadata item');
		return null;
	}
}

// Tags and Uploads a single file from the local disk to your ArDrive using Arweave V2 Transactions
export async function uploadArFSFileData(
	user: ArDriveUser,
	fileToUpload: ArFSFileMetaData
): Promise<{ dataTxId: string; arPrice: number }> {
	let transaction;
	let dataTxId = '';
	let arPrice = 0;
	try {
		const winston = await getWinston(fileToUpload.fileSize);
		arPrice = +winston * 0.000000000001;

		if (fileToUpload.isPublic === 0) {
			// The file is private and we must encrypt
			console.log(
				'Encrypting and uploading the PRIVATE file %s (%d bytes) at %s to the Permaweb',
				fileToUpload.filePath,
				fileToUpload.fileSize,
				arPrice
			);
			// Derive the drive and file keys in order to encrypt it with ArFS encryption
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToUpload.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileToUpload.fileId, driveKey);

			// Encrypt the data with the file key
			const encryptedData: ArFSEncryptedData = await getFileAndEncrypt(fileKey, fileToUpload.filePath);

			// Update the file metadata
			fileToUpload.dataCipherIV = encryptedData.cipherIV;
			fileToUpload.cipher = encryptedData.cipher;

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.prepareArFSDataTransaction(user, encryptedData.data, fileToUpload);
		} else {
			// The file is public
			console.log(
				'Uploading the PUBLIC file %s (%d bytes) at %s to the Permaweb',
				fileToUpload.filePath,
				fileToUpload.fileSize,
				arPrice
			);
			// Get the file data to upload
			const fileData = fs.readFileSync(fileToUpload.filePath);

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.prepareArFSDataTransaction(user, fileData, fileToUpload);
		}

		// Update the file's data transaction ID
		fileToUpload.dataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		// Set the file metadata to indicate it s being synchronized and update its record in the database
		fileToUpload.fileDataSyncStatus = 2;
		await updateDb.updateFileDataSyncStatus(
			fileToUpload.fileDataSyncStatus,
			fileToUpload.dataTxId,
			fileToUpload.dataCipherIV,
			fileToUpload.cipher,
			fileToUpload.id
		);

		// Begin to upload chunks and upload the database as needed
		while (!uploader.isComplete) {
			const nextChunk = await arweave.uploadDataChunk(uploader);
			if (nextChunk === null) {
				break;
			} else {
				console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
				await updateDb.setFileUploaderObject(JSON.stringify(uploader), fileToUpload.id);
			}
		}

		// If the uploaded is completed successfully, update the uploadTime of the file so we can track the status
		if (uploader.isComplete) {
			const currentTime = Math.round(Date.now() / 1000);
			await updateDb.updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime);

			// Send the ArDrive Profit Sharing Community Fee
			await arweave.sendArDriveFee(user.walletPrivateKey, arPrice);
		}
		dataTxId = fileToUpload.dataTxId;
		return { dataTxId, arPrice };
	} catch (err) {
		console.log(err);
		return { dataTxId, arPrice };
	}
}

// Tags and Uploads a single file/folder metadata to your ArDrive using Arweave V2 Transactions
export async function uploadArFSFileMetaData(user: ArDriveUser, fileToUpload: ArFSFileMetaData) {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (fileToUpload.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: fileToUpload.fileName
			};
		} else if (fileToUpload.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: fileToUpload.fileName,
				size: fileToUpload.fileSize,
				lastModifiedDate: fileToUpload.lastModifiedDate,
				dataTxId: fileToUpload.dataTxId,
				dataContentType: fileToUpload.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (fileToUpload.isPublic === 1) {
			// Public file, do not encrypt
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileToUpload, secondaryFileMetaDataJSON);
		} else {
			// Private file, so the metadata must be encrypted
			// Get the drive and file key needed for encryption
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToUpload.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileToUpload.fileId, driveKey);
			const encryptedData: ArFSEncryptedData = await fileEncrypt(fileKey, Buffer.from(secondaryFileMetaDataJSON));

			// Update the file privacy metadata
			fileToUpload.metaDataCipherIV = encryptedData.cipherIV;
			fileToUpload.cipher = encryptedData.cipher;
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileToUpload, encryptedData.data);
		}

		// Update the file's data transaction ID
		fileToUpload.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		// Set the file metadata to indicate it s being synchronized and update its record in the database
		fileToUpload.fileMetaDataSyncStatus = 2;
		await updateDb.updateFileMetaDataSyncStatus(
			fileToUpload.fileMetaDataSyncStatus,
			fileToUpload.metaDataTxId,
			fileToUpload.metaDataCipherIV,
			fileToUpload.cipher,
			fileToUpload.id
		);

		// Begin to upload chunks
		while (!uploader.isComplete) {
			await uploader.uploadChunk();
			console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
		}

		// If the uploaded is completed successfully, update the uploadTime of the file so we can track the status
		if (uploader.isComplete) {
			console.log(
				'SUCCESS %s metadata was submitted with TX %s',
				fileToUpload.filePath,
				fileToUpload.metaDataTxId
			);
			const currentTime = Math.round(Date.now() / 1000);
			await updateDb.updateFileUploadTimeInSyncTable(fileToUpload.id, currentTime);
		}

		return 'Success';
	} catch (err) {
		console.log(err);
		return 'Error uploading file metadata';
	}
}

// Tags and uploads a drive entity using Arweave V2 Transaction
export async function uploadArFSDriveMetaData(user: ArDriveUser, drive: ArFSDriveMetaData): Promise<boolean> {
	try {
		let transaction;
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: drive.driveName,
			rootFolderId: drive.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// Check if the drive is public or private
		if (drive.drivePrivacy === 'private') {
			console.log('Creating a new Private Drive (name: %s) on the Permaweb', drive.driveName);
			const driveKey: Buffer = await deriveDriveKey(user.dataProtectionKey, drive.driveId, user.walletPrivateKey);
			const encryptedDriveMetaData: ArFSEncryptedData = await driveEncrypt(
				driveKey,
				Buffer.from(driveMetaDataJSON)
			);
			drive.cipher = encryptedDriveMetaData.cipher;
			drive.cipherIV = encryptedDriveMetaData.cipherIV;
			transaction = await arweave.prepareArFSDriveTransaction(user, encryptedDriveMetaData.data, drive);
		} else {
			// The drive is public
			console.log('Creating a new Public Drive (name: %s) on the Permaweb', drive.driveName);
			transaction = await arweave.prepareArFSDriveTransaction(user, driveMetaDataJSON, drive);
		}
		// Update the file's data transaction ID
		drive.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		// Update the Drive table to include this transaction information
		drive.metaDataSyncStatus = 2;

		await updateDb.updateDriveInDriveTable(
			drive.metaDataSyncStatus,
			drive.metaDataTxId,
			drive.cipher,
			drive.cipherIV,
			drive.driveId
		);

		// Begin to upload chunks
		while (!uploader.isComplete) {
			await uploader.uploadChunk();
			console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
		}

		if (uploader.isComplete) {
			console.log('SUCCESS Drive Name %s was submitted with TX %s', drive.driveName, drive.metaDataTxId);
		}
		return true;
	} catch (err) {
		console.log(err);
		console.log('Error uploading new Drive metadata %s', drive.driveName);
		return false;
	}
}

// Tags and uploads an ANS 102 Data Bundle
export async function uploadArFSDataBundle(user: ArDriveUser, dataItems: DataItemJson[]): Promise<string> {
	try {
		const bundledDataTx = await arweave.prepareArFSBundledDataTransaction(user, dataItems);
		if (bundledDataTx !== null) {
			const uploader = await createDataUploader(bundledDataTx);

			// Get current time and update the database
			const currentTime = Math.round(Date.now() / 1000);
			await updateDb.addToBundleTable(user.login, bundledDataTx.id, 2, currentTime);

			// Begin to upload chunks and upload the database as needed
			while (!uploader.isComplete) {
				await uploader.uploadChunk();
				await updateDb.setBundleUploaderObject(JSON.stringify(uploader), bundledDataTx.id);
				console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
			}
			if (uploader.isComplete) {
				console.log('SUCCESS data bundle was submitted with TX %s', bundledDataTx.id);
				return bundledDataTx.id;
			}
		}
		return 'Error';
	} catch (err) {
		console.log(err);
		console.log('Error uploading data bundle');
		return 'Error';
	}
}
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
		(transaction = await createFileFolderMetaDataTransaction(folder.entity, secondaryFileMetaDataJSON)),
			walletPrivateKey;

		// Update the file's data transaction ID
		folder.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		return { folder, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}
