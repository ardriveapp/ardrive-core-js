import { asyncForEach, sleep } from './../common';
import { ArDriveUser, ArFSDriveMetaData, ArFSFileMetaData } from './../types/base_Types';
import {
	getDriveRootFolderFromSyncTable,
	getFilesToUploadFromSyncTable,
	getLatestFolderVersionFromSyncTable,
	getNewDrivesFromDriveTable
} from './../db/db_get';
import { setFilePath } from './../db/db_update';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { appName, appVersion, arFSVersion, gatewayURL } from './../constants';
import Arweave from 'arweave';
import deepHash from 'arweave/node/lib/deepHash';
import ArweaveBundles from 'arweave-bundles';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import Transaction from 'arweave/node/lib/transaction';
import path, { dirname } from 'path';
import { createWriteStream } from 'fs';
import Axios from 'axios';
import ProgressBar from 'progress';
import { deriveDriveKey, deriveFileKey, fileDecrypt } from '../crypto';
import { uploadArFSDriveMetaData, uploadArFSFileData, uploadArFSFileMetaData } from './arfs';
import { getArDriveFee, selectTokenHolder } from './../smartweave';
// Initialize Arweave
export const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Initialize the arweave-bundles API used for ANS102 Transactions
const deps = {
	utils: Arweave.utils,
	crypto: Arweave.crypto,
	deepHash: deepHash
};

// Arweave Bundles are used for ANS102 Transactions
const arBundles = ArweaveBundles(deps);

// Creates an arweave transaction to upload file data (and no metadata) to arweave
// Saves the upload chunk of the object in case the upload has to be restarted
export async function uploadDataChunk(uploader: TransactionUploader): Promise<TransactionUploader | null> {
	try {
		await uploader.uploadChunk();
		return uploader;
	} catch (err) {
		console.log('Uploading this chunk has failed');
		console.log(err);
		return null;
	}
}

// Sends a fee to ArDrive Profit Sharing Community holders
export async function sendArDriveFee(walletPrivateKey: string, arPrice: number): Promise<string> {
	try {
		// Get the latest ArDrive Community Fee from the Community Smart Contract
		let fee = arPrice * ((await getArDriveFee()) / 100);

		// If the fee is too small, we assign a minimum
		if (fee < 0.00001) {
			fee = 0.00001;
		}

		// Probabilistically select the PST token holder
		const holder = await selectTokenHolder();

		// send a fee. You should inform the user about this fee and amount.
		const transaction = await arweave.createTransaction(
			{ target: holder, quantity: arweave.ar.arToWinston(fee.toString()) },
			JSON.parse(walletPrivateKey)
		);

		// Tag file with data upload Tipping metadata
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Type', 'fee');
		transaction.addTag('Tip-Type', 'data upload');

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));

		// Submit the transaction
		const response = await arweave.transactions.post(transaction);
		if (response.status === 200 || response.status === 202) {
			// console.log('SUCCESS ArDrive fee of %s was submitted with TX %s to %s', fee.toFixed(9), transaction.id, holder);
		} else {
			// console.log('ERROR submitting ArDrive fee with TX %s', transaction.id);
		}
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'ERROR sending ArDrive fee';
	}
}

//Old functions

// Creates an arweave transaction to upload encrypted private ardrive metadata
// SPLIT INTO createPrivateDriveTransaction and createDriveTransaction
export async function prepareArFSDriveTransaction(
	user: ArDriveUser,
	driveJSON: string | Buffer,
	driveMetaData: ArFSDriveMetaData
): Promise<Transaction> {
	// Create transaction
	const transaction = await arweave.createTransaction({ data: driveJSON }, JSON.parse(user.walletPrivateKey));

	// Tag file with ArFS Tags
	transaction.addTag('App-Name', appName);
	transaction.addTag('App-Version', appVersion);
	transaction.addTag('Unix-Time', driveMetaData.unixTime.toString());
	transaction.addTag('Drive-Id', driveMetaData.driveId);
	transaction.addTag('Drive-Privacy', driveMetaData.drivePrivacy);
	if (driveMetaData.drivePrivacy === 'private') {
		// If the file is private, we use extra tags
		// Tag file with Content-Type, Cipher and Cipher-IV and Drive-Auth-Mode
		transaction.addTag('Content-Type', 'application/octet-stream');
		transaction.addTag('Cipher', driveMetaData.cipher);
		transaction.addTag('Cipher-IV', driveMetaData.cipherIV);
		transaction.addTag('Drive-Auth-Mode', driveMetaData.driveAuthMode);
	} else {
		// Tag file with public tags only
		transaction.addTag('Content-Type', 'application/json');
	}
	transaction.addTag('ArFS', arFSVersion);
	transaction.addTag('Entity-Type', 'drive');

	// Sign file
	await arweave.transactions.sign(transaction, JSON.parse(user.walletPrivateKey));
	return transaction;
}

