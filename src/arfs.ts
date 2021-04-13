// arfs.js
import * as arweave from './arweave';
import * as fs from 'fs';
import * as types from './types';
import { fileEncrypt, deriveDriveKey, deriveFileKey, getFileAndEncrypt, driveEncrypt } from './crypto';
import { v4 as uuidv4 } from 'uuid';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import Transaction from 'arweave/node/lib/transaction';

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';

export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';
export const arFSVersion = '0.11';
export const cipher = 'AES256-GCM';

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
export async function newArFSFileDataItem(
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData,
	fileData: Buffer
): Promise<{ fileMetaData: types.ArFSFileMetaData; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	try {
		if (fileMetaData.isPublic === 0) {
			// Private file, so it must be encrypted
			console.log(
				'Encrypting and bundling %s (%d bytes) to the Permaweb',
				fileMetaData.filePath,
				fileMetaData.fileSize
			);

			// Derive the keys needed for encryption
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileMetaData.fileId, driveKey);

			// Get the encrypted version of the file
			const encryptedData: types.ArFSEncryptedData = await fileEncrypt(fileKey, fileData);

			// Set the private file metadata
			fileMetaData.dataCipherIV;
			fileMetaData.cipher;

			// Get a signed data item for the encrypted data
			dataItem = await arweave.prepareArFSDataItemTransaction(user, encryptedData.data, fileMetaData);
		} else {
			console.log('Bundling %s (%d bytes) to the Permaweb', fileMetaData.filePath, fileMetaData.fileSize);
			const fileData = fs.readFileSync(fileMetaData.filePath);
			dataItem = await arweave.prepareArFSDataItemTransaction(user, fileData, fileMetaData);
		}
		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', fileMetaData.filePath, dataItem.id);

			// Set the file metadata to syncing
			fileMetaData.fileDataSyncStatus = 2;
			fileMetaData.dataTxId = dataItem.id;
			return { fileMetaData, dataItem };
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
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData
): Promise<{ fileMetaData: types.ArFSFileMetaData; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (fileMetaData.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName
			};
		} else if (fileMetaData.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName,
				size: fileMetaData.fileSize,
				lastModifiedDate: fileMetaData.lastModifiedDate,
				dataTxId: fileMetaData.dataTxId,
				dataContentType: fileMetaData.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (fileMetaData.isPublic === 1) {
			// Public file, do not encrypt
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileMetaData, secondaryFileMetaDataJSON);
		} else {
			// Private file, so it must be encrypted
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileMetaData.fileId, driveKey);
			const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileMetaData.metaDataCipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileMetaData, encryptedData.data);
		}
		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', fileMetaData.filePath, dataItem.id);
			// Set the file metadata to syncing
			fileMetaData.fileMetaDataSyncStatus = 2;
			fileMetaData.metaDataTxId = dataItem.id;
			return { fileMetaData, dataItem };
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
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData,
	fileData: Buffer
): Promise<{ fileMetaData: types.ArFSFileMetaData; uploader: TransactionUploader } | null> {
	let transaction;
	try {
		if (fileMetaData.isPublic === 0) {
			// The file is private and we must encrypt
			console.log(
				'Encrypting and uploading the PRIVATE file %s (%d bytes) at %s to the Permaweb',
				fileMetaData.filePath,
				fileMetaData.fileSize,
				arPrice
			);
			// Derive the drive and file keys in order to encrypt it with ArFS encryption
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileMetaData.fileId, driveKey);

			// Encrypt the data with the file key
			const encryptedData: types.ArFSEncryptedData = await getFileAndEncrypt(fileKey, fileMetaData.filePath);

			// Update the file metadata
			fileMetaData.dataCipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.prepareArFSDataTransaction(user, encryptedData.data, fileMetaData);
		} else {
			// The file is public
			console.log(
				'Uploading the PUBLIC file %s (%d bytes) at %s to the Permaweb',
				fileMetaData.filePath,
				fileMetaData.fileSize,
				arPrice
			);

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.prepareArFSDataTransaction(user, fileData, fileMetaData);
		}

		// Update the file's data transaction ID
		fileMetaData.dataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { fileMetaData, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Takes ArFS File (or folder) Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function newArFSFileMetaData(
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData
): Promise<{ fileMetaData: types.ArFSFileMetaData; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (fileMetaData.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName
			};
		} else if (fileMetaData.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName,
				size: fileMetaData.fileSize,
				lastModifiedDate: fileMetaData.lastModifiedDate,
				dataTxId: fileMetaData.dataTxId,
				dataContentType: fileMetaData.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (fileMetaData.isPublic === 1) {
			// Public file, do not encrypt
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileMetaData, secondaryFileMetaDataJSON);
		} else {
			// Private file, so the metadata must be encrypted
			// Get the drive and file key needed for encryption
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileMetaData.fileId, driveKey);
			const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileMetaData.metaDataCipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileMetaData, encryptedData.data);
		}

		// Update the file's data transaction ID
		fileMetaData.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { fileMetaData, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Creates an new Drive transaction and uploader using ArFS Metadata
export async function newArFSDriveMetaData(
	user: types.ArDriveUser,
	driveMetaData: types.ArFSDriveMetaData
): Promise<{ driveMetaData: types.ArFSDriveMetaData; uploader: TransactionUploader } | null> {
	try {
		let transaction: Transaction;
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: drive.driveName,
			rootFolderId: drive.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// Check if the drive is public or private
		if (driveMetaData.drivePrivacy === 'private') {
			console.log('Creating a new Private Drive (name: %s) on the Permaweb', driveMetaData.driveName);
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				driveMetaData.driveId,
				user.walletPrivateKey
			);
			const encryptedDriveMetaData: types.ArFSEncryptedData = await driveEncrypt(
				driveKey,
				Buffer.from(driveMetaDataJSON)
			);
			driveMetaData.cipher = encryptedDriveMetaData.cipher;
			driveMetaData.cipherIV = encryptedDriveMetaData.cipherIV;
			transaction = await arweave.prepareArFSDriveTransaction(user, encryptedDriveMetaData.data, driveMetaData);
		} else {
			// The drive is public
			console.log('Creating a new Public Drive (name: %s) on the Permaweb', driveMetaData.driveName);
			transaction = await arweave.prepareArFSDriveTransaction(user, driveMetaDataJSON, driveMetaData);
		}
		// Update the file's data transaction ID
		driveMetaData.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.driveName);
		return null;
	}
}

