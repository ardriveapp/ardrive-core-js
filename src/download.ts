/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
// upload.js
import * as fs from 'fs';
import * as common from './common';
import * as getDb from './db_get';
import * as updateDb from './db_update';
import * as gql from './gql';
import { GQLEdgeInterface, GQLTagInterface } from './types/gql_Types';
import path, { dirname } from 'path';
import { getLatestBlockHeight, getTransactionData } from './arweave';
import { checksumFile, deriveDriveKey, deriveFileKey, fileDecrypt } from './crypto';
import { ArDriveUser } from './types/base_Types';
import { ArFSLocalDriveEntity, ArFSLocalFile, ArFSLocalPrivateFile } from './types/client_Types';
import { createWriteStream } from 'fs';

import Axios from 'axios';
import ProgressBar from 'progress';
import { ArFSDriveEntity, ArFSPrivateDriveEntity } from './types/arfs_Types';
import { gatewayURL } from './constants';

// Downloads a single file from ArDrive by transaction
async function downloadArDriveFileByTx(user: ArDriveUser, fileToDownload: ArFSLocalFile) {
	try {
		// Get the parent folder's path
		const parentFolder: ArFSLocalFile = await getDb.getLatestFolderVersionFromSyncTable(
			fileToDownload.entity.parentFolderId
		);

		// Check if this file's path has the right path from its parent folder.  This ensures folders moved on the web are properly moved locally
		if (parentFolder.path !== path.dirname(fileToDownload.path)) {
			// Update the file path in the database
			console.log('Fixing file path to ', parentFolder.path);
			fileToDownload.path = path.join(parentFolder.path, fileToDownload.entity.name);
			await updateDb.setFilePath(fileToDownload.path, fileToDownload.id);
		}

		// Check if this is a folder.  If it is, we dont need to download anything and we create the folder.
		const folderPath = dirname(fileToDownload.path);
		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true });
			await common.sleep(100);
		}

		const dataTxUrl = gatewayURL.concat(fileToDownload.data.txId);
		// Public files do not need decryption
		console.log('Downloading %s', fileToDownload.path);
		const writer = createWriteStream(fileToDownload.path);
		const response = await Axios({
			method: 'get',
			url: dataTxUrl,
			responseType: 'stream'
		});
		const totalLength = response.headers['content-length'];
		const progressBar = new ProgressBar('-> [:bar] :rate/bps :percent :etas', {
			width: 40,
			complete: '=',
			incomplete: ' ',
			renderThrottle: 1,
			total: parseInt(totalLength)
		});

		response.data.on('data', (chunk: string | any[]) => progressBar.tick(chunk.length));
		response.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer.on('error', (err) => {
				writer.close();
				reject(err);
			});
			writer.on('close', () => {
				console.log('   Completed!', fileToDownload.path);
				resolve(true);
			});
		});
	} catch (err) {
		//console.log(err);
		console.log('Error downloading file data %s to %s', fileToDownload.entity.name, fileToDownload.path);
		return 'Error downloading file';
	}
}

