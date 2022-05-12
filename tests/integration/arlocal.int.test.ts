/* eslint-disable @typescript-eslint/no-non-null-assertion */
// import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { expect } from 'chai';
import { ArFSTagSettings } from '../../src/arfs/tags/tag_settings';
import { ArFSUploadPlanner } from '../../src/arfs/arfs_upload_planner';
import {
	FeeMultiple,
	FolderID,
	TransactionID,
	DriveID,
	UnixTime,
	DriveKey,
	FileID,
	DataContentType,
	ByteCount
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
	ArFSEntity,
	ArFSPrivateDrive,
	ArFSPrivateFile,
	ArFSPrivateFileWithPaths,
	ArFSPrivateFolder,
	ArFSPrivateFolderWithPaths,
	ArFSPublicDrive,
	ArFSPublicFile,
	ArFSPublicFileWithPaths,
	ArFSPublicFolder,
	ArFSPublicFolderWithPaths
} from '../../src/arfs/arfs_entities';

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
	const arFSTagSettings = new ArFSTagSettings({ appName: 'ArLocal Integration Test', appVersion: '1.7' });
	const arfsDao = new ArFSDAO(wallet, arweave, false, undefined, undefined, arFSTagSettings);

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

	before(async () => {
		// Fund wallet
		await arweave.api.get(`mint/${await wallet.getAddress()}/9999999999999999`);
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

			await arweave.api.get(`mine`);
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
			await arweave.api.get(`mine`);

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
			await arweave.api.get(`mine`);

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
			await arweave.api.get(`mine`);

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
			await arweave.api.get(`mine`);

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

		it('we can upload a public file with a custom content type and custom tags');
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

			await arweave.api.get(`mine`);
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
			await arweave.api.get(`mine`);

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
			await arweave.api.get(`mine`);

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
			await arweave.api.get(`mine`);

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
			await arweave.api.get(`mine`);

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
	});
});

interface AssertEntityExpectationsParams<T = ArFSEntity> {
	entity: T;
	driveId: DriveID;
	metaDataTxId: TransactionID;
	entityName: string;
}

function assertBaseArFSEntityExpectations({
	entity,
	driveId,
	entityName,
	metaDataTxId
}: AssertEntityExpectationsParams): void {
	expect(entity.appName).to.equal('ArLocal Integration Test');
	expect(entity.appVersion).to.equal('1.7');
	expect(entity.arFS).to.equal('0.11');
	expect(`${entity.driveId}`, 'drive ID').to.equal(`${driveId}`);
	expect(entity.unixTime).to.be.an.instanceOf(UnixTime);
	expect(entity.name).to.equal(entityName);
	expect(`${entity.txId}`).to.equal(`${metaDataTxId}`);
}

function assertArFSPublicExpectations(
	params: AssertEntityExpectationsParams<ArFSPublicDrive | ArFSPublicFolder | ArFSPublicFile>
): void {
	expect(params.entity.contentType).to.equal('application/json');
	assertBaseArFSEntityExpectations(params);
}

function assertArFSPrivateExpectations(
	params: AssertEntityExpectationsParams<ArFSPrivateDrive | ArFSPrivateFolder | ArFSPrivateFile>
): void {
	expect(params.entity.contentType).to.equal('application/octet-stream');
	expect(params.entity.cipher).to.equal('AES256-GCM');
	expect(params.entity.cipherIV.length).to.equal(16);
	assertBaseArFSEntityExpectations(params);
}

interface AssertDriveExpectationsParams {
	rootFolderId: FolderID;
}

function assertDriveExpectations(
	params: AssertEntityExpectationsParams<ArFSPublicDrive | ArFSPrivateDrive> & AssertDriveExpectationsParams
) {
	expect(params.entity.entityType).to.equal('drive');
	expect(`${params.rootFolderId}`).to.equal(`${params.rootFolderId}`);
}

function assertPublicDriveExpectations(
	params: AssertEntityExpectationsParams<ArFSPublicDrive> & AssertDriveExpectationsParams
): void {
	assertArFSPublicExpectations(params);
	assertDriveExpectations(params);

	expect(params.entity.drivePrivacy).to.equal('public');
	expect(params.entity.contentType).to.equal('application/json');
}

