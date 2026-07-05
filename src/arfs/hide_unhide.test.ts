/* eslint-disable @typescript-eslint/no-explicit-any */
// `as any` is used to stub the DAO's private methods (uploadMetaData / getDriveOwnerFor*),
// matching the established pattern in multi_chunk_tx_uploader.test.ts.
import { expect } from 'chai';
import { stub } from 'sinon';

import {
	fakeArweave,
	stubTxID,
	stubEntityID,
	stubArweaveAddress,
	getStubDriveKey,
	stubPublicFile,
	stubPrivateFile,
	stubPublicFolder
} from '../../tests/stubs';
import { readJWKFile, gatewayUrlForArweave } from '../utils/common';
import { GatewayAPI } from '../utils/gateway_api';
import { fileDecrypt, deriveFileKey } from '../utils/crypto';
import { ByteCount, UnixTime, GQLNodeInterface, DriveKey } from '../types';

import {
	ArFSPublicFileMetadataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPrivateFolderTransactionData
} from './tx/arfs_tx_data_types';
import { ArFSPublicFileBuilder, ArFSPrivateFileBuilder } from './arfs_builders/arfs_file_builders';
import { ArFSPublicFolderBuilder, ArFSPrivateFolderBuilder } from './arfs_builders/arfs_folder_builders';
import { ArFSDAO } from './arfsdao';
import { ArFSTagSettings } from './arfs_tag_settings';

const wallet = readJWKFile('./test_wallet.json');

const gatewayApi = new GatewayAPI({
	gatewayUrl: gatewayUrlForArweave(fakeArweave),
	maxRetriesPerRequest: 1,
	initialErrorDelayMS: 1
});

// A deliberately non-zero lastModifiedDate so we can prove hide/unhide is a genuine no-op that
// never bumps it (desktop edit-detection keys on this field).
const NAME = 'stub-name';
const LAST_MODIFIED = new UnixTime(1699999999);
const SIZE = new ByteCount(2048);
const CONTENT_TYPE = 'text/plain';

function publicFileNode(): GQLNodeInterface {
	return {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Drive-Id', value: `${stubEntityID}` },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Unix-Time', value: '1639073846' },
			{ name: 'Parent-Folder-Id', value: `${stubEntityID}` },
			{ name: 'File-Id', value: `${stubEntityID}` }
		]
	} as GQLNodeInterface;
}

function privateFileNode(cipherIV: string): GQLNodeInterface {
	return {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/octet-stream' },
			{ name: 'Drive-Id', value: `${stubEntityID}` },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Unix-Time', value: '1639073846' },
			{ name: 'Parent-Folder-Id', value: `${stubEntityID}` },
			{ name: 'File-Id', value: `${stubEntityID}` },
			{ name: 'Cipher', value: 'AES256-GCM' },
			{ name: 'Cipher-IV', value: cipherIV }
		]
	} as GQLNodeInterface;
}

function publicFolderNode(): GQLNodeInterface {
	return {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Drive-Id', value: `${stubEntityID}` },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Unix-Time', value: '1639073846' },
			{ name: 'Parent-Folder-Id', value: `${stubEntityID}` },
			{ name: 'Folder-Id', value: `${stubEntityID}` }
		]
	} as GQLNodeInterface;
}

function privateFolderNode(cipherIV: string): GQLNodeInterface {
	return {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/octet-stream' },
			{ name: 'Drive-Id', value: `${stubEntityID}` },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Unix-Time', value: '1639073846' },
			{ name: 'Parent-Folder-Id', value: `${stubEntityID}` },
			{ name: 'Folder-Id', value: `${stubEntityID}` },
			{ name: 'Cipher', value: 'AES256-GCM' },
			{ name: 'Cipher-IV', value: cipherIV }
		]
	} as GQLNodeInterface;
}