// This will prepare and sign v2 data transaction using ArFS File Data Tags
// SPLIT INTO createPrivateFileDataTransaction and createFileDataTransaction
export async function prepareArFSDataTransaction(
	user: ArDriveUser,
	fileData: Buffer,
	fileMetaData: ArFSFileMetaData
): Promise<Transaction> {
	// Create the arweave transaction using the file data and private key
	const transaction = await arweave.createTransaction({ data: fileData }, JSON.parse(user.walletPrivateKey));

	// If the file is not public, we must encrypt it
	if (fileMetaData.isPublic === 0) {
		// Tag file with Content-Type, Cipher and Cipher-IV
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Content-Type', 'application/octet-stream');
		transaction.addTag('Cipher', fileMetaData.cipher);
		transaction.addTag('Cipher-IV', fileMetaData.dataCipherIV);
	} else {
		// Tag file with public tags only
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Content-Type', fileMetaData.contentType);
	}

	// Sign file
	await arweave.transactions.sign(transaction, JSON.parse(user.walletPrivateKey));
	return transaction;
}

// This will prepare and sign v2 data transaction using ArFS File Metadata Tags
// SPLIT INTO createPrivateFileFolderMetaDataItemTransaction and createFileFolderMetaDataItemTransaction
export async function prepareArFSMetaDataTransaction(
	user: ArDriveUser,
	fileMetaData: ArFSFileMetaData,
	secondaryFileMetaData: string | Buffer
): Promise<Transaction> {
	// Create the arweave transaction using the file data and private key
	const transaction = await arweave.createTransaction(
		{ data: secondaryFileMetaData },
		JSON.parse(user.walletPrivateKey)
	);

	// Tag file with ArFS Tags
	transaction.addTag('App-Name', appName);
	transaction.addTag('App-Version', appVersion);
	transaction.addTag('Unix-Time', fileMetaData.unixTime.toString());
	if (fileMetaData.isPublic === 0) {
		// If the file is private, we use extra tags
		// Tag file with Content-Type, Cipher and Cipher-IV
		transaction.addTag('Content-Type', 'application/octet-stream');
		transaction.addTag('Cipher', fileMetaData.cipher);
		transaction.addTag('Cipher-IV', fileMetaData.metaDataCipherIV);
	} else {
		// Tag file with public tags only
		transaction.addTag('Content-Type', fileMetaData.contentType);
	}
	transaction.addTag('ArFS', arFSVersion);
	transaction.addTag('Entity-Type', fileMetaData.entityType);
	transaction.addTag('Drive-Id', fileMetaData.driveId);

	// Add file or folder specific tags
	if (fileMetaData.entityType === 'file') {
		transaction.addTag('File-Id', fileMetaData.fileId);
		transaction.addTag('Parent-Folder-Id', fileMetaData.parentFolderId);
	} else {
		transaction.addTag('Folder-Id', fileMetaData.fileId);
		if (fileMetaData.parentFolderId !== '0') {
			// Root folder transactions do not have Parent-Folder-Id
			transaction.addTag('Parent-Folder-Id', fileMetaData.parentFolderId);
		}
	}

	// Sign transaction
	await arweave.transactions.sign(transaction, JSON.parse(user.walletPrivateKey));
	return transaction;
}