async function downloadArDrivePrivateFileByTx(user: ArDriveUser, fileToDownload: ArFSLocalPrivateFile) {
	try {
		// Get the parent folder's path
		const parentFolder: ArFSLocalPrivateFile = await getDb.getLatestFolderVersionFromSyncTable(
			fileToDownload.entity.parentFolderId
		);

		// Check if this file's path has the right path from its parent folder.  This ensures folders moved on the web are properly moved locally
		if (parentFolder.path !== path.dirname(fileToDownload.path)) {
			// Update the file path in the database
			console.log('Fixing file path to ', parentFolder.path);
			fileToDownload.path = path.join(parentFolder.path, fileToDownload.entity.name);
			await updateDb.setFilePath(fileToDownload.path, fileToDownload.id);
		}

		// Check if this is a folder.  If it is, we dont need to download anything and we create the folder.
		const folderPath = dirname(fileToDownload.path);
		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true });
			await common.sleep(100);
		}

		const dataTxUrl = gatewayURL.concat(fileToDownload.data.txId);

		// File is private and we must decrypt it
		console.log('Downloading and decrypting %s', fileToDownload.path);
		const writer = createWriteStream(fileToDownload.path);
		const response = await Axios({
			method: 'get',
			url: dataTxUrl,
			responseType: 'stream'
		});
		const totalLength = response.headers['content-length'];
		const progressBar = new ProgressBar('-> [:bar] :rate/bps :percent :etas', {
			width: 40,
			complete: '=',
			incomplete: ' ',
			renderThrottle: 1,
			total: parseInt(totalLength)
		});

		response.data.on('data', (chunk: string | any[]) => progressBar.tick(chunk.length));
		response.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer.on('error', (err) => {
				writer.close();
				console.log(user);
				reject(err);
			});
			writer.on('close', async () => {
				// Once the file is finished being streamed, we read it and decrypt it.
				const data = fs.readFileSync(fileToDownload.path);
				const dataBuffer = Buffer.from(data);
				const driveKey: Buffer = await deriveDriveKey(
					user.dataProtectionKey,
					fileToDownload.entity.driveId,
					user.walletPrivateKey
				);
				const fileKey: Buffer = await deriveFileKey(fileToDownload.entity.entityId, driveKey);
				const decryptedData = await fileDecrypt(fileToDownload.entity.cipherIV, fileKey, dataBuffer);

				// Overwrite the file with the decrypted version
				fs.writeFileSync(fileToDownload.path, decryptedData);
				console.log('   Completed!', fileToDownload.path);
				resolve(true);
			});
		});
	} catch (err) {
		//console.log(err);
		console.log('Error downloading file data %s to %s', fileToDownload.entity.name, fileToDownload.path);
		return 'Error downloading file';
	}
}

