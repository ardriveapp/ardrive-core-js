import { arweave, sendArDriveFee } from './public/arweave';
import * as types from './types/base_Types';
import * as updateDb from './db/db_update';
import * as getDb from './db/db_get';
import * as common from './common';
import ArweaveBundles, { DataItemJson } from 'arweave-bundles';
import {
	createArFSFileDataItem,
	createArFSFileMetaDataItem,
	uploadArFSDataBundle,
	uploadArFSDriveMetaData,
	uploadArFSFileData,
	uploadArFSFileMetaData
} from './public/arfs';
import { ArFSFileData, ArFSFileFolderEntity, JWKInterface } from './types/arfs_Types';
import Transaction from 'arweave/node/lib/transaction';
import { appName, appVersion, arFSVersion } from './constants';
import Arweave from 'arweave';
import deepHash from 'arweave/node/lib/deepHash';
import { getWinston } from './node';

// Initialize the arweave-bundles API used for ANS102 Transactions
const deps = {
	utils: Arweave.utils,
	crypto: Arweave.crypto,
	deepHash: deepHash
};

// Arweave Bundles are used for ANS102 Transactions
const arBundles = ArweaveBundles(deps);

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
						const winston = await getWinston(filesToUpload[n].fileSize);
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
			await sendArDriveFee(user.walletPrivateKey, totalARPrice);
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
							const winston = await getWinston(fileToUpload.fileSize);
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
				await sendArDriveFee(user.walletPrivateKey, totalPrice);
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
// Creates an arweave data item transaction (ANS-102) using ArFS Tags
export async function createFileDataItemTransaction(
	fileData: Buffer,
	fileMetaData: ArFSFileData,
	walletPrivateKey: JWKInterface
): Promise<DataItemJson | string> {
	try {
		// Create the item using the data buffer
		const item = await arBundles.createData({ data: fileData }, walletPrivateKey);

		// Tag file with common tags
		arBundles.addTag(item, 'App-Name', fileMetaData.appName);
		arBundles.addTag(item, 'App-Version', fileMetaData.appVersion);
		// Only tag the file with public tags
		arBundles.addTag(item, 'Content-Type', fileMetaData.contentType);

		// Sign the data, ready to be added to a bundle
		const signedItem = await arBundles.sign(item, walletPrivateKey);
		return signedItem;
	} catch (err) {
		console.log('Error creating data item');
		console.log(err);
		return 'Error';
	}
}

// Creates an arweave data item transaction (ANS-102) using ArFS Tags
export async function createFileFolderMetaDataItemTransaction(
	metaData: ArFSFileFolderEntity,
	secondaryFileMetaData: string,
	walletPrivateKey: JWKInterface
): Promise<DataItemJson | string> {
	try {
		// Create the item using the data buffer or string
		const item = await arBundles.createData({ data: secondaryFileMetaData }, walletPrivateKey);

		// Tag file
		arBundles.addTag(item, 'App-Name', metaData.appName);
		arBundles.addTag(item, 'App-Version', metaData.appVersion);
		arBundles.addTag(item, 'Unix-Time', metaData.unixTime.toString());
		arBundles.addTag(item, 'Content-Type', 'application/json');
		arBundles.addTag(item, 'ArFS', arFSVersion);
		arBundles.addTag(item, 'Entity-Type', metaData.entityType);
		arBundles.addTag(item, 'Drive-Id', metaData.driveId);
		arBundles.addTag(item, 'File-Id', metaData.entityId);

		// Add file or folder specific tags
		if (metaData.entityType === 'file') {
			arBundles.addTag(item, 'File-Id', metaData.entityId);
			arBundles.addTag(item, 'Parent-Folder-Id', metaData.parentFolderId);
		} else {
			arBundles.addTag(item, 'Folder-Id', metaData.entityId);
			if (metaData.parentFolderId !== '0') {
				// If the parentFolderId is 0, then this is a root folder
				arBundles.addTag(item, 'Parent-Folder-Id', metaData.parentFolderId);
			}
		}

		// Sign the data, ready to be added to a bundle
		const signedItem = await arBundles.sign(item, walletPrivateKey);
		return signedItem;
	} catch (err) {
		console.log('Error creating data item');
		console.log(err);
		return 'Error';
	}
}

// Creates a bundled data transaction (ANS-102)
export async function createBundledDataTransaction(
	walletPrivateKey: JWKInterface,
	items: DataItemJson[]
): Promise<Transaction | null> {
	try {
		// Bundle up all individual items into a single data bundle
		const dataBundle = await arBundles.bundleData(items);
		const dataBuffer: Buffer = Buffer.from(JSON.stringify(dataBundle));

		// Create the transaction for the entire data bundle
		const transaction = await arweave.createTransaction({ data: dataBuffer }, walletPrivateKey);

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Bundle-Format', 'json');
		transaction.addTag('Bundle-Version', '1.0.0');
		transaction.addTag('Content-Type', 'application/json');

		// Sign the bundle
		await arweave.transactions.sign(transaction, walletPrivateKey);
		return transaction;
	} catch (err) {
		console.log('Error creating data bundle');
		console.log(err);
		return null;
	}
}