describe('hide/unhide - metadata JSON tx-data conditional inclusion', () => {
	it('public file: includes isHidden only when explicitly set', () => {
		const withHidden = new ArFSPublicFileMetadataTransactionData(
			NAME,
			SIZE,
			LAST_MODIFIED,
			stubTxID,
			CONTENT_TYPE,
			{},
			true
		);
		const hiddenJson = JSON.parse(withHidden.asTransactionData());
		expect(hiddenJson.isHidden).to.equal(true);
		expect(hiddenJson.name).to.equal(NAME);
		expect(hiddenJson.lastModifiedDate).to.equal(+LAST_MODIFIED);

		const shownJson = JSON.parse(
			new ArFSPublicFileMetadataTransactionData(
				NAME,
				SIZE,
				LAST_MODIFIED,
				stubTxID,
				CONTENT_TYPE,
				{},
				false
			).asTransactionData()
		);
		expect(shownJson.isHidden).to.equal(false);

		// Unset: the key must be entirely absent (mirrors ardrive-web includeIfNull:false)
		const defaultJson = JSON.parse(
			new ArFSPublicFileMetadataTransactionData(
				NAME,
				SIZE,
				LAST_MODIFIED,
				stubTxID,
				CONTENT_TYPE
			).asTransactionData()
		);
		expect('isHidden' in defaultJson).to.equal(false);
	});

	it('public folder: includes isHidden only when explicitly set', () => {
		const hiddenJson = JSON.parse(new ArFSPublicFolderTransactionData(NAME, {}, true).asTransactionData());
		expect(hiddenJson.isHidden).to.equal(true);

		const defaultJson = JSON.parse(new ArFSPublicFolderTransactionData(NAME).asTransactionData());
		expect('isHidden' in defaultJson).to.equal(false);
	});

	it('private file: isHidden lives inside the encrypted blob, not in cleartext', async () => {
		const driveKey = await getStubDriveKey();
		const txData = await ArFSPrivateFileMetadataTransactionData.from(
			NAME,
			SIZE,
			LAST_MODIFIED,
			stubTxID,
			CONTENT_TYPE,
			stubEntityID,
			driveKey,
			{},
			true
		);
		const encrypted = txData.asTransactionData();
		// Not present in cleartext
		expect(encrypted.includes(Buffer.from('isHidden'))).to.equal(false);
		// Present after decryption
		const fileKey = await deriveFileKey(`${stubEntityID}`, driveKey);
		const decrypted = JSON.parse((await fileDecrypt(txData.cipherIV, fileKey, encrypted)).toString());
		expect(decrypted.isHidden).to.equal(true);
		expect(decrypted.name).to.equal(NAME);
	});

	it('private folder: isHidden lives inside the encrypted blob; absent when unset', async () => {
		const driveKey = await getStubDriveKey();
		const hiddenTx = await ArFSPrivateFolderTransactionData.from(NAME, driveKey, {}, true);
		const decryptedHidden = JSON.parse(
			(await fileDecrypt(hiddenTx.cipherIV, driveKey, hiddenTx.asTransactionData())).toString()
		);
		expect(decryptedHidden.isHidden).to.equal(true);

		const defaultTx = await ArFSPrivateFolderTransactionData.from(NAME, driveKey);
		const decryptedDefault = JSON.parse(
			(await fileDecrypt(defaultTx.cipherIV, driveKey, defaultTx.asTransactionData())).toString()
		);
		expect('isHidden' in decryptedDefault).to.equal(false);
	});
});

describe('hide/unhide - builder round-trip surfaces isHidden on parsed entities', () => {
	it('public file round-trip: isHidden true survives to the entity', async () => {
		const txData = new ArFSPublicFileMetadataTransactionData(
			NAME,
			SIZE,
			LAST_MODIFIED,
			stubTxID,
			CONTENT_TYPE,
			{},
			true
		);
		const node = publicFileNode();
		const builder = ArFSPublicFileBuilder.fromArweaveNode(node, gatewayApi);
		stub(builder, 'getDataForTxID').resolves(Buffer.from(txData.asTransactionData()));

		const entity = await builder.build(node);
		expect(entity.isHidden).to.equal(true);
	});

	it('public file round-trip: isHidden is undefined when the field is absent', async () => {
		const txData = new ArFSPublicFileMetadataTransactionData(NAME, SIZE, LAST_MODIFIED, stubTxID, CONTENT_TYPE);
		const node = publicFileNode();
		const builder = ArFSPublicFileBuilder.fromArweaveNode(node, gatewayApi);
		stub(builder, 'getDataForTxID').resolves(Buffer.from(txData.asTransactionData()));

		const entity = await builder.build(node);
		expect(entity.isHidden).to.equal(undefined);
	});

	it('private file round-trip (encrypted): isHidden true survives to the entity', async () => {
		const driveKey = await getStubDriveKey();
		const txData = await ArFSPrivateFileMetadataTransactionData.from(
			NAME,
			SIZE,
			LAST_MODIFIED,
			stubTxID,
			CONTENT_TYPE,
			stubEntityID,
			driveKey,
			{},
			true
		);
		const node = privateFileNode(txData.cipherIV);
		const builder = ArFSPrivateFileBuilder.fromArweaveNode(node, gatewayApi, driveKey);
		stub(builder, 'getDataForTxID').resolves(txData.asTransactionData());

		const entity = await builder.build(node);
		expect(entity.isHidden).to.equal(true);
	});

	it('public folder round-trip: isHidden true survives to the entity', async () => {
		const txData = new ArFSPublicFolderTransactionData(NAME, {}, true);
		const node = publicFolderNode();
		const builder = ArFSPublicFolderBuilder.fromArweaveNode(node, gatewayApi);
		stub(builder, 'getDataForTxID').resolves(Buffer.from(txData.asTransactionData()));

		const entity = await builder.build(node);
		expect(entity.isHidden).to.equal(true);
	});

	it('private folder round-trip (encrypted): isHidden true survives to the entity', async () => {
		const driveKey = await getStubDriveKey();
		const txData = await ArFSPrivateFolderTransactionData.from(NAME, driveKey, {}, true);
		const node = privateFolderNode(txData.cipherIV);
		const builder = ArFSPrivateFolderBuilder.fromArweaveNode(node, gatewayApi, driveKey);
		stub(builder, 'getDataForTxID').resolves(txData.asTransactionData());

		const entity = await builder.build(node);
		expect(entity.isHidden).to.equal(true);
	});
});