// Takes an ArDrive File Data Transaction and writes to the database.
async function getFileMetaDataFromTx(fileDataTx: GQLEdgeInterface, user: ArDriveUser) {
	const fileToSync: ArFSLocalFile = ArFSLocalFile.From({ owner: user.login });
	try {
		const { node } = fileDataTx;
		const { tags } = node;
		fileToSync.entity.txId = node.id;

		// DOUBLE CHECK THIS
		// Is the File or Folder already present in the database?  If it is, lets ensure its already downloaded
		const isMetaDataSynced = await getDb.getByMetaDataTxFromSyncTable(fileToSync.entity.txId);
		if (isMetaDataSynced) {
			// this file is already downloaded and synced
			return 'Synced Already';
		}

		// Download the File's Metadata using the metadata transaction ID
		const data: string | Uint8Array = await getTransactionData(fileToSync.entity.txId);

		// Enumerate through each tag to pull the data
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					fileToSync.entity.appName = value;
					break;
				case 'App-Version':
					fileToSync.entity.appVersion = value;
					break;
				case 'Unix-Time':
					fileToSync.entity.unixTime = +value; // Convert to number
					break;
				case 'Content-Type':
					fileToSync.entity.contentType = value;
					break;
				case 'Entity-Type':
					fileToSync.entity.entityType = value;
					break;
				case 'Drive-Id':
					fileToSync.entity.driveId = value;
					break;
				case 'File-Id':
					fileToSync.entity.entityId = value;
					break;
				case 'Folder-Id':
					fileToSync.entity.entityId = value;
					break;
				case 'Parent-Folder-Id':
					fileToSync.entity.parentFolderId = value;
					break;
				default:
					break;
			}
		});

		// the file is public and does not require decryption
		const dataString = await common.Utf8ArrayToStr(data);
		const dataJSON = await JSON.parse(dataString);

		// Set metadata for Folder and File entities
		fileToSync.size = dataJSON.size;
		fileToSync.entity.name = dataJSON.name;
		fileToSync.hash = '';
		fileToSync.data.syncStatus = 3;
		fileToSync.entity.syncStatus = 3;
		fileToSync.data.txId = '0';

		// Perform specific actions for File, Folder and Drive entities
		if (fileToSync.entity.entityType === 'file') {
			// The actual data transaction ID, lastModifiedDate, and Filename of the underlying file are pulled from the metadata transaction
			fileToSync.entity.lastModifiedDate = dataJSON.lastModifiedDate; // Convert to milliseconds
			fileToSync.data.txId = dataJSON.dataTxId;
			fileToSync.data.contentType = common.extToMime(dataJSON.name);
			//fileToSync.permaWebLink = gatewayURL.concat(dataJSON.dataTxId);

			// Check to see if a previous version exists, and if so, increment the version.
			// Versions are determined by comparing old/new file hash.
			const latestFile = await getDb.getLatestFileVersionFromSyncTable(fileToSync.entity.entityId);
			if (latestFile !== undefined) {
				if (latestFile.data.txId !== fileToSync.data.txId) {
					fileToSync.version = +latestFile.version + 1;
					// console.log ("%s has a new version %s", dataJSON.name, fileToSync.version)
				}
				// If the previous file data tx matches, then we do not increment the version
				else {
					fileToSync.version = latestFile.fileVersion;
				}
			}
			// Perform specific actions for Folder entities
		} else if (fileToSync.entity.entityType === 'folder') {
			//Note: These parameters dont exist on the new types.
			//fileToSync.entity.lastModifiedDate = fileToSync.entity.lastModifiedDate;
			//fileToSync.permaWebLink = gatewayURL.concat(fileToSync.entity.txId);
		}

		console.log(
			'QUEUING %s %s | Id: %s | Tx: %s for download',
			fileToSync.entity.entityType,
			fileToSync.entity.name,
			fileToSync.entity.entityId,
			fileToSync.entity.txId
		);
		await updateDb.addFileToSyncTable(fileToSync);
		return 'Success';
	} catch (err) {
		console.log(err);
		console.log('Error syncing file metadata');
		console.log(fileToSync);
		return 'Error syncing file metadata';
	}
}
// Takes an ArDrive File Data Transaction and writes to the database.
async function getPrivateFileMetaDataFromTx(fileDataTx: GQLEdgeInterface, user: ArDriveUser) {
	const fileToSync: ArFSLocalPrivateFile = ArFSLocalPrivateFile.From({ owner: user.login });
	try {
		const { node } = fileDataTx;
		const { tags } = node;
		fileToSync.entity.txId = node.id;

		// DOUBLE CHECK THIS
		// Is the File or Folder already present in the database?  If it is, lets ensure its already downloaded
		const isMetaDataSynced = await getDb.getByMetaDataTxFromSyncTable(fileToSync.entity.txId);
		if (isMetaDataSynced) {
			// this file is already downloaded and synced
			return 'Synced Already';
		}

		// Download the File's Metadata using the metadata transaction ID
		const data: string | Uint8Array = await getTransactionData(fileToSync.entity.txId);

		// Enumerate through each tag to pull the data
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					fileToSync.entity.appName = value;
					break;
				case 'App-Version':
					fileToSync.entity.appVersion = value;
					break;
				case 'Unix-Time':
					fileToSync.entity.unixTime = +value; // Convert to number
					break;
				case 'Content-Type':
					fileToSync.entity.contentType = value;
					break;
				case 'Entity-Type':
					fileToSync.entity.entityType = value;
					break;
				case 'Drive-Id':
					fileToSync.entity.driveId = value;
					break;
				case 'File-Id':
					fileToSync.entity.entityId = value;
					break;
				case 'Folder-Id':
					fileToSync.entity.entityId = value;
					break;
				case 'Parent-Folder-Id':
					fileToSync.entity.parentFolderId = value;
					break;
				case 'Cipher':
					fileToSync.entity.cipher = value;
					break;
				case 'Cipher-IV':
					fileToSync.entity.cipherIV = value;
					break;
				default:
					break;
			}
		});

		let dataJSON;
		let decryptedData = Buffer.from('');
		// If it is a private file or folder, the data will need decryption.
		if (fileToSync.entity.cipher === 'AES256-GCM') {
			const dataBuffer = Buffer.from(data);
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToSync.entity.driveId,
				user.walletPrivateKey
			);
			if (fileToSync.entity.entityType === 'file') {
				// Decrypt files using a File Key derived from the Drive key
				const fileKey: Buffer = await deriveFileKey(fileToSync.entity.entityId, driveKey);
				decryptedData = await fileDecrypt(fileToSync.entity.cipherIV, fileKey, dataBuffer);
			} else if (fileToSync.entity.entityType === 'folder') {
				// Decrypt folders using the Drive Key only
				decryptedData = await fileDecrypt(fileToSync.entity.cipherIV, driveKey, dataBuffer);
			}

			// Handle an error with decryption by ignoring this file.  THIS NEEDS TO BE IMPROVED.
			if (decryptedData.toString('ascii') === 'Error') {
				console.log(
					'There was a problem decrypting a private %s with TXID: %s',
					fileToSync.entity.entityType,
					fileToSync.entity.txId
				);
				console.log('Skipping this file...');
				fileToSync.size = 0;
				fileToSync.entity.name = '';
				fileToSync.hash = '';
				fileToSync.data.syncStatus = 0;
				fileToSync.entity.syncStatus = 3;
				fileToSync.data.txId = '0';
				//fileToSync.entity.lastModifiedDate = fileToSync.entity.lastModifiedDate;
				//fileToSync.permaWebLink = gatewayURL.concat(fileToSync.data.txId);
				//fileToSync.cloudOnly = 1;
				await updateDb.addFileToSyncTable(fileToSync); // This must be handled better.
				return 'Error Decrypting';
			} else {
				const dataString = await common.Utf8ArrayToStr(decryptedData);
				dataJSON = await JSON.parse(dataString);
			}
		}

		// Set metadata for Folder and File entities
		fileToSync.size = dataJSON.size;
		fileToSync.entity.name = dataJSON.name;
		fileToSync.hash = '';
		fileToSync.data.syncStatus = 3;
		fileToSync.entity.syncStatus = 3;
		fileToSync.data.txId = '0';

		// Perform specific actions for File, Folder and Drive entities
		if (fileToSync.entity.entityType === 'file') {
			// The actual data transaction ID, lastModifiedDate, and Filename of the underlying file are pulled from the metadata transaction
			fileToSync.entity.lastModifiedDate = dataJSON.lastModifiedDate; // Convert to milliseconds
			fileToSync.data.txId = dataJSON.dataTxId;
			fileToSync.data.contentType = common.extToMime(dataJSON.name);
			//fileToSync.permaWebLink = gatewayURL.concat(dataJSON.dataTxId);

			// if this is a private file, the CipherIV of the Data transaction should also be captured
			fileToSync.data.cipherIV = await gql.getPrivateTransactionCipherIV(fileToSync.data.txId);

			// Check to see if a previous version exists, and if so, increment the version.
			// Versions are determined by comparing old/new file hash.
			const latestFile = await getDb.getLatestFileVersionFromSyncTable(fileToSync.entity.entityId);
			if (latestFile !== undefined) {
				if (latestFile.fileDataTx !== fileToSync.data.txId) {
					fileToSync.version = +latestFile.fileVersion + 1;
					// console.log ("%s has a new version %s", dataJSON.name, fileToSync.version)
				}
				// If the previous file data tx matches, then we do not increment the version
				else {
					fileToSync.version = latestFile.fileVersion;
				}
			}
			// Perform specific actions for Folder entities
		}
		//Note: These properties dont exist on the new types
		else if (fileToSync.entity.entityType === 'folder') {
			//fileToSync.entity.lastModifiedDate = fileToSync.entity.lastModifiedDate;
			//fileToSync.permaWebLink = gatewayURL.concat(fileToSync.entity.txId);
		}

		console.log(
			'QUEUING %s %s | Id: %s | Tx: %s for download',
			fileToSync.entity.entityType,
			fileToSync.entity.name,
			fileToSync.entity.entityId,
			fileToSync.entity.txId
		);
		await updateDb.addFileToSyncTable(fileToSync);
		return 'Success';
	} catch (err) {
		console.log(err);
		console.log('Error syncing file metadata');
		console.log(fileToSync);
		return 'Error syncing file metadata';
	}
}
// Gets all of the files from your ArDrive (via ARQL) and loads them into the database.
export async function getMyArDriveFilesFromPermaWeb(user: ArDriveUser): Promise<string> {
	// Get your private files
	console.log('---Getting all your Private ArDrive files---');
	let drives: ArFSLocalDriveEntity[] = getDb.getAllDrivesByPrivacyFromDriveTable(user.login, 'personal', 'private');
	await common.asyncForEach(drives, async (drive: ArFSLocalDriveEntity) => {
		// Get the last block height that has been synced
		let lastBlockHeight = await getDb.getDriveLastBlockHeight(drive.entity.driveId);
		lastBlockHeight = lastBlockHeight.lastBlockHeight;
		const queryResult = await gql.getAllPublicFileEntities(
			user.walletPublicKey,
			drive.entity.driveId,
			lastBlockHeight
		);
		if (typeof queryResult != 'string') {
			const privateTxIds = queryResult.map((file) => file.txId);
			if (privateTxIds !== undefined) {
				await common.asyncForEach(privateTxIds, async (privateTxId: GQLEdgeInterface) => {
					await getFileMetaDataFromTx(privateTxId, user);
				});
			}
			// Get and set the latest block height for each drive synced
			const latestBlockHeight: number = await getLatestBlockHeight();
			await updateDb.setDriveLastBlockHeight(latestBlockHeight, drive.entity.driveId);
		}
	});

	// Get your public files
	console.log('---Getting all your Public ArDrive files---');
	drives = await getDb.getAllDrivesByPrivacyFromDriveTable(user.login, 'personal', 'public');
	await common.asyncForEach(drives, async (drive: ArFSLocalDriveEntity) => {
		// Get the last block height that has been synced
		let lastBlockHeight = await getDb.getDriveLastBlockHeight(drive.entity.driveId);
		lastBlockHeight = lastBlockHeight.lastBlockHeight;
		const queryResult = await gql.getAllPublicFileEntities(
			user.walletPublicKey,
			drive.entity.driveId,
			lastBlockHeight
		);
		if (typeof queryResult != 'string') {
			const publicTxIds = queryResult.map((file) => file.txId);
			if (publicTxIds !== undefined) {
				await common.asyncForEach(publicTxIds, async (publicTxId: GQLEdgeInterface) => {
					await getFileMetaDataFromTx(publicTxId, user);
				});
			}
			// Get and set the latest block height for each drive synced
			const latestBlockHeight: number = await getLatestBlockHeight();
			await updateDb.setDriveLastBlockHeight(latestBlockHeight, drive.entity.driveId);
		}
	});

	// Note: Commented out because there is no function to get sharedfiles in gql
	// Get your shared public files
	// console.log('---Getting all your Shared Public ArDrive files---');
	// drives = await getDb.getAllDrivesByPrivacyFromDriveTable(user.login, 'shared', 'public');
	// await common.asyncForEach(drives, async (drive: ArFSLocalDriveEntity) => {
	// 	// Get the last block height that has been synced
	// 	let lastBlockHeight = await getDb.getDriveLastBlockHeight(drive.driveId);
	// 	lastBlockHeight = lastBlockHeight.lastBlockHeight;
	// 	const sharedPublicTxIds = await gql.getAllMySharedDataFileTxs(drive.driveId, lastBlockHeight);
	// 	if (sharedPublicTxIds !== undefined) {
	// 		await common.asyncForEach(sharedPublicTxIds, async (sharedPublicTxId: GQLEdgeInterface) => {
	// 			await getFileMetaDataFromTx(sharedPublicTxId, user);
	// 		});
	// 	}
	// 	// Get and set the latest block height for each drive synced
	// 	const latestBlockHeight: number = await getLatestBlockHeight();
	// 	await updateDb.setDriveLastBlockHeight(latestBlockHeight, drive.driveId);
	// });

	// File path is not present by default, so we must generate them for each new file, folder or drive found
	await common.setNewFilePaths();
	return 'Success';
}

