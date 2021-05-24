import * as fs from 'fs';
import path from 'path';

import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';

import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from '../types/base_Types';
import { ArFSLocalFile, ArFSLocalDriveEntity } from '../types/client_Types';
import { newArFSFileMetaData } from './arfs';
import { v4 as uuidv4 } from 'uuid';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { appName, appVersion, arFSVersion } from '../constants';
import { getPublicDriveRootFolderTxId, getSharedPublicDrive } from '../gql';
import { addDriveToDriveTable, addFileToSyncTable, setDriveToSync } from '../db/db_update';
import { createDataUploader, createDriveTransaction } from '../transactions';

// Creates an new Drive transaction and uploader using ArFS Metadata
export async function newArFSDriveMetaData(
	walletPrivateKey: JWKInterface,
	driveMetaData: ArFSLocalDriveEntity
): Promise<{ driveMetaData: ArFSLocalDriveEntity; uploader: TransactionUploader } | null> {
	try {
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: driveMetaData.entity.name,
			rootFolderId: driveMetaData.entity.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// The drive is public
		console.log('Creating a new Public Drive (name: %s) on the Permaweb', driveMetaData.entity.name);
		const transaction = await createDriveTransaction(driveMetaDataJSON, driveMetaData.entity, walletPrivateKey);

		// Update the file's data transaction ID
		driveMetaData.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.entity.name);
		return null;
	}
}

// Creates a new drive depending on the privacy
// This should be in the Drive class
export async function newArFSDrive(driveName: string, login: string): Promise<ArFSLocalDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);

	// Drive is public
	console.log('Creating a new public drive %s | %s', driveName, driveId);
	const drive: ArFSLocalDriveEntity = {
		id: 0,
		owner: login,
		isLocal: 1,
		entity: {
			appName: appName,
			appVersion: appVersion,
			arFS: arFSVersion,
			contentType: '',
			driveId: driveId,
			drivePrivacy: 'public',
			rootFolderId: rootFolderId,
			syncStatus: 0,
			txId: '0',
			unixTime: unixTime,
			name: '',
			entityType: ''
		}
	};

	return drive;
}

// This will create and upload a new drive entity and its root folder
export async function createAndUploadArFSDriveAndRootFolder(
	user: ArDriveUser,
	walletPrivateKey: JWKInterface,
	driveName: string,
	drivePrivacy: string
): Promise<boolean> {
	try {
		// Create a new ArFS Drive entity
		const newDrive = await newArFSDrive(driveName, drivePrivacy);

		// Prepare the drive transaction.  It will encrypt the data if necessary.
		const preppedDrive = await newArFSDriveMetaData(walletPrivateKey, newDrive);

		// Create a new ArFS Drive Root Folder entity
		const newRootFolderMetaData: ArFSLocalFile = {
			id: 0,
			owner: user.walletPublicKey,
			hash: '',
			isLocal: 1,
			path: '',
			size: 0,
			version: 0,
			entity: {
				appName: appName,
				appVersion: appVersion,
				unixTime: Math.round(Date.now() / 1000),
				contentType: 'application/json',
				entityType: 'folder',
				driveId: newDrive.entity.driveId,
				parentFolderId: '0', // Must be set to 0 to indicate it is a root folder
				entityId: newDrive.entity.rootFolderId,
				name: driveName,
				syncStatus: 0,
				txId: '0',
				arFS: arFSVersion,
				lastModifiedDate: 0
			},
			data: { appName: appName, appVersion: appVersion, contentType: '', syncStatus: 0, txId: '0', unixTime: 0 }
		};

		// Prepare the root folder transaction.  It will encrypt the data if necessary.
		const preppedRootFolder = await newArFSFileMetaData(walletPrivateKey, newRootFolderMetaData);

		// Upload the drive entity transaction
		if (preppedDrive !== null && preppedRootFolder !== null) {
			while (!preppedDrive.uploader.isComplete) {
				await preppedDrive.uploader.uploadChunk();
			}
			// upload the root folder entity metadata transaction
			while (!preppedRootFolder.uploader.isComplete) {
				await preppedRootFolder.uploader.uploadChunk();
			}
			return true;
		} else {
			// Error creating root folder transaction and uploader
			return false;
		}
	} catch (err) {
		console.log(err);
		return false;
	}
}

// Add a Shared Public drive, using a DriveId
export async function addSharedPublicDrive(user: ArDriveUser, driveId: string): Promise<string> {
	try {
		// Get the drive information from arweave
		const sharedPublicDrive: ArFSDriveMetaData = await getSharedPublicDrive(driveId);

		// If there is no meta data tx id, then the drive id does not exist or has not been mined yet
		if (sharedPublicDrive.metaDataTxId === '0') {
			return 'Invalid';
		}

		// Set the drives login
		sharedPublicDrive.login = user.login;

		// Set the drive to sync locally
		sharedPublicDrive.isLocal = 1;

		// Check if the drive path exists, if not, create it
		const drivePath: string = path.join(user.syncFolderPath, sharedPublicDrive.driveName);
		if (!fs.existsSync(drivePath)) {
			fs.mkdirSync(drivePath);
		}

		// Get the root folder ID for this drive
		const metaDataTxId = await getPublicDriveRootFolderTxId(
			sharedPublicDrive.driveId,
			sharedPublicDrive.rootFolderId
		);

		// Setup Drive Root Folder
		const driveRootFolderToAdd: ArFSFileMetaData = {
			id: 0,
			login: user.login,
			appName: sharedPublicDrive.appName,
			appVersion: sharedPublicDrive.appVersion,
			unixTime: sharedPublicDrive.unixTime,
			contentType: 'application/json',
			entityType: 'folder',
			driveId: sharedPublicDrive.driveId,
			parentFolderId: '0', // Root folders have no parent folder ID.
			fileId: sharedPublicDrive.rootFolderId,
			filePath: drivePath,
			fileName: sharedPublicDrive.driveName,
			fileHash: '0',
			fileSize: 0,
			lastModifiedDate: sharedPublicDrive.unixTime,
			fileVersion: 0,
			isPublic: 1,
			isLocal: 1,
			metaDataTxId,
			dataTxId: '0',
			permaWebLink: '',
			fileDataSyncStatus: 0, // Folders do not require a data tx
			fileMetaDataSyncStatus: 3,
			cipher: '',
			dataCipherIV: '',
			metaDataCipherIV: '',
			cloudOnly: 0
		};

		// Add Drive to Drive Table
		await addDriveToDriveTable(sharedPublicDrive);
		await setDriveToSync(sharedPublicDrive.driveId);

		// Add the Root Folder to the Sync Table
		await addFileToSyncTable(driveRootFolderToAdd);
		return sharedPublicDrive.driveName;
	} catch (err) {
		console.log(err);
		return 'Invalid';
	}
}
