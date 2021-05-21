import * as arweave from './public/arweave';
import * as types from './types/base_Types';
import * as updateDb from './db/db_update';
import * as getDb from './db/db_get';
import * as common from './common';
import { DataItemJson } from 'arweave-bundles';
import {
	createArFSFileDataItem,
	createArFSFileMetaDataItem,
	uploadArFSDataBundle,
	uploadArFSDriveMetaData,
	uploadArFSFileData,
	uploadArFSFileMetaData
} from './public/arfs';

// Uploads all queued files as v2 transactions (files bigger than 50mb) and data bundles (capped at 50mb)
export async function uploadArDriveFilesAndBundles(user: types.ArDriveUser): Promise<string> {
	try {
		const items: DataItemJson[] = [];
		let filesUploaded = 0;
		let bundledFilesUploaded = 0;
		let totalARPrice = 0;
		let totalSize = 0;
		let moreItems = 0;
		console.log('---Uploading All Queued Files and Folders---');
		const filesToUpload: types.ArFSFileMetaData[] = getDb.getFilesToUploadFromSyncTable(user.login);

		// Only process files if there are files queued
		for (let n = 0; n < Object.keys(filesToUpload).length; ++n) {
			// Process all file entitites
			if (filesToUpload[n].entityType === 'file') {
				// If the total size of the item is greater than 50MB, then we send standard V2 transactions for data and metadata
				if (+filesToUpload[n].fileDataSyncStatus === 1 && filesToUpload[n].fileSize >= 50000000) {
					console.log('Preparing large file - %s', filesToUpload[n].fileName);
					const uploadedFile = await uploadArFSFileData(user, filesToUpload[n]);
					filesToUpload[n].dataTxId = uploadedFile.dataTxId;
					totalARPrice += uploadedFile.arPrice; // Sum up all of the fees paid
					await uploadArFSFileMetaData(user, filesToUpload[n]);
					filesUploaded += 1;
				}
				// If fileDataSync is 1 and we have not exceeded our 50MB max bundle size, then we submit file data and metadata as a bundle
				else if (+filesToUpload[n].fileDataSyncStatus === 1 && totalSize < 50000000) {
					console.log('Preparing smaller file - %s', filesToUpload[n].fileName);
					const fileDataItem: DataItemJson | null = await createArFSFileDataItem(user, filesToUpload[n]);
					if (fileDataItem !== null) {
						// Get the price of this upload
						const winston = await arweave.getWinston(filesToUpload[n].fileSize);
						totalSize += filesToUpload[n].fileSize;
						totalARPrice += +winston * 0.000000000001; // Sum up all of the fees paid
						filesToUpload[n].dataTxId = fileDataItem.id;
						items.push(fileDataItem);
						bundledFilesUploaded += 1;
					}
					const fileMetaDataItem = await createArFSFileMetaDataItem(user, filesToUpload[n]);
					if (fileMetaDataItem !== null) {
						items.push(fileMetaDataItem);
					}
					// If only metaDataSync is 1, then we only submit file metadata
				} else if (+filesToUpload[n].fileMetaDataSyncStatus === 1) {
					console.log('Preparing file metadata only - %s', filesToUpload[n].fileName);
					const fileMetaDataItem = await createArFSFileMetaDataItem(user, filesToUpload[n]);
					if (fileMetaDataItem !== null) {
						items.push(fileMetaDataItem);
						bundledFilesUploaded += 1;
					}
				}
			}
			// If this is a folder, we create folder metadata as a bundle
			else if (filesToUpload[n].entityType === 'folder') {
				const folderMetaDataItem = await createArFSFileMetaDataItem(user, filesToUpload[n]);
				if (folderMetaDataItem !== null) {
					items.push(folderMetaDataItem);
					bundledFilesUploaded += 1;
				}
			}
			// If we have exceeded the total size of the bundle, we stop processing items and submit the bundle
			if (totalSize > 50000000) {
				console.log('Max data bundle size reached %s', totalSize);
				n = Object.keys(filesToUpload).length;
				moreItems = 1;
			}
		}

		// Submit the master bundled transaction
		if (bundledFilesUploaded > 0) {
			console.log('Submitting a bundled TX for %s file(s)', bundledFilesUploaded);
			const bundledDataTxId = await uploadArFSDataBundle(user, items);

			// Update all files/folders with the bundled TX ID that were submitted as part of this bundle
			for (let n = 0; n < bundledFilesUploaded; ++n) {
				await updateDb.updateFileBundleTxId(bundledDataTxId, filesToUpload[n].id);
			}
		}

		// If any bundles or large files have been uploaded, we send the ArDrive Profit Sharing Tip and create drive transaction if necessary
		if (bundledFilesUploaded > 0 || filesUploaded > 0) {
			// Send the tip to a random ArDrive community member
			await arweave.sendArDriveFee(user.walletPrivateKey, totalARPrice);
			const totalUSDPrice = totalARPrice * (await common.getArUSDPrice());
			console.log(
				'Uploaded %s file(s) (totaling %s AR, %s USD) to your ArDrive!',
				filesUploaded + bundledFilesUploaded,
				totalARPrice,
				totalUSDPrice
			);

			// Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
			// Check for unsynced drive entities and create if necessary
			const newDrives: types.ArFSFileMetaData[] = getDb.getNewDrivesFromDriveTable(user.login);
			if (newDrives.length > 0) {
				console.log('   Wow that was your first ARDRIVE Transaction!  Congrats!');
				console.log(
					'   Lets finish setting up your profile by submitting a few more small transactions to the network.'
				);
				await common.asyncForEach(newDrives, async (newDrive: types.ArFSDriveMetaData) => {
					// Create the Drive metadata transaction as submit as V2
					const success = await uploadArFSDriveMetaData(user, newDrive);
					if (success) {
						// Create the Drive Root folder and submit as V2 transaction
						const driveRootFolder: types.ArFSFileMetaData = await getDb.getDriveRootFolderFromSyncTable(
							newDrive.rootFolderId
						);
						await uploadArFSFileMetaData(user, driveRootFolder);
					}
				});
			}
		}

		// If not all files have been uploaded in this batch due to hitting max bundle size, we start a new batch of data items
		if (moreItems === 1) {
			await uploadArDriveFilesAndBundles(user);
		}

		return 'SUCCESS';
	} catch (err) {
		console.log(err);
		return 'ERROR processing files';
	}
}

