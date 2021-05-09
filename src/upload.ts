import * as fs from 'fs';
import * as arweave from './arweave';
import * as types from './types/base_Types';
import * as updateDb from './db_update';
import * as getDb from './db_get';
import * as common from './common';
import { deriveDriveKey, deriveFileKey, driveEncrypt, fileEncrypt, getFileAndEncrypt } from './crypto';
import { deleteFromSyncTable } from './db_delete';
import { DataItemJson } from 'arweave-bundles';

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
async function createArFSFileDataItem(
	user: types.ArDriveUser,
	fileToUpload: types.ArFSFileMetaData
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
			const encryptedData: types.ArFSEncryptedData = await getFileAndEncrypt(fileKey, fileToUpload.filePath);

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
async function createArFSFileMetaDataItem(
	user: types.ArDriveUser,
	fileToUpload: types.ArFSFileMetaData
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
			// Public file, do not encrypt
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileToUpload, secondaryFileMetaDataJSON);
		} else {
			// Private file, so it must be encrypted
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToUpload.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await deriveFileKey(fileToUpload.fileId, driveKey);
			const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

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
async function uploadArFSFileData(
	user: types.ArDriveUser,
	fileToUpload: types.ArFSFileMetaData
): Promise<{ dataTxId: string; arPrice: number }> {
	let transaction;
	let dataTxId = '';
	let arPrice = 0;
	try {
		const winston = await arweave.getWinston(fileToUpload.fileSize);
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
			const encryptedData: types.ArFSEncryptedData = await getFileAndEncrypt(fileKey, fileToUpload.filePath);

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
		const uploader = await arweave.createDataUploader(transaction);

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
async function uploadArFSFileMetaData(user: types.ArDriveUser, fileToUpload: types.ArFSFileMetaData) {
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
			const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileToUpload.metaDataCipherIV = encryptedData.cipherIV;
			fileToUpload.cipher = encryptedData.cipher;
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileToUpload, encryptedData.data);
		}

		// Update the file's data transaction ID
		fileToUpload.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

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
async function uploadArFSDriveMetaData(user: types.ArDriveUser, drive: types.ArFSDriveMetaData): Promise<boolean> {
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
			const encryptedDriveMetaData: types.ArFSEncryptedData = await driveEncrypt(
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
		const uploader = await arweave.createDataUploader(transaction);

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
async function uploadArFSDataBundle(user: types.ArDriveUser, dataItems: DataItemJson[]): Promise<string> {
	try {
		const bundledDataTx = await arweave.prepareArFSBundledDataTransaction(user, dataItems);
		if (bundledDataTx !== null) {
			const uploader = await arweave.createDataUploader(bundledDataTx);

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

// Scans through the queue & checks if a file has been mined, and if it has moves to Completed Table. If a file is not on the permaweb it will be uploaded
export async function checkUploadStatus(login: string): Promise<string> {
	try {
		console.log('---Checking Upload Status---');
		let permaWebLink: string;
		let status: number;

		// Get all data bundles that need to have their V2 transactions checked (bundleSyncStatus of 2)
		const unsyncedBundles: types.ArDriveBundle[] = await getDb.getAllUploadedBundlesFromBundleTable(login);
		await common.asyncForEach(unsyncedBundles, async (unsyncedBundle: types.ArDriveBundle) => {
			status = await arweave.getTransactionStatus(unsyncedBundle.bundleTxId);
			// Status 200 means the file has been mined
			if (status === 200) {
				console.log('SUCCESS! Data bundle was uploaded with TX of %s', unsyncedBundle.bundleTxId);
				console.log('...your most recent files can now be accessed on the PermaWeb!');
				await updateDb.completeBundleFromBundleTable(unsyncedBundle.id);
				const dataItemsToComplete: types.ArFSFileMetaData[] = await getDb.getAllUploadedDataItemsFromSyncTable(
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
					const dataItemsToRetry: types.ArFSFileMetaData[] = await getDb.getAllUploadedDataItemsFromSyncTable(
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
		const unsyncedFiles: types.ArFSFileMetaData[] = await getDb.getAllUploadedFilesFromSyncTable(login);
		await common.asyncForEach(unsyncedFiles, async (unsyncedFile: types.ArFSFileMetaData) => {
			// Is the file data uploaded on the web?
			if (+unsyncedFile.fileDataSyncStatus === 2) {
				status = await arweave.getTransactionStatus(unsyncedFile.dataTxId);
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
				status = await arweave.getTransactionStatus(unsyncedFile.metaDataTxId);
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
		const unsyncedDrives: types.ArFSDriveMetaData[] = await getDb.getAllUploadedDrivesFromDriveTable();
		await common.asyncForEach(unsyncedDrives, async (unsyncedDrive: types.ArFSDriveMetaData) => {
			status = await arweave.getTransactionStatus(unsyncedDrive.metaDataTxId);
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
	const filesToUpload: types.ArFSFileMetaData[] = await getDb.getFilesToUploadFromSyncTable(login);
	if (Object.keys(filesToUpload).length > 0) {
		// Estimate the size by getting the size of 1MB
		const priceFor1MB = await arweave.getWinston(1000000);
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
		let arDriveFee = +totalArweaveDataPrice.toFixed(9) * ((await arweave.getArDriveFee()) / 100);
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
		const filesToUpload: types.ArFSFileMetaData[] = await getDb.getFilesToUploadFromSyncTable(user.login);

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
			const newDrives: types.ArFSFileMetaData[] = await getDb.getNewDrivesFromDriveTable(user.login);
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
		const filesToUpload: types.ArFSFileMetaData[] = await getDb.getFilesToUploadFromSyncTable(user.login);
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
			const newDrives: types.ArFSFileMetaData[] = await getDb.getNewDrivesFromDriveTable(user.login);
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

// Uploads all queued files as V2 transactions ONLY with no data bundles
export async function uploadArDriveFiles(user: types.ArDriveUser): Promise<string> {
	try {
		let filesUploaded = 0;
		let totalPrice = 0;
		console.log('---Uploading All Queued Files and Folders---');
		const filesToUpload = await getDb.getFilesToUploadFromSyncTable(user.login);
		if (Object.keys(filesToUpload).length > 0) {
			// Ready to upload
			await common.asyncForEach(filesToUpload, async (fileToUpload: types.ArFSFileMetaData) => {
				if (fileToUpload.entityType === 'file') {
					// console.log ("Uploading file - %s", fileToUpload.fileName)
					// Check to see if we have to upload the File Data and Metadata
					// If not, we just check to see if we have to update metadata.
					if (+fileToUpload.fileDataSyncStatus === 1) {
						console.log('Uploading file data and metadata - %s', fileToUpload.fileName);
						const uploadedFile = await uploadArFSFileData(user, fileToUpload);
						fileToUpload.dataTxId = uploadedFile.dataTxId;
						totalPrice += uploadedFile.arPrice; // Sum up all of the fees paid
						await uploadArFSFileMetaData(user, fileToUpload);
					} else if (+fileToUpload.fileMetaDataSyncStatus === 1) {
						console.log('Uploading file metadata only - %s', fileToUpload.fileName);
						await uploadArFSFileMetaData(user, fileToUpload);
					}
				} else if (fileToUpload.entityType === 'folder') {
					console.log('Uploading folder - %s', fileToUpload.fileName);
					await uploadArFSFileMetaData(user, fileToUpload);
				}
				filesUploaded += 1;
			});
		}
		if (filesUploaded > 0) {
			// Send the tip to the ArDrive community
			await arweave.sendArDriveFee(user.walletPrivateKey, totalPrice);
			console.log('Uploaded %s files to your ArDrive!', filesUploaded);

			// Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
			// Check for unsynced drive entities and create if necessary
			const newDrives: types.ArFSFileMetaData[] = await getDb.getNewDrivesFromDriveTable(user.login);
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

// Scans through the queue & checks if a file has been mined, and if it has moves to Completed Table. If a file is not on the permaweb it will be uploaded
/*export const checkUploadStatusWithoutBundles = async (login: string) => {
  try {
	console.log('---Checking Upload Status---');
	let permaWebLink: string;
	let status: any;
	// Get all files and folders that need to have their transactions checked (metaDataSyncStatus of 2)
	const unsyncedFiles : ArFSFileMetaData[] = await getAllUploadedFilesFromSyncTable(login);
	await asyncForEach(
	  unsyncedFiles,
	  async (unsyncedFile : ArFSFileMetaData) => {
		// Is the file data uploaded on the web?
		if (+unsyncedFile.fileDataSyncStatus === 2) {
		  status = await getTransactionStatus(unsyncedFile.dataTxId);
		  if (status === 200) {
			permaWebLink = gatewayURL.concat(unsyncedFile.dataTxId);
			console.log('SUCCESS! %s data was uploaded with TX of %s', unsyncedFile.filePath, unsyncedFile.dataTxId);
			console.log('...you can access the file here %s', gatewayURL.concat(unsyncedFile.dataTxId));
			const fileToComplete = {
			  fileDataSyncStatus: '3',
			  permaWebLink,
			  id: unsyncedFile.id,
			};
			await completeFileDataFromSyncTable(fileToComplete);
		  } else if (status === 202) {
		  console.log('%s data is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
		  } else if (status === 410 || status === 404) {
			const uploadTime = await getFileUploadTimeFromSyncTable(unsyncedFile.id)
			const currentTime = Math.round(Date.now() / 1000);
			if ((currentTime - uploadTime) < 1800000) { // 30 minutes
			  console.log('%s data failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
			  // Retry data transaction
			  await setFileDataSyncStatus ('1', unsyncedFile.id)
			}
		  } else {
			// CHECK IF FILE EXISTS AND IF NOT REMOVE FROM QUEUE
			fs.access(unsyncedFile.filePath, async (err) => {
			  if (err) {
				console.log('%s data was not found locally anymore.  Removing from the queue', unsyncedFile.filePath);
				await removeFromSyncTable(unsyncedFile.id);
			  }
			});
		  }
		}

		// Is the file metadata uploaded on the web?
		if (+unsyncedFile.fileMetaDataSyncStatus === 2) {
		  status = await getTransactionStatus(unsyncedFile.metaDataTxId);
		  if (status === 200) {
			permaWebLink = gatewayURL.concat(unsyncedFile.dataTxId);
			console.log(
			  'SUCCESS! %s metadata was uploaded with TX of %s',
			  unsyncedFile.filePath,
			  unsyncedFile.metaDataTxId,
			);
			const fileMetaDataToComplete = {
			  fileMetaDataSyncStatus: '3',
			  permaWebLink,
			  id: unsyncedFile.id,
			};
			await completeFileMetaDataFromSyncTable(fileMetaDataToComplete);
		  } else if (status === 202) {
		  console.log('%s metadata is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedFile.filePath);
		  } else if (status === 410 || status === 404) {
			const uploadTime = await getFileUploadTimeFromSyncTable(unsyncedFile.id)
			const currentTime = Math.round(Date.now() / 1000);
			if ((currentTime - uploadTime) < 1800000) { // 30 minutes
			  console.log('%s metadata failed to be uploaded (TX_FAILED)', unsyncedFile.filePath);
			  // Retry metadata transaction
			  await setFileMetaDataSyncStatus ('1', unsyncedFile.id)
			}
		  }
		}
	  }
	);

	// Get all drives that need to have their transactions checked (metaDataSyncStatus of 2)
	const unsyncedDrives : ArFSDriveMetaData[] = await getAllUploadedDrivesFromDriveTable();
	await asyncForEach(unsyncedDrives, async (unsyncedDrive: ArFSDriveMetaData) => {
	  status = await getTransactionStatus(unsyncedDrive.metaDataTxId);
	  if (status === 200) {
		permaWebLink = gatewayURL.concat(unsyncedDrive.metaDataTxId);
		console.log(
		  'SUCCESS! %s Drive metadata was uploaded with TX of %s',
		  unsyncedDrive.driveName,
		  unsyncedDrive.metaDataTxId,
		);
		// Update the drive sync status to 3 so it is not checked any more
		let metaDataSyncStatus = 3;
		await completeDriveMetaDataFromDriveTable(metaDataSyncStatus, permaWebLink, unsyncedDrive.driveId);
	  } else if (status === 202) {
		console.log('%s Drive metadata is still being uploaded to the PermaWeb (TX_PENDING)', unsyncedDrive.driveName);
	  } else if (status === 410 || status === 404) {
		console.log('%s Drive metadata failed to be uploaded (TX_FAILED)', unsyncedDrive.driveName);
		// Retry metadata transaction
		await setFileMetaDataSyncStatus ('1', unsyncedDrive.id)
	  }
	})
	return 'Success checking upload file, folder and drive sync status';
  } catch (err) {
	console.log(err);
	return 'Error checking upload file status';
  }
};*/
