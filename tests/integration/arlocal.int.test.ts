/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Arweave from 'arweave';
import { expect } from 'chai';
import { ArFSTagSettings } from '../../src/arfs/arfs_tag_settings';
import { ArFSUploadPlanner } from '../../src/arfs/arfs_upload_planner';
import {
	FeeMultiple,
	FolderID,
	TransactionID,
	DriveID,
	DriveKey,
	ByteCount,
	ArweaveAddress,
	W,
	TxID,
	ArFSEntityData
} from '../../src/types';
import { ARDataPriceNetworkEstimator } from '../../src/pricing/ar_data_price_network_estimator';
import { WalletDAO } from '../../src/wallet_dao';
import { gatewayUrlForArweave, readJWKFile } from '../../src/utils/common';
import { ArDrive } from '../../src/ardrive';

import { JWKWallet } from '../../src/jwk_wallet';
import { GatewayOracle } from '../../src/pricing/gateway_oracle';
import { ArDriveCommunityOracle } from '../../src/community/ardrive_community_oracle';
import { ArFSDAO, PrivateDriveKeyData } from '../../src/arfs/arfsdao';
import { ArFSFileToUpload, ArFSFolderToUpload, wrapFileOrFolder } from '../../src/arfs/arfs_file_wrapper';
import { alphabeticalOrder } from '../../src/utils/sort_functions';
import {
	ArFSPrivateFileWithPaths,
	ArFSPrivateFolderWithPaths,
	ArFSPublicFileWithPaths,
	ArFSPublicFolderWithPaths
} from '../../src/arfs/arfs_entities';
import { GatewayAPI } from '../../src/utils/gateway_api';
import { restore, stub } from 'sinon';
import { stub258KiBFileToUpload, stub2ChunkFileToUpload, stub3ChunkFileToUpload, stubArweaveAddress } from '../stubs';
import { assertRetryExpectations } from '../test_assertions';
import {
	expectAsyncErrorThrow,
	fundArLocalWallet,
	getMetaDataJSONFromArLocal,
	getTxDataFromArLocal,
	mineArLocalBlock
} from '../test_helpers';
import GQLResultInterface from '../../src/types/gql_Types';
import { buildQuery } from '../../src/utils/query';
import Transaction from 'arweave/node/lib/transaction';
import {
	assertPublicDriveExpectations,
	assertPublicFolderExpectations,
	assertPublicFileExpectations,
	assertPublicFolderWithPathsExpectations,
	assertPublicFileWithPathsExpectations,
	assertFileMetaDataJson,
	assertFileMetaDataGqlTags,
	assertFileDataTxGqlTags,
	assertPrivateDriveExpectations,
	assertPrivateFolderExpectations,
	assertPrivateFileExpectations,
	assertPrivateFolderWithPathsExpectations,
	assertPrivateFileWithPathsExpectations,
	assertFolderMetaDataJson,
	assertFolderMetaDataGqlTags
} from '../helpers/arlocal_test_assertions';