// Uploads all queued files as data bundles ONLY with no v2 transactions
export async function uploadArDriveBundles(user: types.ArDriveUser): Promise<string> {
	try {
		const items: DataItemJson[] = [];
		let filesUploaded = 0;
		let totalPrice = 0;
		let totalSize = 0;
		console.log('---Uploading All Queued Files and Folders---');
		const filesToUpload: types.ArFSFileMetaData[] = getDb.getFilesToUploadFromSyncTable(user.login);
		if (Object.keys(filesToUpload).length > 0) {
			await common.asyncForEach(filesToUpload, async (fileToUpload: types.ArFSFileMetaData) => {
				// If the total size of the items is greater than 2GB, then we do not add any more files
				if (fileToUpload.entityType === 'file') {
					console.log('Preparing file - %s', fileToUpload.fileName);
					// If fileDataSync is 1 and we have not exceeded our 2GB max bundle size, then we submit file data AND metadata
					if (+fileToUpload.fileDataSyncStatus === 1 && totalSize <= 2000000000) {
						const fileDataItem: DataItemJson | null = await createArFSFileDataItem(user, fileToUpload);
						if (fileDataItem !== null) {
							// Get the price of this upload
							const winston = await arweave.getWinston(fileToUpload.fileSize);
							totalSize += fileToUpload.fileSize;
							totalPrice += +winston * 0.000000000001; // Sum up all of the fees paid
							fileToUpload.dataTxId = fileDataItem.id;
							items.push(fileDataItem);
							filesUploaded += 1;
						}
						const fileMetaDataItem = await createArFSFileMetaDataItem(user, fileToUpload);
						if (fileMetaDataItem !== null) {
							items.push(fileMetaDataItem);
						}
						// If only metaDataSync is 1, then we only submit file metadata
					} else if (+fileToUpload.fileMetaDataSyncStatus === 1) {
						const fileMetaDataItem = await createArFSFileMetaDataItem(user, fileToUpload);
						if (fileMetaDataItem !== null) {
							items.push(fileMetaDataItem);
							filesUploaded += 1;
						}
					}
				}
				// If this is a folder, we create folder metadata
				else if (fileToUpload.entityType === 'folder') {
					const folderMetaDataItem = await createArFSFileMetaDataItem(user, fileToUpload);
					if (folderMetaDataItem !== null) {
						items.push(folderMetaDataItem);
						filesUploaded += 1;
					}
				}
			});
		}

		if (filesUploaded > 0) {
			// Submit the master bundled transaction
			console.log('Submitting a bundled TX for %s file(s)', filesUploaded);
			const bundledDataTxId = await uploadArFSDataBundle(user, items);

			if (bundledDataTxId !== 'Error') {
				// Update all files/folders with the bundled TX ID that were submitted as part of this bundle
				for (let n = 0; n < filesUploaded; ++n) {
					await updateDb.updateFileBundleTxId(bundledDataTxId, filesToUpload[n].id);
				}

				// Send the tip to the ArDrive community
				await arweave.sendArDriveFee(user.walletPrivateKey, totalPrice);
				console.log('Uploaded %s file(s) (totaling %s AR) to your ArDrive!', filesUploaded, totalPrice);
			}

			// Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
			// Check for unsynced drive entitcies and create if necessary
			const newDrives: types.ArFSFileMetaData[] = getDb.getNewDrivesFromDriveTable(user.login);
			if (newDrives.length > 0) {
				console.log('   Wow that was your first ARDRIVE Transaction!  Congrats!');
				console.log(
					'   Lets finish setting up your profile by submitting a few more small transactions to the network.'
				);
				await common.asyncForEach(newDrives, async (newDrive: types.ArFSDriveMetaData) => {
					// Create the Drive metadata transaction as submit as V2
					const success = await uploadArFSDriveMetaData(user, newDrive);
					if (success) {
						// Create the Drive Root folder and submit as V2 transaction
						const driveRootFolder: types.ArFSFileMetaData = await getDb.getDriveRootFolderFromSyncTable(
							newDrive.rootFolderId
						);
						await uploadArFSFileMetaData(user, driveRootFolder);
					}
				});
			}
		}
		return 'SUCCESS';
	} catch (err) {
		console.log(err);
		return 'ERROR processing files';
	}
}
