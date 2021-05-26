import * as types from './types/base_Types';
import * as updateDb from './db/db_update';
import * as getDb from './db/db_get';
import * as common from './common';
import { deleteFromSyncTable } from './db/db_delete';
import { getTransactionStatus } from './gateway';
import { getArDriveFee } from './smartweave';
import fetch from 'node-fetch';

// Gets the price of AR based on amount of data
export async function getWinston(bytes: number): Promise<number> {
	const response = await fetch(`https://arweave.net/price/${bytes}`);
	// const response = await fetch(`https://perma.online/price/${bytes}`);
	const winston = await response.json();
	return winston;
}

// Scans through the queue & checks if a file has been mined, and if it has moves to Completed Table. If a file is not on the permaweb it will be uploaded
export async function checkUploadStatus(login: string): Promise<string> {
	try {
		console.log('---Checking Upload Status---');
		let permaWebLink: string;
		let status: number;

		// Get all data bundles that need to have their V2 transactions checked (bundleSyncStatus of 2)
		const unsyncedBundles: types.ArDriveBundle[] = getDb.getAllUploadedBundlesFromBundleTable(login);
		await common.asyncForEach(unsyncedBundles, async (unsyncedBundle: types.ArDriveBundle) => {
			status = await getTransactionStatus(unsyncedBundle.bundleTxId);
			// Status 200 means the file has been mined
			if (status === 200) {
				console.log('SUCCESS! Data bundle was uploaded with TX of %s', unsyncedBundle.bundleTxId);
				console.log('...your most recent files can now be accessed on the PermaWeb!');
				await updateDb.completeBundleFromBundleTable(unsyncedBundle.id);
				const dataItemsToComplete: types.ArFSFileMetaData[] = getDb.getAllUploadedDataItemsFromSyncTable(
					login,
					unsyncedBundle.bundleTxId
				);
				await common.asyncForEach(dataItemsToComplete, async (dataItemToComplete: types.ArFSFileMetaData) => {
					permaWebLink = common.gatewayURL.concat(dataItemToComplete.dataTxId);
					// Complete the files by setting permaWebLink, fileMetaDataSyncStatus and fileDataSyncStatus to 3
					await updateDb.completeFileDataItemFromSyncTable(permaWebLink, dataItemToComplete.id);
				});
				// Status 202 means the file is being mined
			} else if (status === 202) {
				console.log(
					'%s data bundle is still being uploaded to the PermaWeb (TX_PENDING)',
					unsyncedBundle.bundleTxId
				);
				// Status 410 or 404 means the file is still being processed.  If 410/404 occurs after 30 minutes, then the transaction has been orphaned/failed
			} else if (status === 410 || status === 404) {
				const uploadTime = await getDb.getBundleUploadTimeFromBundleTable(unsyncedBundle.id);
				const currentTime = Math.round(Date.now() / 1000);
				if (currentTime - uploadTime < 1800000) {
					// 30 minutes
					console.log('%s data bundle failed to be uploaded (TX_FAILED)', unsyncedBundle.bundleTxId);

					// Since it failed, lets retry data transaction by flipping the sync status to 1
					const dataItemsToRetry: types.ArFSFileMetaData[] = getDb.getAllUploadedDataItemsFromSyncTable(
						login,
						unsyncedBundle.bundleTxId
					);
					await common.asyncForEach(dataItemsToRetry, async (dataItemToRetry: types.ArFSFileMetaData) => {
						// Retry the files by setting fileMetaDataSyncStatus and fileDataSyncStatus to 1
						await updateDb.setFileDataItemSyncStatus(dataItemToRetry.id);
					});
				}
			}
		});

		// Gets all V2 transactions that need to have their transactions checked (fileDataSyncStatus or metaDataSyncStatus of 2)
		const unsyncedFiles: types.ArFSFileMetaData[] = getDb.getAllUploadedFilesFromSyncTable(login);
		await common.asyncForEach(unsyncedFiles, async (unsyncedFile: types.ArFSFileMetaData) => {
			// Is the file data uploaded on the web?
			if (+unsyncedFile.fileDataSyncStatus === 2) {
				status = await getTransactionStatus(unsyncedFile.dataTxId);
				if (status === 200) {
					permaWebLink = common.gatewayURL.concat(unsyncedFile.dataTxId);
					console.log(
						'SUCCESS! %s data was uploaded with TX of %s',
						unsyncedFile.filePath,
						unsyncedFile.dataTxId
					);
					console.log('...you can access the file here %s', common.gatewayURL.concat(unsyncedFile.dataTxId));
					const fileToComplete = {
						fileDataSyncStatus: 3,
						permaWebLink,
						id: unsyncedFile.id
					};
					await updateDb.completeFileDataFromSyncTable(fileToComplete);
				} else if (status === 202) {
					console.log('%s data is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
				} else if (status === 410 || status === 404) {
					const uploadTime = await getDb.getFileUploadTimeFromSyncTable(unsyncedFile.id);
					const currentTime = Math.round(Date.now() / 1000);
					if (currentTime - uploadTime < 1800000) {
						// 30 minutes
						console.log('%s data failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
						// Retry data transaction
						await updateDb.setFileDataSyncStatus(1, unsyncedFile.id);
					}
				}
			}

			// Is the file metadata uploaded on the web?
			if (+unsyncedFile.fileMetaDataSyncStatus === 2) {
				status = await getTransactionStatus(unsyncedFile.metaDataTxId);
				if (status === 200) {
					permaWebLink = common.gatewayURL.concat(unsyncedFile.dataTxId);
					console.log(
						'SUCCESS! %s metadata was uploaded with TX of %s',
						unsyncedFile.filePath,
						unsyncedFile.metaDataTxId
					);
					const fileMetaDataToComplete = {
						fileMetaDataSyncStatus: 3,
						permaWebLink,
						id: unsyncedFile.id
					};
					await updateDb.completeFileMetaDataFromSyncTable(fileMetaDataToComplete);
				} else if (status === 202) {
					console.log(
						'%s metadata is still being uploaded to the PermaWeb (TX_PENDING)',
						unsyncedFile.filePath
					);
				} else if (status === 410 || status === 404) {
					const uploadTime = await getDb.getFileUploadTimeFromSyncTable(unsyncedFile.id);
					const currentTime = Math.round(Date.now() / 1000);
					if (currentTime - uploadTime < 1800000) {
						// 30 minutes
						console.log('%s metadata failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
						// Retry metadata transaction
						await updateDb.setFileMetaDataSyncStatus(1, unsyncedFile.id);
					}
				}
			}
		});

		// Get all drives that need to have their transactions checked (metaDataSyncStatus of 2)
		const unsyncedDrives: types.ArFSDriveMetaData[] = getDb.getAllUploadedDrivesFromDriveTable();
		await common.asyncForEach(unsyncedDrives, async (unsyncedDrive: types.ArFSDriveMetaData) => {
			status = await getTransactionStatus(unsyncedDrive.metaDataTxId);
			if (status === 200) {
				console.log(
					'SUCCESS! %s Drive metadata was uploaded with TX of %s',
					unsyncedDrive.driveName,
					unsyncedDrive.metaDataTxId
				);
				// Update the drive sync status to 3 so it is not checked any more
				const metaDataSyncStatus = 3;
				await updateDb.completeDriveMetaDataFromDriveTable(metaDataSyncStatus, unsyncedDrive.driveId);
			} else if (status === 202) {
				console.log(
					'%s Drive metadata is still being uploaded to the PermaWeb (TX_PENDING)',
					unsyncedDrive.driveName
				);
			} else if (status === 410 || status === 404) {
				console.log('%s Drive metadata failed to be uploaded (TX_FAILED)', unsyncedDrive.driveName);
				// Retry metadata transaction
				await updateDb.setFileMetaDataSyncStatus(1, unsyncedDrive.id);
			}
		});

		return 'Success checking upload file, folder and drive sync status';
	} catch (err) {
		console.log(err);
		return 'Error checking upload file status';
	}
}

// Grabs all files in the database for a user and determines the cost of all files/folders ready to be uploaded
export async function getPriceOfNextUploadBatch(login: string): Promise<types.UploadBatch> {
	let totalWinstonData = 0;
	let totalArweaveMetadataPrice = 0;
	let totalSize = 0;
	let winston = 0;
	const uploadBatch: types.UploadBatch = {
		totalArDrivePrice: 0,
		totalUSDPrice: 0,
		totalSize: '0',
		totalNumberOfFileUploads: 0,
		totalNumberOfMetaDataUploads: 0,
		totalNumberOfFolderUploads: 0
	};

	// Get all files that are ready to be uploaded
	const filesToUpload: types.ArFSFileMetaData[] = getDb.getFilesToUploadFromSyncTable(login);
	if (Object.keys(filesToUpload).length > 0) {
		// Estimate the size by getting the size of 1MB
		const priceFor1MB = await getWinston(1000000);
		const pricePerByte = priceFor1MB / 1003210;

		// Calculate the size/price for each file/folder
		await common.asyncForEach(filesToUpload, async (fileToUpload: types.ArFSFileMetaData) => {
			// If the file doesnt exist, we must remove it from the Sync table and not include it in our upload price
			if (!common.checkFileExistsSync(fileToUpload.filePath)) {
				console.log('%s is not local anymore.  Removing from the queue.', fileToUpload.filePath);
				await deleteFromSyncTable(fileToUpload.id);
				return 'File not local anymore';
			}
			// Calculate folders that are ready to be uploaded, but have no TX already
			if (+fileToUpload.fileMetaDataSyncStatus === 1 && fileToUpload.entityType === 'folder') {
				totalArweaveMetadataPrice += 0.0000005; // Ths is the price we assume it costs for a metadata tx
				uploadBatch.totalNumberOfFolderUploads += 1;
			}
			// If this is a file we calculate the cost and add up the size.  We do not bundle/approve more than 2GB of data at a time
			if (
				+fileToUpload.fileDataSyncStatus === 1 &&
				fileToUpload.entityType === 'file' &&
				totalSize <= 2000000000
			) {
				totalSize += +fileToUpload.fileSize;
				//winston = await getWinston(fileToUpload.fileSize);
				winston = (fileToUpload.fileSize + 3210) * pricePerByte;
				totalWinstonData += +winston + 0.0000005;
				uploadBatch.totalNumberOfFileUploads += 1;
			}
			if (+fileToUpload.fileMetaDataSyncStatus === 1 && fileToUpload.entityType === 'file') {
				totalArweaveMetadataPrice += 0.0000005;
				uploadBatch.totalNumberOfMetaDataUploads += 1;
			}
			return 'Calculated price';
		});

		// Calculate the total price for all files/folders
		const totalArweaveDataPrice = totalWinstonData * 0.000000000001;

		// Add the ArDrive fee
		let arDriveFee = +totalArweaveDataPrice.toFixed(9) * ((await getArDriveFee()) / 100);
		if (arDriveFee < 0.00001 && totalArweaveDataPrice > 0) {
			arDriveFee = 0.00001;
		}

		// Prepare the upload batch
		uploadBatch.totalArDrivePrice = +totalArweaveDataPrice.toFixed(9) + arDriveFee + totalArweaveMetadataPrice;
		uploadBatch.totalUSDPrice = uploadBatch.totalArDrivePrice * (await common.getArUSDPrice());
		uploadBatch.totalSize = common.formatBytes(totalSize);

		return uploadBatch;
	}
	return uploadBatch;
}