// Creates a new drive depending on the privacy
// This should be in the Drive class
export async function newArFSDrive(
	login: string,
	driveName: string,
	drivePrivacy: string
): Promise<types.ArFSDriveMetaData> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	if (drivePrivacy === 'private') {
		console.log('Creating a new private drive %s | %s', driveName, driveId);
		const drive: types.ArFSDriveMetaData = {
			id: 0,
			login,
			appName: appName,
			appVersion: appVersion,
			driveName,
			rootFolderId,
			cipher: cipher,
			cipherIV: '',
			unixTime,
			arFS: arFSVersion,
			driveId,
			driveSharing: 'personal',
			drivePrivacy: 'private',
			driveAuthMode: 'password',
			metaDataTxId: '0',
			metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
			isLocal: 1
		};
		return drive;
	} else {
		// Drive is public
		console.log('Creating a new public drive %s | %s', driveName, driveId);
		const drive: types.ArFSDriveMetaData = {
			id: 0,
			login,
			appName: appName,
			appVersion: appVersion,
			driveName,
			rootFolderId,
			cipher: '',
			cipherIV: '',
			unixTime,
			arFS: arFSVersion,
			driveId,
			driveSharing: 'personal',
			drivePrivacy: 'public',
			driveAuthMode: '',
			metaDataTxId: '0',
			metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
			isLocal: 1
		};
		return drive;
	}
}

// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
export async function createArFSPrivateFileSharingLink(
	user: types.ArDriveUser,
	fileToShare: types.ArFSFileMetaData
): Promise<string> {
	let fileSharingUrl = '';
	try {
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			fileToShare.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(fileToShare.fileId, driveKey);
		fileSharingUrl = stagingAppUrl.concat(
			'/#/file/',
			fileToShare.fileId,
			'/view?fileKey=',
			fileKey.toString('base64')
		);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Private File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
}

// Creates a Public file sharing link using the File Id.
export async function createArFSPublicFileSharingLink(fileToShare: types.ArFSFileMetaData): Promise<string> {
	let fileSharingUrl = '';
	try {
		fileSharingUrl = stagingAppUrl.concat('/#/file/', fileToShare.fileId, '/view');
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
}

// Creates a Public drive sharing link using the Drive Id
export async function createArFSPublicDriveSharingLink(driveToShare: types.ArFSDriveMetaData): Promise<string> {
	let driveSharingUrl = '';
	try {
		driveSharingUrl = stagingAppUrl.concat('/#/drives/', driveToShare.driveId);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public Drive Sharing Link');
		driveSharingUrl = 'Error';
	}
	return driveSharingUrl;
}
