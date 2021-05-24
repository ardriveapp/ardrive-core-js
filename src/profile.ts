// index.js
import * as fs from 'fs';
import path from 'path';
import { Path } from 'typescript';
import { getPrivateDriveRootFolderTxId, getPublicDriveRootFolderTxId } from './gql';
import { asyncForEach, moveFolder } from './common';
import { addFileToSyncTable, updateFilePathInSyncTable, updateUserSyncFolderPathInProfileTable } from './db/db_update';
import {
	getAllDrivesByLoginFromDriveTable,
	getAllFilesByLoginFromSyncTable,
	getFolderFromSyncTable,
	getSyncFolderPathFromProfile
} from './db/db_get';
import { removeByDriveIdFromSyncTable, removeFromDriveTable } from './db/db_delete';
import { ArFSDriveMetaData, ArFSFileMetaData, ArFSRootFolderMetaData } from './types/base_Types';

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

// Deletes a single drive and its files in the database
export async function deleteDrive(driveId: string): Promise<string> {
	await removeByDriveIdFromSyncTable(driveId);
	await removeFromDriveTable(driveId);

	// This should also stop the Chokidar folder watch if it has started
	return 'Success';
}
