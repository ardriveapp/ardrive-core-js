import * as fs from 'fs';
import path from 'path';

import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';

import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from '../types/base_Types';
import { ArFSLocalPublicFile, ArFSLocalPublicDriveEntity } from '../types/client_Types';
import { newArFSFileMetaData } from './arfs';
import { v4 as uuidv4 } from 'uuid';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { appName, appVersion, arFSVersion } from '../constants';
import { getPublicDriveRootFolderTxId, getSharedPublicDrive } from '../gql';
import { addDriveToDriveTable, addFileToSyncTable, setDriveToSync } from '../db/db_update';
import { createDataUploader, createDriveTransaction } from '../transactions';
import { contentType, entityType } from '../types/type_guards';
import {
	ArFSEntity,
	ArFSPublicDriveEntity,
	ArFSPublicFileFolderEntity,
	ArFSPublicFileData,
	IPublicDriveEntity
} from '../types/arfs_Types';

// Creates an new Drive transaction and uploader using ArFS Metadata
export async function newArFSDriveMetaData(
	walletPrivateKey: JWKInterface,
	driveMetaData: ArFSLocalPublicDriveEntity
): Promise<{ driveMetaData: ArFSLocalPublicDriveEntity; uploader: TransactionUploader } | null> {
	const entity = driveMetaData.entity;
	try {
		// Create a JSON file, containing necessary drive metadata
		if (entity instanceof ArFSEntity) {
			const driveMetaDataTags = {
				name: entity.name,
				rootFolderId: entity.rootFolderId
			};
			// Convert to JSON string
			const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);
			// The drive is public
			console.log('Creating a new Public Drive (name: %s) on the Permaweb', entity.name);
			const transaction = await createDriveTransaction(driveMetaDataJSON, driveMetaData.entity, walletPrivateKey);
			// Update the file's data transaction ID
			entity.txId = transaction.id;
			// Create the File Uploader object
			const uploader = await createDataUploader(transaction);
			return { driveMetaData, uploader };
		}
		return null;
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', (entity && entity.name) || entity);
		return null;
	}
}

// Creates a new drive depending on the privacy
// This should be in the Drive class
export async function newArFSDrive(driveName: string, login: string): Promise<ArFSLocalPublicDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);

	// Drive is public
	console.log('Creating a new public drive %s | %s', driveName, driveId);
	const drive = new ArFSLocalPublicDriveEntity({
		id: 0,
		driveId,
		owner: login,
		isLocal: 1,
		entity: new ArFSPublicDriveEntity({
			appName,
			appVersion,
			arFS: arFSVersion,
			driveId,
			rootFolderId,
			syncStatus: 0,
			txId: '0',
			unixTime: unixTime
		} as IPublicDriveEntity)
	});

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
		const entity = newDrive.entity;
		if (entity instanceof ArFSEntity) {
			// Prepare the drive transaction.  It will encrypt the data if necessary.
			const preppedDrive = await newArFSDriveMetaData(walletPrivateKey, newDrive);

			// Create a new ArFS Drive Root Folder entity
			const newRootFolderMetaData = new ArFSLocalPublicFile({
				id: 0,
				owner: user.walletPublicKey,
				hash: '',
				isLocal: 1,
				path: '',
				size: 0,
				version: 0,
				entity: new ArFSPublicFileFolderEntity({
					appName,
					appVersion,
					unixTime: Math.round(Date.now() / 1000),
					contentType: contentType.APPLICATION_JSON,
					entityType: entityType.FOLDER,
					driveId: entity.driveId,
					parentFolderId: '0', // Must be set to 0 to indicate it is a root folder
					entityId: entity.rootFolderId,
					name: driveName,
					syncStatus: 0,
					txId: '0',
					arFS: arFSVersion,
					lastModifiedDate: 0
				}),
				data: new ArFSPublicFileData({
					appName: appName,
					appVersion: appVersion,
					contentType: contentType.APPLICATION_JSON,
					syncStatus: 0,
					txId: '0',
					unixTime: 0
				})
			});

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
		}
		return false;
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
		const driveRootFolderToAdd = new ArFSFileMetaData({
			id: 0,
			login: user.login,
			appName: sharedPublicDrive.appName,
			appVersion: sharedPublicDrive.appVersion,
			unixTime: sharedPublicDrive.unixTime,
			contentType: contentType.APPLICATION_JSON,
			entityType: entityType.FOLDER,
			driveId: sharedPublicDrive.driveId,
			parentFolderId: '0', // Root folders have no parent folder ID.
			fileId: sharedPublicDrive.rootFolderId,
			filePath: drivePath,
			fileName: sharedPublicDrive.driveName,
			fileSize: 0,
			lastModifiedDate: sharedPublicDrive.unixTime,
			fileVersion: 0,
			isPublic: 1,
			isLocal: 1,
			metaDataTxId,
			dataTxId: '0',
			fileDataSyncStatus: 0, // Folders do not require a data tx
			fileMetaDataSyncStatus: 3,
			cloudOnly: 0
		});

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