// Downloads all ardrive files that are not local
export async function downloadMyArDriveFiles(user: ArDriveUser): Promise<string> {
	console.log('---Downloading any unsynced files---');
	// Get the Files and Folders which have isLocal set to 0 that we are not ignoring
	const filesToDownload: ArFSLocalFile[] = getDb.getFilesToDownload(user.login);
	const foldersToCreate: ArFSLocalFile[] = getDb.getFoldersToCreate(user.login);

	// Get the special batch of File Download Conflicts
	const fileConflictsToDownload: ArFSLocalFile[] = getDb.getMyFileDownloadConflicts(user.login);

	// Process any folders to create
	if (foldersToCreate.length > 0) {
		// there are new folders to create
		await common.asyncForEach(foldersToCreate, async (folderToCreate: ArFSLocalFile) => {
			// Establish the folder path first
			if (folderToCreate.path === '') {
				folderToCreate.path = await common.updateFilePath(folderToCreate);
			}
			// Get the latest folder version from the DB
			const latestFolderVersion: ArFSLocalFile = await getDb.getLatestFolderVersionFromSyncTable(
				folderToCreate.entity.entityId
			);
			// If this folder is the latest version, then we should create the folder
			try {
				if (latestFolderVersion.path === folderToCreate.path) {
					// Compare against the previous version for a different file name or parent folder
					// If it does then this means there was a rename or move, and then we do not download a new file, rather rename/move the old
					const previousFolderVersion: ArFSLocalFile = await getDb.getPreviousFileVersionFromSyncTable(
						folderToCreate.entity.entityId
					);
					// If undefined, then there is no previous folder version.
					if (previousFolderVersion === undefined) {
						if (!fs.existsSync(folderToCreate.path)) {
							console.log('Creating new folder from permaweb %s', folderToCreate.path);
							fs.mkdirSync(folderToCreate.path);
						}
					} else if (
						+previousFolderVersion.isLocal === 1 &&
						(folderToCreate.entity.name !== previousFolderVersion.entity.name ||
							folderToCreate.entity.parentFolderId !== previousFolderVersion.entity.parentFolderId)
					) {
						// There is a previous folder version, so we must rename/move it to the latest file path
						// Need error handling here in case file is in use
						fs.renameSync(previousFolderVersion.path, folderToCreate.path);

						// All children of the folder need their paths update in the database
						await common.setFolderChildrenPaths(folderToCreate);

						// Change the older version to not local/ignored since it has been renamed or moved
						await updateDb.updateFileDownloadStatus('0', previousFolderVersion.id); // Mark older version as not local
						await updateDb.setPermaWebFileToCloudOnly(previousFolderVersion.id); // Mark older version as ignored
					} else if (!fs.existsSync(folderToCreate.path)) {
						console.log('Creating new folder from permaweb %s', folderToCreate.path);
						fs.mkdirSync(folderToCreate.path);
					}
					await updateDb.updateFileDownloadStatus('1', folderToCreate.id);
				} else {
					// This is an older version, and we ignore it for now.
					await updateDb.updateFileDownloadStatus('0', folderToCreate.id); // Mark older fodler version as not local and ignored
					await updateDb.setPermaWebFileToCloudOnly(folderToCreate.id); // Mark older folder version as ignored
				}
			} catch (err) {
				// console.log (err)
			}
		});
	}
	// Process any files to download
	if (filesToDownload.length > 0) {
		// There are unsynced files to process
		await common.asyncForEach(filesToDownload, async (fileToDownload: ArFSLocalFile) => {
			// Establish the file path first
			if (fileToDownload.path === '') {
				fileToDownload.path = await common.updateFilePath(fileToDownload);
			}
			// Get the latest file version from the DB so we can download them.  Versions that are not the latest will not be downloaded.
			const latestFileVersion: ArFSLocalFile = await getDb.getLatestFileVersionFromSyncTable(
				fileToDownload.entity.entityId
			);
			try {
				// Check if this file is the latest version
				if (fileToDownload.id === latestFileVersion.id) {
					// Compare against the previous version for a different file name or parent folder
					// If it does then this means there was a rename or move, and then we do not download a new file, rather rename/move the old
					const previousFileVersion: ArFSLocalFile = await getDb.getPreviousFileVersionFromSyncTable(
						fileToDownload.entity.entityId
					);

					// If undefined, then there is no previous file version.
					if (previousFileVersion === undefined) {
						// Does this exact file already exist locally?  If not, then we download it
						if (!common.checkFileExistsSync(fileToDownload.path)) {
							// File is not local, so we download and decrypt if necessary
							// UPDATE THIS TO NOT TRY TO SET LOCAL TIME
							await downloadArDriveFileByTx(user, fileToDownload);
							const currentDate = new Date();
							const lastModifiedDate = new Date(Number(fileToDownload.entity.lastModifiedDate));
							fs.utimesSync(fileToDownload.path, currentDate, lastModifiedDate);
						} else {
							console.log('%s is already local, skipping download', fileToDownload.path);
						}
					}
					// Check if this is an older version i.e. same file name/parent folder.
					else if (
						+previousFileVersion.isLocal === 1 &&
						(fileToDownload.entity.name !== previousFileVersion.entity.entityId ||
							fileToDownload.entity.parentFolderId !== previousFileVersion.entity.parentFolderId)
					) {
						// Need error handling here in case file is in use
						fs.renameSync(previousFileVersion.path, fileToDownload.path);

						// Change the older version to not local/ignored since it has been renamed or moved
						await updateDb.updateFileDownloadStatus('0', previousFileVersion.id); // Mark older version as not local
						await updateDb.setPermaWebFileToCloudOnly(previousFileVersion.id); // Mark older version as ignored
						// This is a new file version
					} else {
						// Does this exact file already exist locally?  If not, then we download it
						if (
							!common.checkExactFileExistsSync(
								fileToDownload.path,
								fileToDownload.entity.lastModifiedDate
							)
						) {
							// Download and decrypt the file if necessary
							await downloadArDriveFileByTx(user, fileToDownload);
							const currentDate = new Date();
							const lastModifiedDate = new Date(Number(fileToDownload.entity.lastModifiedDate));
							fs.utimesSync(fileToDownload.path, currentDate, lastModifiedDate);
						} else {
							console.log('%s is already local, skipping download', fileToDownload.path);
						}
					}

					// Hash the file and update it in the database
					const fileHash = await checksumFile(fileToDownload.path);
					await updateDb.updateFileHashInSyncTable(fileHash, fileToDownload.id);

					// Update the file's local status in the database
					await updateDb.updateFileDownloadStatus('1', fileToDownload.id);

					return 'Downloaded';
				} else {
					// This is an older version, and we ignore it for now.
					await updateDb.updateFileDownloadStatus('0', fileToDownload.id); // Mark older version as not local
					await updateDb.setPermaWebFileToCloudOnly(fileToDownload.id); // Mark older version as ignored
				}
				return 'Checked file';
			} catch (err) {
				// console.log (err)
				console.log('Error downloading file %s to %s', fileToDownload.entity.name, fileToDownload.path);
				return 'Error downloading file';
			}
		});
	}
	// Process any previously conflicting file downloads
	if (fileConflictsToDownload.length > 0) {
		await common.asyncForEach(fileConflictsToDownload, async (fileConflictToDownload: ArFSLocalFile) => {
			// This file is on the Permaweb, but it is not local or the user wants to overwrite the local file
			console.log('Overwriting local file %s', fileConflictToDownload.path);
			await downloadArDriveFileByTx(user, fileConflictToDownload);
			// Ensure the file downloaded has the same lastModifiedDate as before
			const currentDate = new Date();
			const lastModifiedDate = new Date(Number(fileConflictToDownload.entity.lastModifiedDate));
			fs.utimesSync(fileConflictToDownload.path, currentDate, lastModifiedDate);
			await updateDb.updateFileDownloadStatus('1', fileConflictToDownload.id);
			return 'File Overwritten';
		});
	}

	// Run some other processes to ensure downloaded files are set properly
	await common.setAllFolderHashes();
	await common.setAllFileHashes();
	await common.setAllParentFolderIds();
	await common.setAllFolderSizes();
	await common.checkForMissingLocalFiles();

	return 'Downloaded all ArDrive files';
}

