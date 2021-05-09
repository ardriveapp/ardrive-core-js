// index.js
import * as fs from 'fs';
import path from 'path';
import { Path } from 'typescript';
import { getPrivateDriveRootFolderTxId, getPublicDriveRootFolderTxId, getSharedPublicDrive } from './gql';
import { asyncForEach, moveFolder } from './common';
import { encryptText, decryptText } from './crypto';
import {
	addDriveToDriveTable,
	addFileToSyncTable,
	createArDriveProfile,
	setDriveToSync,
	updateFilePathInSyncTable,
	updateUserSyncFolderPathInProfileTable
} from './db_update';
import {
	getAllDrivesByLoginFromDriveTable,
	getAllFilesByLoginFromSyncTable,
	getFolderFromSyncTable,
	getSyncFolderPathFromProfile,
	getUserFromProfile
} from './db_get';
import { removeByDriveIdFromSyncTable, removeFromDriveTable, removeFromProfileTable } from './db_delete';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData, ArFSRootFolderMetaData } from './types/base_Types';

// This creates all of the Drives found for the user
export async function setupDrives(login: string, syncFolderPath: string): Promise<string> {
	try {
		console.log('Initializing ArDrives');
		// check if the root sync folder exists, if not create it
		if (!fs.existsSync(syncFolderPath)) {
			fs.mkdirSync(syncFolderPath);
		}

		// get all drives
		const drives: ArFSDriveMetaData[] = await getAllDrivesByLoginFromDriveTable(login);

		// for each drive, check if drive folder exists
		await asyncForEach(drives, async (drive: ArFSDriveMetaData) => {
			// Check if the drive path exists, if not, create it
			const drivePath: string = path.join(syncFolderPath, drive.driveName);
			if (!fs.existsSync(drivePath)) {
				fs.mkdirSync(drivePath);
			}

			// check if drive folder entity is setup already in sync table
			const driveFolderEntity: ArFSFileMetaData = await getFolderFromSyncTable(drive.driveId, drivePath);
			if (driveFolderEntity === undefined) {
				// if not, add it to the sync table
				// determine if the files are private or public
				// this should be refactored, and isPublic should change to drivePrivacy
				let isPublic = 1;
				let rootFolderMetaData: ArFSRootFolderMetaData = {
					metaDataTxId: '',
					cipher: '',
					cipherIV: ''
				};
				if (drive.drivePrivacy === 'private') {
					isPublic = 0;
					rootFolderMetaData = await getPrivateDriveRootFolderTxId(drive.driveId, drive.rootFolderId);
				} else {
					// Get the root folder ID for this drive
					rootFolderMetaData.metaDataTxId = await getPublicDriveRootFolderTxId(
						drive.driveId,
						drive.rootFolderId
					);
				}

				// Prepare a new folder to add to the sync table
				// This folder will require a metadata transaction to arweave
				const driveRootFolderToAdd: ArFSFileMetaData = {
					id: 0,
					login,
					appName: drive.appName,
					appVersion: drive.appVersion,
					unixTime: drive.unixTime,
					contentType: 'application/json',
					entityType: 'folder',
					driveId: drive.driveId,
					parentFolderId: '0', // Root folders have no parent folder ID.
					fileId: drive.rootFolderId,
					filePath: drivePath,
					fileName: drive.driveName,
					fileHash: '0',
					fileSize: 0,
					lastModifiedDate: drive.unixTime,
					fileVersion: 0,
					isPublic,
					isLocal: 1,
					metaDataTxId: rootFolderMetaData.metaDataTxId,
					dataTxId: '0',
					permaWebLink: '',
					fileDataSyncStatus: 0, // Folders do not require a data tx
					fileMetaDataSyncStatus: drive.metaDataSyncStatus, // Sync status of 1 requries a metadata tx
					cipher: rootFolderMetaData.cipher,
					dataCipherIV: '',
					metaDataCipherIV: rootFolderMetaData.cipherIV,
					cloudOnly: 0
				};
				await addFileToSyncTable(driveRootFolderToAdd);
			}
		});
		console.log('Initialization completed');
		return 'Initialization completed';
	} catch (err) {
		console.log(err);
		return 'Error';
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

// Changes the sync folder path for a user, and updates every file for that user in the sync database and moves every file to the new location
// The sync folder contains all downloaded drives, folders and files
export async function updateUserSyncFolderPath(login: string, newSyncFolderPath: string): Promise<string> {
	try {
		// Get the current sync folder path for the user
		const profile = await getSyncFolderPathFromProfile(login);
		const currentSyncFolderPath: Path = profile.syncFolderPath;

		// Move files and folders from old location
		const result: string = moveFolder(currentSyncFolderPath, newSyncFolderPath);
		if (result === 'Error') {
			console.log('Please ensure your Sync Folder is not in use, and try again');
			return 'Error';
		}

		// Update the user profile to use the new sync folder path
		await updateUserSyncFolderPathInProfileTable(login, newSyncFolderPath);

		// Get and Update each file's path in the sync table
		const filesToMove: ArFSFileMetaData[] = await getAllFilesByLoginFromSyncTable(login);
		await asyncForEach(filesToMove, async (fileToMove: ArFSFileMetaData) => {
			const newFilePath = fileToMove.filePath.replace(currentSyncFolderPath, newSyncFolderPath);
			await updateFilePathInSyncTable(newFilePath, fileToMove.id);
		});
		return 'Success';
	} catch (err) {
		console.log(err);
		console.log('Error updating sync folder to %s', newSyncFolderPath);
		return 'Error';
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

// Deletes a user and all of their associated drives and files in the database
export async function deleteUserAndDrives(login: string): Promise<string> {
	// Delete profile matching login
	await removeFromProfileTable(login);
	// Get DriveIDs for login
	const drivesToDelete: ArFSDriveMetaData[] = await getAllDrivesByLoginFromDriveTable(login);
	// Delete drives and files matching login
	await asyncForEach(drivesToDelete, async (drive: ArFSDriveMetaData) => {
		// Delete files in the sync table with matching DriveIDs
		await removeByDriveIdFromSyncTable(drive.driveId);
		// Remove the drive itself from the Drive Table
		await removeFromDriveTable(drive.driveId);
	});
	return 'Success';
}

// Deletes a single drive and its files in the database
export async function deleteDrive(driveId: string): Promise<string> {
	await removeByDriveIdFromSyncTable(driveId);
	await removeFromDriveTable(driveId);

	// This should also stop the Chokidar folder watch if it has started
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