// Creates an arweave data item transaction (ANS-102) using ArFS Tags
// SPLIT INTO createPrivateFileDataItemTransaction and createFileDataItemTransaction
export async function prepareArFSDataItemTransaction(
	user: ArDriveUser,
	fileData: Buffer,
	fileMetaData: ArFSFileMetaData
): Promise<DataItemJson | null> {
	try {
		// Create the item using the data buffer
		const item = await arBundles.createData({ data: fileData }, JSON.parse(user.walletPrivateKey));

		// Tag file with common tags
		arBundles.addTag(item, 'App-Name', appName);
		arBundles.addTag(item, 'App-Version', appVersion);
		if (fileMetaData.isPublic === 0) {
			// If the file is private, we use extra tags
			// Tag file with Privacy tags, Content-Type, Cipher and Cipher-IV
			arBundles.addTag(item, 'Content-Type', 'application/octet-stream');
			arBundles.addTag(item, 'Cipher', fileMetaData.cipher);
			arBundles.addTag(item, 'Cipher-IV', fileMetaData.dataCipherIV);
		} else {
			// Only tag the file with public tags
			arBundles.addTag(item, 'Content-Type', fileMetaData.contentType);
		}

		// Sign the data, ready to be added to a bundle
		const signedItem = await arBundles.sign(item, JSON.parse(user.walletPrivateKey));
		return signedItem;
	} catch (err) {
		console.log('Error creating data item');
		console.log(err);
		return null;
	}
}

// Creates an arweave data item transaction (ANS-102) using ArFS Tags
// SPLIT INTO createPrivateFileMetaDataItemTransaction and createFileMetaDataItemTransaction
export async function prepareArFSMetaDataItemTransaction(
	user: ArDriveUser,
	fileMetaData: ArFSFileMetaData,
	secondaryFileMetaData: string | Buffer
): Promise<DataItemJson | null> {
	try {
		// Create the item using the data buffer or string
		const item = await arBundles.createData({ data: secondaryFileMetaData }, JSON.parse(user.walletPrivateKey));

		// Tag file
		arBundles.addTag(item, 'App-Name', appName);
		arBundles.addTag(item, 'App-Version', appVersion);
		arBundles.addTag(item, 'Unix-Time', fileMetaData.unixTime.toString());
		if (fileMetaData.isPublic === 0) {
			// If the file is private, we use extra tags
			// Tag file with Content-Type, Cipher and Cipher-IV
			arBundles.addTag(item, 'Content-Type', 'application/octet-stream');
			arBundles.addTag(item, 'Cipher', fileMetaData.cipher);
			arBundles.addTag(item, 'Cipher-IV', fileMetaData.metaDataCipherIV);
		} else {
			arBundles.addTag(item, 'Content-Type', 'application/json');
		}
		arBundles.addTag(item, 'ArFS', arFSVersion);
		arBundles.addTag(item, 'Entity-Type', fileMetaData.entityType);
		arBundles.addTag(item, 'Drive-Id', fileMetaData.driveId);

		// Add file or folder specific tags
		if (fileMetaData.entityType === 'file') {
			arBundles.addTag(item, 'File-Id', fileMetaData.fileId);
			arBundles.addTag(item, 'Parent-Folder-Id', fileMetaData.parentFolderId);
		} else {
			arBundles.addTag(item, 'Folder-Id', fileMetaData.fileId);
			if (fileMetaData.parentFolderId !== '0') {
				arBundles.addTag(item, 'Parent-Folder-Id', fileMetaData.parentFolderId);
			}
		}

		// Sign the data, ready to be added to a bundle
		const signedItem = await arBundles.sign(item, JSON.parse(user.walletPrivateKey));
		return signedItem;
	} catch (err) {
		console.log('Error creating data item');
		console.log(err);
		return null;
	}
}