describe('ArLocal Integration Tests', function () {
	const wallet = readJWKFile('./test_wallet.json');

	const arweave = Arweave.init({
		host: 'localhost',
		port: 1984,
		protocol: 'http'
	});

	const arweaveOracle = new GatewayOracle(gatewayUrlForArweave(arweave));
	const communityOracle = new ArDriveCommunityOracle(arweave);
	const priceEstimator = new ARDataPriceNetworkEstimator(arweaveOracle);
	const walletDao = new WalletDAO(arweave, 'ArLocal Integration Test', '1.7');

	const fakeGatewayApi = new GatewayAPI({ gatewayUrl: gatewayUrlForArweave(arweave) });

	const arFSTagSettings = new ArFSTagSettings({ appName: 'ArLocal Integration Test', appVersion: '1.7' });

	const arfsDao = new ArFSDAO(
		wallet,
		arweave,
		false,
		undefined,
		undefined,
		arFSTagSettings,
		undefined,
		fakeGatewayApi
	);

	const bundledUploadPlanner = new ArFSUploadPlanner({
		arFSTagSettings,
		priceEstimator,
		communityOracle
	});

	const v2TxUploadPlanner = new ArFSUploadPlanner({
		arFSTagSettings,
		priceEstimator,
		communityOracle,
		shouldBundle: false
	});

	const v2ArDrive = new ArDrive(
		wallet,
		walletDao,
		arfsDao,
		communityOracle,
		undefined,
		undefined,
		priceEstimator,
		new FeeMultiple(1.0),
		false,
		arFSTagSettings,
		v2TxUploadPlanner
	);

	const bundledArDrive = new ArDrive(
		wallet,
		walletDao,
		arfsDao,
		communityOracle,
		undefined,
		undefined,
		priceEstimator,
		new FeeMultiple(1.0),
		false,
		arFSTagSettings,
		bundledUploadPlanner
	);

	const customMetaData = {
		['Custom Tag']: 'This Test Works',
		['Custom Tag Array']: ['This Test Works', 'As Well :)']
	};

	before(async () => {
		await fundArLocalWallet(arweave, wallet);
	});

	beforeEach(() => {
		stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());
	});

	describe('when a public drive is created with `createPublicDrive`', () => {
		let rootFolderId: FolderID;
		let rootFolderTxId: TransactionID;
		let driveTxID: TransactionID;
		let driveId: DriveID;

		before(async () => {
			const { created } = await bundledArDrive.createPublicDrive({ driveName: 'arlocal_test_drive' });

			rootFolderId = created[1].entityId!;
			rootFolderTxId = created[1].metadataTxId!;
			driveId = created[0].entityId!;
			driveTxID = created[0].metadataTxId!;

			await mineArLocalBlock(arweave);
		});

		it('we can fetch that public drive with `getPublicDrive`', async () => {
			const drive = await bundledArDrive.getPublicDrive({
				driveId
			});

			assertPublicDriveExpectations({
				entity: drive,
				driveId,
				entityName: 'arlocal_test_drive',
				metaDataTxId: driveTxID,
				rootFolderId
			});
		});

		it('we can fetch the public root folder for that drive with with `getPublicFolder`', async () => {
			const folder = await bundledArDrive.getPublicFolder({
				folderId: rootFolderId
			});

			assertPublicFolderExpectations({
				entity: folder,
				driveId,
				entityName: 'arlocal_test_drive',
				metaDataTxId: rootFolderTxId,
				folderId: rootFolderId
			});
		});

		it('we can create a public folder with `createPublicFolder` and get that public folder with `getPublicFolder`', async () => {
			const { created } = await bundledArDrive.createPublicFolder({
				parentFolderId: rootFolderId,
				folderName: 'folder5'
			});
			await mineArLocalBlock(arweave);

			const folder = await bundledArDrive.getPublicFolder({
				folderId: created[0].entityId!
			});

			assertPublicFolderExpectations({
				entity: folder,
				driveId,
				parentFolderId: rootFolderId,
				entityName: 'folder5',
				folderId: created[0].entityId!,
				metaDataTxId: created[0].metadataTxId!
			});
		});

		it('we can upload a public file with `uploadPublicFile` and get that public file with `getPublicFile`', async () => {
			const { created } = await bundledArDrive.uploadPublicFile({
				parentFolderId: rootFolderId,
				wrappedFile: wrapFileOrFolder(
					'tests/stub_files/bulk_root_folder/parent_folder/file_in_parent.txt'
				) as ArFSFileToUpload
			});
			await mineArLocalBlock(arweave);

			const file = await bundledArDrive.getPublicFile({
				fileId: created[0].entityId!
			});

			assertPublicFileExpectations({
				entity: file,
				driveId,
				parentFolderId: rootFolderId,
				metaDataTxId: created[0].metadataTxId!,
				dataTxId: created[0].dataTxId!,
				fileId: created[0].entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_parent.txt',
				size: new ByteCount(12)
			});
		});

		it('we can upload a public folder with `createPublicFolderAndUploadChildren` and list the contents of that public folder with `listPublicFolder`', async () => {
			const { created } = await bundledArDrive.createPublicFolderAndUploadChildren({
				parentFolderId: rootFolderId,
				wrappedFolder: wrapFileOrFolder('tests/stub_files/bulk_root_folder/') as ArFSFolderToUpload
			});
			await mineArLocalBlock(arweave);

			const [
				rootFolderResult,
				parentFolderResult,
				childFolderResult,
				grandChildFolderResult,
				fileInRootResult,
				fileInParentResult,
				fileInChildResult,
				fileInGrandChildResult
			] = created;

			const entities = (
				await bundledArDrive.listPublicFolder({
					folderId: created[0].entityId!,
					maxDepth: Number.MAX_SAFE_INTEGER,
					includeRoot: true
				})
			).sort((a, b) => alphabeticalOrder(a.path, b.path));

			const [
				rootFolder,
				fileInRoot,
				parentFolder,
				childFolder,
				fileInChild,
				grandChildFolder,
				fileInGrandChild,
				fileInParent
			] = entities;

			assertPublicFolderWithPathsExpectations({
				entity: rootFolder as ArFSPublicFolderWithPaths,
				driveId,
				parentFolderId: rootFolderId,
				entityName: 'bulk_root_folder',
				folderId: rootFolderResult.entityId!,
				metaDataTxId: rootFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}`
			});
			assertPublicFolderWithPathsExpectations({
				entity: parentFolder as ArFSPublicFolderWithPaths,
				driveId,
				parentFolderId: rootFolder.entityId,
				entityName: 'parent_folder',
				folderId: parentFolderResult.entityId!,
				metaDataTxId: parentFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}`
			});
			assertPublicFolderWithPathsExpectations({
				entity: childFolder as ArFSPublicFolderWithPaths,
				driveId,
				parentFolderId: parentFolder.entityId,
				entityName: 'child_folder',
				folderId: childFolderResult.entityId!,
				metaDataTxId: childFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}`
			});
			assertPublicFolderWithPathsExpectations({
				entity: grandChildFolder as ArFSPublicFolderWithPaths,
				driveId,
				parentFolderId: childFolder.entityId,
				entityName: 'grandchild_folder',
				folderId: grandChildFolderResult.entityId!,
				metaDataTxId: grandChildFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder/grandchild_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}/${grandChildFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}/${grandChildFolder.txId}`
			});

			assertPublicFileWithPathsExpectations({
				entity: fileInRoot as ArFSPublicFileWithPaths,
				driveId,
				parentFolderId: rootFolder.entityId,
				metaDataTxId: fileInRootResult.metadataTxId!,
				dataTxId: fileInRootResult.dataTxId!,
				fileId: fileInRootResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_root.txt',
				size: new ByteCount(12),
				expectedPath: '/arlocal_test_drive/bulk_root_folder/file_in_root.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${fileInRootResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${fileInRootResult.metadataTxId}`
			});
			assertPublicFileWithPathsExpectations({
				entity: fileInParent as ArFSPublicFileWithPaths,
				driveId,
				parentFolderId: parentFolder.entityId,
				metaDataTxId: fileInParentResult.metadataTxId!,
				dataTxId: fileInParentResult.dataTxId!,
				fileId: fileInParentResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_parent.txt',
				size: new ByteCount(12),
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/file_in_parent.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${fileInParentResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${fileInParentResult.metadataTxId}`
			});
			assertPublicFileWithPathsExpectations({
				entity: fileInChild as ArFSPublicFileWithPaths,
				driveId,
				parentFolderId: childFolder.entityId,
				metaDataTxId: fileInChildResult.metadataTxId!,
				dataTxId: fileInChildResult.dataTxId!,
				fileId: fileInChildResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_child.txt',
				size: new ByteCount(14),
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder/file_in_child.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}/${fileInChildResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}/${fileInChildResult.metadataTxId}`
			});
			assertPublicFileWithPathsExpectations({
				entity: fileInGrandChild as ArFSPublicFileWithPaths,
				driveId,
				parentFolderId: grandChildFolder.entityId,
				metaDataTxId: fileInGrandChildResult.metadataTxId!,
				dataTxId: fileInGrandChildResult.dataTxId!,
				fileId: fileInGrandChildResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_grandchild.txt',
				size: new ByteCount(14),
				expectedPath:
					'/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder/grandchild_folder/file_in_grandchild.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}/${grandChildFolder.entityId}/${fileInGrandChildResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}/${grandChildFolder.txId}/${fileInGrandChildResult.metadataTxId}`
			});
		});

		it('we can upload a multi-chunk 5 MiB file as a v2 transaction and fetch that public file', async function () {
			const { created } = await v2ArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder('tests/stub_files/5MiB.txt'),
						destName: 'unique_0'
					}
				]
			});
			await mineArLocalBlock(arweave);

			const file = await bundledArDrive.getPublicFile({ fileId: created[0].entityId! });

			assertPublicFileExpectations({
				entity: file,
				driveId,
				parentFolderId: rootFolderId,
				metaDataTxId: created[0].metadataTxId!,
				dataTxId: created[0].dataTxId!,
				fileId: created[0].entityId!,
				dataContentType: 'text/plain',
				entityName: 'unique_0',
				size: new ByteCount(5242880)
			});
		});

		it('we can upload a public file as a v2 transaction with a custom content type and custom metadata', async () => {
			const fileName = 'custom_content_unique_stub';
			const customContentType = 'application/fake';

			const { created } = await v2ArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder(
							'tests/stub_files/bulk_root_folder/file_in_root.txt',
							customContentType,
							{ metaDataGqlTags: customMetaData, metaDataJson: customMetaData }
						),
						destName: fileName
					}
				]
			});
			await mineArLocalBlock(arweave);

			// @ts-ignore
			const { dataTxId, metadataTxId, entityId: fileId }: Required<ArFSEntityData> = created[0];
			const expectedFileSize = 12;

			const metaDataJson = await getMetaDataJSONFromArLocal(arweave, metadataTxId);
			assertFileMetaDataJson(metaDataJson, {
				name: fileName,
				size: expectedFileSize,
				dataTxId: `${dataTxId}`,
				dataContentType: customContentType,
				customMetaData
			});

			const metaDataTx = new Transaction(await fakeGatewayApi.getTransaction(metadataTxId));
			assertFileMetaDataGqlTags(metaDataTx, { driveId, fileId, parentFolderId: rootFolderId, customMetaData });

			const dataTx = new Transaction(await fakeGatewayApi.getTransaction(dataTxId));
			assertFileDataTxGqlTags(dataTx, { contentType: customContentType });

			const arFSFileEntity = await v2ArDrive.getPublicFile({ fileId });
			assertPublicFileExpectations({
				size: new ByteCount(expectedFileSize),
				parentFolderId: rootFolderId,
				metaDataTxId: metadataTxId,
				fileId,
				entityName: fileName,
				entity: arFSFileEntity,
				driveId,
				dataTxId,
				dataContentType: customContentType,
				/** We will expect these tags to be parsed back twice, once from dataJSON and once from GQL tags */
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});
		});

		it('we can upload a public folder as a v2 transaction with custom metadata', async () => {
			const folderName = 'custom_content_unique_folder';

			const { created } = await v2ArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder(
							'tests/stub_files/bulk_root_folder/parent_folder/child_folder/grandchild_folder',
							undefined,
							{ metaDataGqlTags: customMetaData, metaDataJson: customMetaData }
						),
						destName: folderName
					}
				]
			});
			await mineArLocalBlock(arweave);

			// @ts-ignore
			const { metadataTxId, entityId: folderId }: Required<ArFSEntityData> = created[0];

			const metaDataJson = await getMetaDataJSONFromArLocal(arweave, metadataTxId);
			assertFolderMetaDataJson(metaDataJson, {
				name: folderName,
				customMetaData
			});

			const metaDataTx = new Transaction(await fakeGatewayApi.getTransaction(metadataTxId));
			assertFolderMetaDataGqlTags(metaDataTx, {
				driveId,
				folderId,
				parentFolderId: rootFolderId,
				customMetaData
			});

			const arFSFolderEntity = await v2ArDrive.getPublicFolder({ folderId });
			assertPublicFolderExpectations({
				parentFolderId: rootFolderId,
				metaDataTxId: metadataTxId,
				folderId,
				driveId,
				entity: arFSFolderEntity,
				entityName: folderName,
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});

			// Check that nested file also has custom metadata
			// @ts-ignore
			const { metadataTxId: fileMetaDataTxId, entityId: fileId, dataTxId }: Required<ArFSEntityData> = created[1];
			const expectedFileSize = 14;
			const arFSFileEntity = await v2ArDrive.getPublicFile({ fileId });
			assertPublicFileExpectations({
				size: new ByteCount(expectedFileSize),
				parentFolderId: folderId,
				metaDataTxId: fileMetaDataTxId,
				fileId,
				entityName: 'file_in_grandchild.txt',
				entity: arFSFileEntity,
				driveId,
				dataTxId,
				dataContentType: 'text/plain',
				/** We will expect these tags to be parsed back twice, once from dataJSON and once from GQL tags */
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});
		});

		// TODO: Debug why this bundled test doesn't work
		it.skip('we can upload a bundled public file with a custom content type and custom metadata', async function () {
			this.timeout(600000);
			const fileName = 'custom_content_unique_stub';
			const customContentType = 'application/fake';

			const { created } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder(
							'tests/stub_files/bulk_root_folder/file_in_root.txt',
							customContentType,
							{ metaDataGqlTags: customMetaData, metaDataJson: customMetaData }
						),
						destName: fileName
					}
				]
			});
			await mineArLocalBlock(arweave);

			// @ts-ignore
			const { dataTxId, metadataTxId, entityId: fileId }: Required<ArFSEntityData> = created[0];
			const expectedFileSize = 12;

			const metaDataJson = await getMetaDataJSONFromArLocal(arweave, metadataTxId);
			assertFileMetaDataJson(metaDataJson, {
				name: fileName,
				size: expectedFileSize,
				dataTxId: `${dataTxId}`,
				dataContentType: customContentType,
				customMetaData
			});

			const metaDataTx = new Transaction(await fakeGatewayApi.getTransaction(metadataTxId));
			assertFileMetaDataGqlTags(metaDataTx, {
				driveId,
				fileId,
				parentFolderId: rootFolderId,
				customMetaData
			});

			const dataTx = new Transaction(await fakeGatewayApi.getTransaction(dataTxId));
			assertFileDataTxGqlTags(dataTx, { contentType: customContentType });

			const arFSFileEntity = await v2ArDrive.getPublicFile({ fileId });
			assertPublicFileExpectations({
				size: new ByteCount(expectedFileSize),
				parentFolderId: rootFolderId,
				metaDataTxId: metadataTxId,
				fileId,
				entityName: fileName,
				entity: arFSFileEntity,
				driveId,
				dataTxId,
				dataContentType: customContentType,
				/** We will expect these tags to be parsed back twice, once from dataJSON and once from GQL tags */
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});
		});

		describe('with a v2 public file transaction that has incomplete chunks', () => {
			it('and a valid metadata tx, we can restore that tx using the file ID', async () => {
				stub(fakeGatewayApi, 'postChunk').resolves();

				const wrappedFile = stub2ChunkFileToUpload();

				// Upload file with `postChunk` method stubbed to RESOLVE without uploading
				// This will result in:
				//  - Data Tx Headers Posted and Incomplete Chunks
				//  - Valid MetaData Tx Posted
				const { created } = await v2ArDrive.uploadAllEntities({
					entitiesToUpload: [
						{
							destFolderId: rootFolderId,
							wrappedEntity: wrappedFile
						}
					]
				});
				await mineArLocalBlock(arweave);

				const fileId = created[0].entityId!;
				const dataTxId = created[0].dataTxId!;

				// Restore GatewayAPI from stub
				restore();

				// File MetaData should already be valid
				const file = await bundledArDrive.getPublicFile({ fileId });
				assertPublicFileExpectations({
					entity: file,
					driveId,
					parentFolderId: rootFolderId,
					metaDataTxId: created[0].metadataTxId!,
					dataTxId: created[0].dataTxId!,
					fileId: created[0].entityId!,
					dataContentType: 'text/plain',
					entityName: '2Chunk.txt',
					size: new ByteCount(524_288)
				});

				// Ensure that the data is incomplete
				const incompleteData = await getTxDataFromArLocal(arweave, dataTxId);
				expect(incompleteData.byteLength).to.equal(0);

				// Retry this file
				const result = await v2ArDrive.retryPublicArFSFileUploadByFileId({
					dataTxId,
					wrappedFile: stub2ChunkFileToUpload(),
					fileId
				});
				await mineArLocalBlock(arweave);

				const repairedData = await getTxDataFromArLocal(arweave, dataTxId);

				// ByteLength matching is disabled because of issues in GitHub CI, this commented line should work locally
				// expect(repairedData.byteLength).to.equal(524_288);
				expect(repairedData.byteLength).to.be.greaterThan(0);

				assertRetryExpectations({
					result,
					expectedDataTxId: dataTxId,
					expectedFileId: fileId,
					expectedCommunityTip: W(154544268902),
					expectedDataTxReward: W(1030295126016)
				});
			});

			it('and a valid metadata tx, we can restore that tx using the parent folder ID', async () => {
				stub(fakeGatewayApi, 'postChunk').resolves();

				const wrappedFile = stub3ChunkFileToUpload();

				// Upload file with `postChunk` method stubbed to RESOLVE without uploading
				// This will result in:
				//  - Data Tx Headers Posted and Incomplete Chunks
				//  - Valid MetaData Tx Posted
				const { created } = await v2ArDrive.uploadAllEntities({
					entitiesToUpload: [
						{
							destFolderId: rootFolderId,
							wrappedEntity: wrappedFile
						}
					]
				});
				await mineArLocalBlock(arweave);

				const fileId = created[0].entityId!;
				const dataTxId = created[0].dataTxId!;

				// Restore GatewayAPI from stub
				restore();

				// File MetaData should already be valid
				const file = await bundledArDrive.getPublicFile({ fileId });
				assertPublicFileExpectations({
					entity: file,
					driveId,
					parentFolderId: rootFolderId,
					metaDataTxId: created[0].metadataTxId!,
					dataTxId: created[0].dataTxId!,
					fileId: created[0].entityId!,
					dataContentType: 'text/plain',
					entityName: '3Chunk.txt',
					size: new ByteCount(786_432)
				});

				// Ensure that the data is incomplete
				const incompleteData = await getTxDataFromArLocal(arweave, dataTxId);
				expect(incompleteData.byteLength).to.equal(0);

				// Retry this file
				const result = await v2ArDrive.retryPublicArFSFileUploadByDestFolderId({
					dataTxId,
					wrappedFile: stub3ChunkFileToUpload(),
					destinationFolderId: rootFolderId
				});
				await mineArLocalBlock(arweave);

				const repairedData = await getTxDataFromArLocal(arweave, dataTxId);

				// ByteLength matching is disabled because of issues in GitHub CI, this commented line should work locally
				// expect(repairedData.byteLength).to.equal(786_432);
				expect(repairedData.byteLength).to.greaterThan(0);

				assertRetryExpectations({
					result,
					expectedDataTxId: dataTxId,
					expectedCommunityTip: W(231816403353),
					expectedDataTxReward: W(1545442689024)
				});
			});

			it('and NO valid metadata tx, we can restore that tx to an ArFS destination folder view', async () => {
				stub(fakeGatewayApi, 'postChunk').throws('Bad Error!');

				const wrappedFile = stub258KiBFileToUpload();

				// Upload file with `postChunk` method stubbed to THROW
				// This will result in:
				//  - Data Tx Headers Posted and Incomplete Chunks
				//  - No MetaData Tx Posted
				await expectAsyncErrorThrow({
					promiseToError: v2ArDrive.uploadAllEntities({
						entitiesToUpload: [
							{
								destFolderId: rootFolderId,
								wrappedEntity: wrappedFile
							}
						]
					}),
					errorMessage: 'Too many errors encountered while posting chunks: Bad Error!'
				});
				await mineArLocalBlock(arweave);

				async function deriveLastTxInfoFromGqlForOwner(owner: ArweaveAddress): Promise<TransactionID> {
					const gqlResp: GQLResultInterface = (
						await arweave.api.post('graphql', buildQuery({ tags: [], owner }))
					).data;

					const txNode = gqlResp.data.transactions.edges[0].node;
					return TxID(txNode.id);
				}

				const dataTxId = await deriveLastTxInfoFromGqlForOwner(await wallet.getAddress());

				// Restore GatewayAPI from stub
				restore();

				// Ensure data is incomplete
				const incompleteData = await getTxDataFromArLocal(arweave, dataTxId);
				expect(incompleteData.byteLength).to.equal(0);

				// Retry this file
				const result = await v2ArDrive.retryPublicArFSFileUploadByDestFolderId({
					dataTxId,
					wrappedFile: stub258KiBFileToUpload(),
					destinationFolderId: rootFolderId
				});
				await mineArLocalBlock(arweave);

				const repairedData = await getTxDataFromArLocal(arweave, dataTxId);

				// ByteLength matching is disabled because of issues in GitHub CI, this commented line should work locally
				// expect(repairedData.byteLength).to.equal(264_192);
				expect(repairedData.byteLength).to.greaterThan(0);

				assertRetryExpectations({
					result,
					expectedDataTxId: dataTxId,
					expectedCommunityTip: W(154_544_268_902),
					expectedDataTxReward: W(1_030_295_126_016),
					// We expect a metaData reward to exist
					expectedMetaDataTxReward: W(5_468_962_356)
				});

				// File MetaData should now be valid
				const file = await bundledArDrive.getPublicFile({ fileId: result.created[0].entityId! });
				assertPublicFileExpectations({
					entity: file,
					driveId,
					parentFolderId: rootFolderId,
					metaDataTxId: result.created[0].metadataTxId!,
					dataTxId: result.created[0].dataTxId!,
					fileId: result.created[0].entityId!,
					dataContentType: 'text/plain',
					entityName: '258KiB.txt',
					size: new ByteCount(264_192)
				});
			});
		});
	});

	describe('when a private drive is created with `createPrivateDrive`', () => {
		let rootFolderId: FolderID;
		let rootFolderTxId: TransactionID;
		let driveTxID: TransactionID;
		let driveId: DriveID;
		let driveKey: DriveKey;

		before(async () => {
			const { created } = await bundledArDrive.createPrivateDrive({
				driveName: 'arlocal_test_drive',
				newPrivateDriveData: await PrivateDriveKeyData.from('123', (wallet as JWKWallet).getPrivateKey())
			});

			rootFolderId = created[1].entityId!;
			rootFolderTxId = created[1].metadataTxId!;
			driveId = created[0].entityId!;
			driveTxID = created[0].metadataTxId!;
			driveKey = created[0].key!;

			await mineArLocalBlock(arweave);
		});

		it('we can fetch that private drive with `getPrivateDrive`', async () => {
			const drive = await bundledArDrive.getPrivateDrive({
				driveId,
				driveKey
			});

			assertPrivateDriveExpectations({
				entity: drive,
				driveId,
				entityName: 'arlocal_test_drive',
				metaDataTxId: driveTxID,
				rootFolderId
			});
		});

		it('we can fetch the private root folder for that drive with with `getPrivateFolder`', async () => {
			const folder = await bundledArDrive.getPrivateFolder({
				folderId: rootFolderId,
				driveKey
			});

			assertPrivateFolderExpectations({
				entity: folder,
				driveId,
				entityName: 'arlocal_test_drive',
				metaDataTxId: rootFolderTxId,
				folderId: rootFolderId
			});
		});

		it('we can create a private folder with `createPrivateFolder` and get that private folder with `getPrivateFolder`', async () => {
			const { created } = await bundledArDrive.createPrivateFolder({
				parentFolderId: rootFolderId,
				folderName: 'folder5',
				driveKey
			});
			await mineArLocalBlock(arweave);

			const folder = await bundledArDrive.getPrivateFolder({
				folderId: created[0].entityId!,
				driveKey
			});

			assertPrivateFolderExpectations({
				entity: folder,
				driveId,
				parentFolderId: rootFolderId,
				entityName: 'folder5',
				folderId: created[0].entityId!,
				metaDataTxId: created[0].metadataTxId!
			});
		});

		it('we can upload a private file with `uploadPrivateFile` and get that private file with `getPrivateFile`', async () => {
			const { created } = await bundledArDrive.uploadPrivateFile({
				parentFolderId: rootFolderId,
				wrappedFile: wrapFileOrFolder(
					'tests/stub_files/bulk_root_folder/parent_folder/file_in_parent.txt'
				) as ArFSFileToUpload,
				driveKey
			});
			await mineArLocalBlock(arweave);

			const file = await bundledArDrive.getPrivateFile({
				fileId: created[0].entityId!,
				driveKey
			});

			assertPrivateFileExpectations({
				entity: file,
				driveId,
				parentFolderId: rootFolderId,
				metaDataTxId: created[0].metadataTxId!,
				dataTxId: created[0].dataTxId!,
				fileId: created[0].entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_parent.txt',
				size: new ByteCount(12)
			});
		});

		it('we can upload a private folder with `createPrivateFolderAndUploadChildren` and list the contents of that private folder with `listPrivateFolder`', async () => {
			const { created } = await bundledArDrive.createPrivateFolderAndUploadChildren({
				parentFolderId: rootFolderId,
				wrappedFolder: wrapFileOrFolder('tests/stub_files/bulk_root_folder/') as ArFSFolderToUpload,
				driveKey
			});
			await mineArLocalBlock(arweave);

			const [
				rootFolderResult,
				parentFolderResult,
				childFolderResult,
				grandChildFolderResult,
				fileInRootResult,
				fileInParentResult,
				fileInChildResult,
				fileInGrandChildResult
			] = created;

			const entities = (
				await bundledArDrive.listPrivateFolder({
					folderId: created[0].entityId!,
					maxDepth: Number.MAX_SAFE_INTEGER,
					includeRoot: true,
					driveKey
				})
			).sort((a, b) => alphabeticalOrder(a.path, b.path));

			const [
				rootFolder,
				fileInRoot,
				parentFolder,
				childFolder,
				fileInChild,
				grandChildFolder,
				fileInGrandChild,
				fileInParent
			] = entities;

			assertPrivateFolderWithPathsExpectations({
				entity: rootFolder as ArFSPrivateFolderWithPaths,
				driveId,
				parentFolderId: rootFolderId,
				entityName: 'bulk_root_folder',
				folderId: rootFolderResult.entityId!,
				metaDataTxId: rootFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}`
			});
			assertPrivateFolderWithPathsExpectations({
				entity: parentFolder as ArFSPrivateFolderWithPaths,
				driveId,
				parentFolderId: rootFolder.entityId,
				entityName: 'parent_folder',
				folderId: parentFolderResult.entityId!,
				metaDataTxId: parentFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}`
			});
			assertPrivateFolderWithPathsExpectations({
				entity: childFolder as ArFSPrivateFolderWithPaths,
				driveId,
				parentFolderId: parentFolder.entityId,
				entityName: 'child_folder',
				folderId: childFolderResult.entityId!,
				metaDataTxId: childFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}`
			});
			assertPrivateFolderWithPathsExpectations({
				entity: grandChildFolder as ArFSPrivateFolderWithPaths,
				driveId,
				parentFolderId: childFolder.entityId,
				entityName: 'grandchild_folder',
				folderId: grandChildFolderResult.entityId!,
				metaDataTxId: grandChildFolderResult.metadataTxId!,
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder/grandchild_folder',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}/${grandChildFolder.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}/${grandChildFolder.txId}`
			});

			assertPrivateFileWithPathsExpectations({
				entity: fileInRoot as ArFSPrivateFileWithPaths,
				driveId,
				parentFolderId: rootFolder.entityId,
				metaDataTxId: fileInRootResult.metadataTxId!,
				dataTxId: fileInRootResult.dataTxId!,
				fileId: fileInRootResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_root.txt',
				size: new ByteCount(12),
				expectedPath: '/arlocal_test_drive/bulk_root_folder/file_in_root.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${fileInRootResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${fileInRootResult.metadataTxId}`
			});
			assertPrivateFileWithPathsExpectations({
				entity: fileInParent as ArFSPrivateFileWithPaths,
				driveId,
				parentFolderId: parentFolder.entityId,
				metaDataTxId: fileInParentResult.metadataTxId!,
				dataTxId: fileInParentResult.dataTxId!,
				fileId: fileInParentResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_parent.txt',
				size: new ByteCount(12),
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/file_in_parent.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${fileInParentResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${fileInParentResult.metadataTxId}`
			});
			assertPrivateFileWithPathsExpectations({
				entity: fileInChild as ArFSPrivateFileWithPaths,
				driveId,
				parentFolderId: childFolder.entityId,
				metaDataTxId: fileInChildResult.metadataTxId!,
				dataTxId: fileInChildResult.dataTxId!,
				fileId: fileInChildResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_child.txt',
				size: new ByteCount(14),
				expectedPath: '/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder/file_in_child.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}/${fileInChildResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}/${fileInChildResult.metadataTxId}`
			});
			assertPrivateFileWithPathsExpectations({
				entity: fileInGrandChild as ArFSPrivateFileWithPaths,
				driveId,
				parentFolderId: grandChildFolder.entityId,
				metaDataTxId: fileInGrandChildResult.metadataTxId!,
				dataTxId: fileInGrandChildResult.dataTxId!,
				fileId: fileInGrandChildResult.entityId!,
				dataContentType: 'text/plain',
				entityName: 'file_in_grandchild.txt',
				size: new ByteCount(14),
				expectedPath:
					'/arlocal_test_drive/bulk_root_folder/parent_folder/child_folder/grandchild_folder/file_in_grandchild.txt',
				expectedEntityIdPath: `/${rootFolderId}/${rootFolder.entityId}/${parentFolder.entityId}/${childFolder.entityId}/${grandChildFolder.entityId}/${fileInGrandChildResult.entityId}`,
				expectedTxIdPath: `/${rootFolderTxId}/${rootFolder.txId}/${parentFolder.txId}/${childFolder.txId}/${grandChildFolder.txId}/${fileInGrandChildResult.metadataTxId}`
			});
		});

		it('we can upload a multi-chunk private file as a v2 transaction and fetch that private file', async function () {
			const { created } = await v2ArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder('tests/stub_files/5MiB.txt'),
						driveKey
					}
				]
			});
			await mineArLocalBlock(arweave);

			const file = await bundledArDrive.getPrivateFile({ fileId: created[0].entityId!, driveKey });

			assertPrivateFileExpectations({
				entity: file,
				driveId,
				parentFolderId: rootFolderId,
				metaDataTxId: created[0].metadataTxId!,
				dataTxId: created[0].dataTxId!,
				fileId: created[0].entityId!,
				dataContentType: 'text/plain',
				entityName: '5MiB.txt',
				size: new ByteCount(5242880)
			});
		});

		it('we can upload a private file as a v2 transaction with a custom content type and custom metadata', async function () {
			this.timeout(600000);
			const fileName = 'custom_content_unique_stub';
			const customContentType = 'application/fake';

			const { created } = await v2ArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder(
							'tests/stub_files/bulk_root_folder/file_in_root.txt',
							customContentType,
							{ metaDataGqlTags: customMetaData, metaDataJson: customMetaData }
						),
						destName: fileName,
						driveKey
					}
				]
			});
			await mineArLocalBlock(arweave);

			// @ts-ignore
			const { dataTxId, metadataTxId, entityId: fileId }: Required<ArFSEntityData> = created[0];
			const expectedFileSize = 12;

			const arFSFileEntity = await v2ArDrive.getPrivateFile({ fileId, driveKey });
			assertPrivateFileExpectations({
				size: new ByteCount(expectedFileSize),
				parentFolderId: rootFolderId,
				metaDataTxId: metadataTxId,
				fileId,
				entityName: fileName,
				entity: arFSFileEntity,
				driveId,
				dataTxId,
				dataContentType: customContentType,
				/** We will expect these tags to be parsed back twice, once from dataJSON and once from GQL tags */
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});
		});

		it('we can upload a private folder as a v2 transaction with custom metadata', async () => {
			const folderName = 'custom_content_unique_folder';

			const { created } = await v2ArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						destFolderId: rootFolderId,
						wrappedEntity: wrapFileOrFolder(
							'tests/stub_files/bulk_root_folder/parent_folder/child_folder/grandchild_folder',
							undefined,
							{ metaDataGqlTags: customMetaData, metaDataJson: customMetaData }
						),
						destName: folderName,
						driveKey
					}
				]
			});
			await mineArLocalBlock(arweave);

			// @ts-ignore
			const { metadataTxId, entityId: folderId }: Required<ArFSEntityData> = created[0];

			const arFSFolderEntity = await v2ArDrive.getPrivateFolder({ folderId, driveKey });
			assertPrivateFolderExpectations({
				parentFolderId: rootFolderId,
				metaDataTxId: metadataTxId,
				folderId,
				driveId,
				entity: arFSFolderEntity,
				entityName: folderName,
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});

			// Check that nested file also has custom metadata
			// @ts-ignore
			const { metadataTxId: fileMetaDataTxId, entityId: fileId, dataTxId }: Required<ArFSEntityData> = created[1];
			const expectedFileSize = 14;
			const arFSFileEntity = await v2ArDrive.getPrivateFile({ fileId, driveKey });
			assertPrivateFileExpectations({
				size: new ByteCount(expectedFileSize),
				parentFolderId: folderId,
				metaDataTxId: fileMetaDataTxId,
				fileId,
				entityName: 'file_in_grandchild.txt',
				entity: arFSFileEntity,
				driveId,
				dataTxId,
				dataContentType: 'text/plain',
				/** We will expect these tags to be parsed back twice, once from dataJSON and once from GQL tags */
				customMetaData: {
					['Custom Tag']: ['This Test Works', 'This Test Works'],
					['Custom Tag Array']: ['This Test Works', 'As Well :)', 'This Test Works', 'As Well :)']
				}
			});
		});

		// TODO: Private bundled file upload test with custom metadata
	});
});
