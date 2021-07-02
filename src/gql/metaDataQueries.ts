import { extToMime, Utf8ArrayToStr } from '../common';
import { gatewayURL } from '../constants';
import { deriveDriveKey, deriveFileKey, fileDecrypt } from '../crypto';
import { getByMetaDataTxFromSyncTable, getLatestFileVersionFromSyncTable } from '../db/db_get';
import { addFileToSyncTable } from '../db/db_update';
import { getTransactionData } from '../gateway';
import { ArDriveUser, ArFSFileMetaData } from '../types/base_Types';
import { GQLEdgeInterface, GQLTagInterface } from '../types/gql_Types';
import {
	CipherType,
	ContentType,
	EntityType,
	entityTypeValues,
	syncStatusValues,
	yesNoIntegerValues
} from '../types/type_guards';
import { getPrivateTransactionCipherIV } from './transactionQueries';

// FIXME: Yet needs refactor

// Takes an ArDrive File Data Transaction and writes to the database.
export async function getFileMetaDataFromTx(fileDataTx: GQLEdgeInterface, user: ArDriveUser) {
	const fileToSync: ArFSFileMetaData = new ArFSFileMetaData({
		appName: '',
		appVersion: '',
		entityType: entityTypeValues.FILE,
		driveId: '',
		parentFolderId: '',
		fileVersion: 0,
		fileDataSyncStatus: syncStatusValues.READY_TO_DOWNLOAD,
		fileMetaDataSyncStatus: syncStatusValues.READY_TO_DOWNLOAD,
		login: user.login,
		isLocal: yesNoIntegerValues.NO,
		isPublic: yesNoIntegerValues.NO,
		cloudOnly: yesNoIntegerValues.NO
	});
	try {
		const { node } = fileDataTx;
		const { tags } = node;
		fileToSync.metaDataTxId = node.id;

		// DOUBLE CHECK THIS
		// Is the File or Folder already present in the database?  If it is, lets ensure its already downloaded
		const isMetaDataSynced = await getByMetaDataTxFromSyncTable(fileToSync.metaDataTxId);
		if (isMetaDataSynced) {
			// this file is already downloaded and synced
			return 'Synced Already';
		}

		// Download the File's Metadata using the metadata transaction ID
		const data: string | Uint8Array = await getTransactionData(fileToSync.metaDataTxId);

		// Enumerate through each tag to pull the data
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					fileToSync.appName = value;
					break;
				case 'App-Version':
					fileToSync.appVersion = value;
					break;
				case 'Unix-Time':
					fileToSync.unixTime = +value; // Convert to number
					break;
				case 'Content-Type':
					fileToSync.contentType = value as ContentType;
					break;
				case 'Entity-Type':
					fileToSync.entityType = value as EntityType;
					break;
				case 'Drive-Id':
					fileToSync.driveId = value;
					break;
				case 'File-Id':
					fileToSync.fileId = value;
					break;
				case 'Folder-Id':
					fileToSync.fileId = value;
					break;
				case 'Parent-Folder-Id':
					fileToSync.parentFolderId = value;
					break;
				case 'Cipher':
					fileToSync.cipher = value as CipherType;
					break;
				case 'Cipher-IV':
					fileToSync.metaDataCipherIV = value;
					break;
				default:
					break;
			}
		});

		let dataJSON;
		let decryptedData = Buffer.from('');
		// If it is a private file or folder, the data will need decryption.
		if (fileToSync.cipher === 'AES256-GCM') {
			fileToSync.isPublic = 0;
			const dataBuffer = Buffer.from(data);
			const driveKey: Buffer = await deriveDriveKey(
				user.dataProtectionKey,
				fileToSync.driveId,
				user.walletPrivateKey
			);
			if (fileToSync.entityType === 'file') {
				// Decrypt files using a File Key derived from the Drive key
				const fileKey: Buffer = await deriveFileKey(fileToSync.fileId, driveKey);
				decryptedData = await fileDecrypt(fileToSync.metaDataCipherIV, fileKey, dataBuffer);
			} else if (fileToSync.entityType === 'folder') {
				// Decrypt folders using the Drive Key only
				decryptedData = await fileDecrypt(fileToSync.metaDataCipherIV, driveKey, dataBuffer);
			}

			// Handle an error with decryption by ignoring this file.  THIS NEEDS TO BE IMPROVED.
			if (decryptedData.toString('ascii') === 'Error') {
				console.log(
					'There was a problem decrypting a private %s with TXID: %s',
					fileToSync.entityType,
					fileToSync.metaDataTxId
				);
				console.log('Skipping this file...');
				fileToSync.fileSize = 0;
				fileToSync.fileName = '';
				fileToSync.fileHash = '';
				fileToSync.fileDataSyncStatus = 0;
				fileToSync.fileMetaDataSyncStatus = 3;
				fileToSync.dataTxId = '0';
				fileToSync.lastModifiedDate = fileToSync.unixTime;
				fileToSync.permaWebLink = gatewayURL.concat(fileToSync.dataTxId);
				fileToSync.cloudOnly = 1;
				await addFileToSyncTable(fileToSync); // This must be handled better.
				return 'Error Decrypting';
			} else {
				const dataString = await Utf8ArrayToStr(decryptedData);
				dataJSON = await JSON.parse(dataString);
			}
		} else {
			// the file is public and does not require decryption
			const dataString = await Utf8ArrayToStr(data);
			dataJSON = await JSON.parse(dataString);
			fileToSync.isPublic = 1;
		}

		// Set metadata for Folder and File entities
		fileToSync.fileSize = dataJSON.size;
		fileToSync.fileName = dataJSON.name;
		fileToSync.fileHash = '';
		fileToSync.fileDataSyncStatus = 3;
		fileToSync.fileMetaDataSyncStatus = 3;
		fileToSync.dataTxId = '0';

		// Perform specific actions for File, Folder and Drive entities
		if (fileToSync.entityType === 'file') {
			// The actual data transaction ID, lastModifiedDate, and Filename of the underlying file are pulled from the metadata transaction
			fileToSync.lastModifiedDate = dataJSON.lastModifiedDate; // Convert to milliseconds
			fileToSync.dataTxId = dataJSON.dataTxId;
			fileToSync.contentType = extToMime(dataJSON.name) as ContentType;
			fileToSync.permaWebLink = gatewayURL.concat(dataJSON.dataTxId);

			if (fileToSync.isPublic === 0) {
				// if this is a private file, the CipherIV of the Data transaction should also be captured
				fileToSync.dataCipherIV = await getPrivateTransactionCipherIV(fileToSync.dataTxId);
			}

			// Check to see if a previous version exists, and if so, increment the version.
			// Versions are determined by comparing old/new file hash.
			const latestFile = await getLatestFileVersionFromSyncTable(fileToSync.fileId);
			if (latestFile !== undefined) {
				if (latestFile.fileDataTx !== fileToSync.dataTxId) {
					fileToSync.fileVersion = +latestFile.fileVersion + 1;
					// console.log ("%s has a new version %s", dataJSON.name, fileToSync.fileVersion)
				}
				// If the previous file data tx matches, then we do not increment the version
				else {
					fileToSync.fileVersion = latestFile.fileVersion;
				}
			}
			// Perform specific actions for Folder entities
		} else if (fileToSync.entityType === 'folder') {
			fileToSync.lastModifiedDate = fileToSync.unixTime;
			fileToSync.permaWebLink = gatewayURL.concat(fileToSync.metaDataTxId);
		}

		console.log(
			'QUEUING %s %s | Id: %s | Tx: %s for download',
			fileToSync.entityType,
			fileToSync.fileName,
			fileToSync.fileId,
			fileToSync.metaDataTxId
		);
		await addFileToSyncTable(fileToSync);
		return 'Success';
	} catch (err) {
		console.log(err);
		console.log('Error syncing file metadata');
		console.log(fileToSync);
		return 'Error syncing file metadata';
	}
}