// Creates a bundled data transaction
// MOVED TO createBundledDataTransaction
export async function prepareArFSBundledDataTransaction(
	user: ArDriveUser,
	items: DataItemJson[]
): Promise<Transaction | null> {
	try {
		// Bundle up all individual items into a single data bundle
		const dataBundle = await arBundles.bundleData(items);
		const dataBuffer: Buffer = Buffer.from(JSON.stringify(dataBundle));

		// Create the transaction for the entire data bundle
		const transaction = await arweave.createTransaction({ data: dataBuffer }, JSON.parse(user.walletPrivateKey));

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Bundle-Format', 'json');
		transaction.addTag('Bundle-Version', '1.0.0');
		transaction.addTag('Content-Type', 'application/json');

		// Sign the bundle
		await arweave.transactions.sign(transaction, JSON.parse(user.walletPrivateKey));
		return transaction;
	} catch (err) {
		console.log('Error creating data bundle');
		console.log(err);
		return null;
	}
}
// Downloads a single file from ArDrive by transaction
export async function downloadArDriveFileByTx(user: ArDriveUser, fileToDownload: ArFSFileMetaData) {
	try {
		// Get the parent folder's path
		const parentFolder: ArFSFileMetaData = await getLatestFolderVersionFromSyncTable(fileToDownload.parentFolderId);

		// Check if this file's path has the right path from its parent folder.  This ensures folders moved on the web are properly moved locally
		if (parentFolder.filePath !== path.dirname(fileToDownload.filePath)) {
			// Update the file path in the database
			console.log('Fixing file path to ', parentFolder.filePath);
			fileToDownload.filePath = path.join(parentFolder.filePath, fileToDownload.fileName);
			await setFilePath(fileToDownload.filePath, fileToDownload.id);
		}

		// Check if this is a folder.  If it is, we dont need to download anything and we create the folder.
		const folderPath = dirname(fileToDownload.filePath);
		if (!existsSync(folderPath)) {
			mkdirSync(folderPath, { recursive: true });
			await sleep(100);
		}

		const dataTxUrl = gatewayURL.concat(fileToDownload.dataTxId);
		// Public files do not need decryption
		if (+fileToDownload.isPublic === 1) {
			console.log('Downloading %s', fileToDownload.filePath);
			const writer = createWriteStream(fileToDownload.filePath);
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
					console.log('   Completed!', fileToDownload.filePath);
					resolve(true);
				});
			});
		} else {
			// File is private and we must decrypt it
			console.log('Downloading and decrypting %s', fileToDownload.filePath);
			const writer = createWriteStream(fileToDownload.filePath);
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
					const data = readFileSync(fileToDownload.filePath);
					const dataBuffer = Buffer.from(data);
					const driveKey: Buffer = await deriveDriveKey(
						user.dataProtectionKey,
						fileToDownload.driveId,
						user.walletPrivateKey
					);
					const fileKey: Buffer = await deriveFileKey(fileToDownload.fileId, driveKey);
					const decryptedData = await fileDecrypt(fileToDownload.dataCipherIV, fileKey, dataBuffer);

					// Overwrite the file with the decrypted version
					writeFileSync(fileToDownload.filePath, decryptedData);
					console.log('   Completed!', fileToDownload.filePath);
					resolve(true);
				});
			});
		}
	} catch (err) {
		//console.log(err);
		console.log('Error downloading file data %s to %s', fileToDownload.fileName, fileToDownload.filePath);
		return 'Error downloading file';

		// Uploads all queued files as V2 transactions ONLY with no data bundles
	}
}
export async function uploadArDriveFiles(user: ArDriveUser): Promise<string> {
	try {
		let filesUploaded = 0;
		let totalPrice = 0;
		console.log('---Uploading All Queued Files and Folders---');
		const filesToUpload = getFilesToUploadFromSyncTable(user.login);
		if (Object.keys(filesToUpload).length > 0) {
			// Ready to upload
			await asyncForEach(filesToUpload, async (fileToUpload: ArFSFileMetaData) => {
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
			await sendArDriveFee(user.walletPrivateKey, totalPrice);
			console.log('Uploaded %s files to your ArDrive!', filesUploaded);

			// Check if this was the first upload of the user's drive, if it was then upload a Drive transaction as well
			// Check for unsynced drive entities and create if necessary
			const newDrives: ArFSFileMetaData[] = getNewDrivesFromDriveTable(user.login);
			if (newDrives.length > 0) {
				console.log('   Wow that was your first ARDRIVE Transaction!  Congrats!');
				console.log(
					'   Lets finish setting up your profile by submitting a few more small transactions to the network.'
				);
				await asyncForEach(newDrives, async (newDrive: ArFSDriveMetaData) => {
					// Create the Drive metadata transaction as submit as V2
					const success = await uploadArFSDriveMetaData(user, newDrive);
					if (success) {
						// Create the Drive Root folder and submit as V2 transaction
						const driveRootFolder: ArFSFileMetaData = await getDriveRootFolderFromSyncTable(
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