// Gets all Private and Public Drives associated with a user profile and adds to the database
export async function getAllMyPersonalDrives(user: ArDriveUser): Promise<ArFSDriveEntity[]> {
	console.log('---Getting all your Personal Drives---');
	// Get the last block height that has been synced
	let lastBlockHeight = await getDb.getProfileLastBlockHeight(user.login);
	let privateDrives: ArFSPrivateDriveEntity[] = [];
	let publicDrives: ArFSDriveEntity[] = [];

	// If undefined, by default we sync from block 0
	if (lastBlockHeight === undefined) {
		lastBlockHeight = 0;
	} else {
		lastBlockHeight = lastBlockHeight.lastBlockHeight;
	}

	// Get all private and public drives since last block height
	try {
		const privateDriveResult = await gql.getAllPrivateDriveEntities(user.login, lastBlockHeight);
		if (typeof privateDriveResult != 'string') {
			privateDrives = privateDriveResult;
		}
		if (privateDrives.length > 0) {
			await common.asyncForEach(privateDrives, async (privateDrive: ArFSLocalDriveEntity) => {
				const isDriveMetaDataSynced = await getDb.getDriveFromDriveTable(privateDrive.entity.driveId);
				if (!isDriveMetaDataSynced) {
					await updateDb.addDriveToDriveTable(privateDrive);
				}
			});
		}
		const publicDriveResult = await gql.getAllPublicDriveEntities(user.login, lastBlockHeight);
		if (typeof publicDriveResult != 'string') {
			publicDrives = publicDriveResult;
		}
		if (publicDrives.length > 0) {
			await common.asyncForEach(publicDrives, async (publicDrive: ArFSLocalDriveEntity) => {
				const isDriveMetaDataSynced = await getDb.getDriveFromDriveTable(publicDrive.entity.driveId);
				if (!isDriveMetaDataSynced) {
					await updateDb.addDriveToDriveTable(publicDrive);
				}
			});
		}
		// Get and set the latest block height for the profile that has been synced
		const latestBlockHeight: number = await getLatestBlockHeight();
		await updateDb.setProfileLastBlockHeight(latestBlockHeight, user.login);

		return publicDrives.concat(privateDrives);
	} catch (err) {
		console.log(err);
		console.log('Error getting all Personal Drives');
		return publicDrives;
	}
}