describe('ArFSDAO hide/unhide writes a no-op revision that only flips isHidden', () => {
	let arfsDao: ArFSDAO;

	beforeEach(() => {
		const arFSTagSettings = new ArFSTagSettings({ appName: 'Unit Test', appVersion: '1.2' });
		arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'Unit Test', '1.2', arFSTagSettings);
		// Never touch the network or send a transaction
		stub(arfsDao as any, 'getDriveOwnerForFileId').resolves(stubArweaveAddress());
		stub(arfsDao as any, 'getDriveOwnerForFolderId').resolves(stubArweaveAddress());
	});

	it('hidePublicFile writes isHidden:true while preserving name and lastModifiedDate', async () => {
		const uploadStub = stub(arfsDao as any, 'uploadMetaData').resolves({
			id: stubTxID,
			dataCaches: [],
			fastFinalityIndexes: []
		});
		const file = stubPublicFile({ fileName: 'my-file' });

		const result = await arfsDao.hidePublicFile({ file, isHidden: true });
		expect(`${result.metaDataTxId}`).to.equal(`${stubTxID}`);

		const objectMetaData = uploadStub.firstCall.args[0] as { objectData: ArFSPublicFileMetadataTransactionData };
		const json = JSON.parse(objectMetaData.objectData.asTransactionData());
		expect(json.isHidden).to.equal(true);
		// No-op guarantees
		expect(json.name).to.equal(file.name);
		expect(json.lastModifiedDate).to.equal(+file.lastModifiedDate);
	});

	it('unhide path (hidePublicFile with isHidden:false) writes isHidden:false', async () => {
		const uploadStub = stub(arfsDao as any, 'uploadMetaData').resolves({
			id: stubTxID,
			dataCaches: [],
			fastFinalityIndexes: []
		});
		const file = stubPublicFile({ fileName: 'my-file' });

		await arfsDao.hidePublicFile({ file, isHidden: false });

		const objectMetaData = uploadStub.firstCall.args[0] as { objectData: ArFSPublicFileMetadataTransactionData };
		const json = JSON.parse(objectMetaData.objectData.asTransactionData());
		expect(json.isHidden).to.equal(false);
	});

	it('hidePublicFolder writes isHidden:true while preserving name', async () => {
		const uploadStub = stub(arfsDao as any, 'uploadMetaData').resolves({
			id: stubTxID,
			dataCaches: [],
			fastFinalityIndexes: []
		});
		const folder = stubPublicFolder({ folderName: 'my-folder' });

		await arfsDao.hidePublicFolder({ folder, isHidden: true });

		const objectMetaData = uploadStub.firstCall.args[0] as { objectData: ArFSPublicFolderTransactionData };
		const json = JSON.parse(objectMetaData.objectData.asTransactionData());
		expect(json.isHidden).to.equal(true);
		expect(json.name).to.equal(folder.name);
	});

	it('hidePrivateFile writes isHidden:true inside the encrypted blob (no-op on lastModifiedDate)', async () => {
		const uploadStub = stub(arfsDao as any, 'uploadMetaData').resolves({
			id: stubTxID,
			dataCaches: [],
			fastFinalityIndexes: []
		});
		const driveKey: DriveKey = await getStubDriveKey();
		const file = await stubPrivateFile({ fileName: 'my-private-file' });

		await arfsDao.hidePrivateFile({ file, isHidden: true, driveKey });

		const objectMetaData = uploadStub.firstCall.args[0] as { objectData: ArFSPrivateFileMetadataTransactionData };
		const encrypted = objectMetaData.objectData.asTransactionData() as Buffer;
		// Not in cleartext
		expect(encrypted.includes(Buffer.from('isHidden'))).to.equal(false);
		const fileKey = await deriveFileKey(`${file.fileId}`, driveKey);
		const json = JSON.parse((await fileDecrypt(objectMetaData.objectData.cipherIV, fileKey, encrypted)).toString());
		expect(json.isHidden).to.equal(true);
		expect(json.name).to.equal(file.name);
		expect(json.lastModifiedDate).to.equal(+file.lastModifiedDate);
	});
});
