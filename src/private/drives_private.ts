import * as arweavePrivate from './transactions_private';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';

import { ArDriveUser, ArFSEncryptedData } from '../types/base_Types';
import { ArFSLocalDriveEntity, ArFSLocalPrivateDriveEntity } from '../types/client_Types';
import { v4 as uuidv4 } from 'uuid';
import { deriveDriveKey, driveEncrypt } from '../crypto';
import { JWKInterface } from 'arweave/node/lib/wallet';

import { appName, appVersion, arFSVersion, cipher } from '../constants';
import { createDataUploader } from '../transactions';

// Creates an new Drive transaction and uploader using ArFS Metadata

export async function newArFSPrivateDriveMetaData(
	user: ArDriveUser,
	walletPrivateKey: JWKInterface,
	driveMetaData: ArFSLocalPrivateDriveEntity
): Promise<{ driveMetaData: ArFSLocalPrivateDriveEntity; uploader: TransactionUploader } | null> {
	try {
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: driveMetaData.entity.name,
			rootFolderId: driveMetaData.entity.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// Check if the drive is public or private
		console.log('Creating a new Private Drive (name: %s) on the Permaweb', driveMetaData.entity.name);
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			driveMetaData.entity.driveId,
			user.walletPrivateKey
		);
		const encryptedDriveMetaData: ArFSEncryptedData = await driveEncrypt(driveKey, Buffer.from(driveMetaDataJSON));
		driveMetaData.entity.cipher = encryptedDriveMetaData.cipher;
		driveMetaData.entity.cipherIV = encryptedDriveMetaData.cipherIV;
		const transaction = await arweavePrivate.createPrivateDriveTransaction(
			encryptedDriveMetaData.data,
			driveMetaData.entity,
			walletPrivateKey
		);

		// Update the file's data transaction ID
		driveMetaData.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.entity.name);
		return null;
	}
}

// Creates a new drive depending on the privacy
// This should be in the Drive class

export async function newArFSPrivateDrive(driveName: string, login?: string): Promise<ArFSLocalDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	console.log('Creating a new private drive %s | %s', driveName, driveId);
	const drive: ArFSLocalPrivateDriveEntity = {
		id: 0,
		owner: login != undefined ? login : '',
		isLocal: 1,
		entity: {
			appName: appName,
			appVersion: appVersion,
			arFS: arFSVersion,
			contentType: '',
			driveId: driveId,
			drivePrivacy: 'personal',
			rootFolderId: rootFolderId,
			syncStatus: 0,
			txId: '0',
			unixTime: unixTime,
			name: '',
			entityType: '',
			cipher: cipher,
			cipherIV: '',
			driveAuthMode: 'password'
		}
	};

	return drive;
}