function assertPrivateDriveExpectations(
	params: AssertEntityExpectationsParams<ArFSPrivateDrive> & AssertDriveExpectationsParams
): void {
	assertArFSPrivateExpectations(params);
	assertDriveExpectations(params);

	expect(params.entity.drivePrivacy).to.equal('private');
	expect(params.entity.driveAuthMode).to.equal('password');
	expect(params.entity.contentType).to.equal('application/octet-stream');
}

interface AssertFolderExpectationsParams<T = ArFSPublicFolder | ArFSPrivateFolder>
	extends AssertEntityExpectationsParams<T> {
	folderId: FolderID;
	parentFolderId?: FolderID;
}

function assertFolderExpectations(params: AssertFolderExpectationsParams): void {
	const { entity, parentFolderId, folderId } = params;

	expect(`${entity.entityId}`).to.equal(`${folderId}`);
	expect(entity.entityType).to.equal('folder');

	if (parentFolderId) {
		// Root folders will have no parentFolderId defined
		expect(`${entity.parentFolderId}`).to.equal(`${parentFolderId}`);
	} else {
		expect(`${entity.parentFolderId}`).to.equal(`root folder`);
	}
}

function assertPublicFolderExpectations(params: AssertFolderExpectationsParams<ArFSPublicFolder>): void {
	assertArFSPublicExpectations(params);
	assertFolderExpectations(params);
}

function assertPrivateFolderExpectations(params: AssertFolderExpectationsParams<ArFSPrivateFolder>): void {
	assertArFSPrivateExpectations(params);
}

interface AssertFileExpectationsParams<T = ArFSPublicFile | ArFSPrivateFile> extends AssertEntityExpectationsParams<T> {
	fileId: FileID;
	parentFolderId: FolderID;
	dataContentType: DataContentType;
	dataTxId: TransactionID;
	size: ByteCount;
}

function assertFileExpectations({
	entity: file,
	fileId,
	dataTxId,
	dataContentType,
	size,
	parentFolderId
}: AssertFileExpectationsParams): void {
	expect(`${file.entityId}`).to.equal(`${fileId}`);
	expect(file.entityType).to.equal('file');
	expect(+file.size).to.equal(+size);
	expect(file.lastModifiedDate).to.be.instanceOf(UnixTime);
	expect(`${file.parentFolderId}`).to.equal(`${parentFolderId}`);
	expect(`${file.dataTxId}`).to.equal(`${dataTxId}`);
	expect(file.dataContentType).to.equal(dataContentType);
}

function assertPublicFileExpectations(params: AssertFileExpectationsParams<ArFSPublicFile>): void {
	assertArFSPublicExpectations(params);
	assertFileExpectations(params);
}
function assertPrivateFileExpectations(params: AssertFileExpectationsParams<ArFSPrivateFile>): void {
	assertArFSPrivateExpectations(params);
	assertFileExpectations(params);
}

interface AssertEntityWithPathsParams {
	expectedPath: string;
	expectedTxIdPath: string;
	expectedEntityIdPath: string;
	entity: ArFSPublicFileWithPaths | ArFSPrivateFileWithPaths | ArFSPublicFolderWithPaths | ArFSPrivateFolderWithPaths;
}

function assertPathExpectations({
	expectedPath,
	expectedTxIdPath,
	expectedEntityIdPath,
	entity
}: AssertEntityWithPathsParams) {
	expect(entity.path).to.equal(expectedPath);
	expect(entity.entityIdPath).to.equal(expectedEntityIdPath);
	expect(entity.txIdPath).to.equal(expectedTxIdPath);
}

function assertPublicFolderWithPathsExpectations(
	params: AssertFolderExpectationsParams<ArFSPublicFolderWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	assertPublicFolderExpectations({ ...params, entity: params.entity as ArFSPublicFolder });
}

function assertPrivateFolderWithPathsExpectations(
	params: AssertFolderExpectationsParams<ArFSPrivateFolderWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	assertPrivateFolderExpectations({ ...params, entity: params.entity as ArFSPrivateFolder });
}

function assertPublicFileWithPathsExpectations(
	params: AssertFileExpectationsParams<ArFSPublicFileWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	// eslint-disable-next-line prettier/prettier
	assertPublicFileExpectations({ ...params, entity: params.entity as unknown as ArFSPublicFile });
}

function assertPrivateFileWithPathsExpectations(
	params: AssertFileExpectationsParams<ArFSPrivateFileWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	// eslint-disable-next-line prettier/prettier
	assertPrivateFileExpectations({ ...params, entity: params.entity as unknown as ArFSPrivateFile });
}
