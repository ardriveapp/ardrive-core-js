/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { stub } from 'sinon';
import { ArDrive } from '../../src/ardrive';
import { RootFolderID } from '../../src/arfs/arfs_builders/arfs_folder_builders';
import { wrapFileOrFolder, ArFSFileToUpload } from '../../src/arfs/arfs_file_wrapper';
import { ArFSDAO, PrivateDriveKeyData } from '../../src/arfs/arfsdao';
import { ArDriveCommunityOracle } from '../../src/community/ardrive_community_oracle';
import { deriveDriveKey } from '../../src/utils/crypto';
import { ARDataPriceRegressionEstimator } from '../../src/pricing/ar_data_price_regression_estimator';
import { GatewayOracle } from '../../src/pricing/gateway_oracle';
import {
	DriveKey,
	FeeMultiple,
	EID,
	W,
	UnixTime,
	ArFSResult,
	Winston,
	DrivePrivacy,
	FileID,
	ArFSManifestResult,
	FileConflictPrompts,
	FolderConflictPrompts,
	ArFSEntityData,
	FolderID,
	ByteCount,
	TipData,
	TransactionID
} from '../../src/types';
import { readJWKFile, urlEncodeHashKey } from '../../src/utils/common';
import {
	stubEntityID,
	stubArweaveAddress,
	stubEntityIDAlt,
	stubPublicDrive,
	stubPrivateDrive,
	stubPublicFolder,
	stubEntityIDRoot,
	stubEntityIDParent,
	stubEntityIDChild,
	stubEntityIDGrandchild,
	stubPrivateFolder,
	stubPublicFile,
	stubPrivateFile,
	stubPublicEntitiesWithPaths,
	stubSpecialCharEntitiesWithPaths,
	stubEntitiesWithNoFilesWithPaths,
	fakeArweave,
	stubFileUploadStats,
	stubEmptyFolderStats,
	stubFolderUploadStats
} from '../stubs';
import { expectAsyncErrorThrow } from '../test_helpers';
import { JWKWallet } from '../../src/jwk_wallet';
import { WalletDAO } from '../../src/wallet_dao';
import { ArFSUploadPlanner } from '../../src/arfs/arfs_upload_planner';
import { ArFSTagSettings } from '../../src/arfs/arfs_tag_settings';
import { MAX_BUNDLE_SIZE } from '../../src/utils/constants';

// Don't use the existing constants just to make sure our expectations don't change
const entityIdRegex = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
const txIdRegex = /^(\w|-){43}$/;
const fileKeyRegex = /^([a-zA-Z]|[0-9]|-|_|\/|\+){43}$/;

describe('ArDrive class - integrated', () => {
	const wallet = readJWKFile('./test_wallet.json');

	const getStubDriveKey = async (): Promise<DriveKey> => {
		return deriveDriveKey('stubPassword', `${stubEntityID}`, JSON.stringify((wallet as JWKWallet).getPrivateKey()));
	};

	const arweaveOracle = new GatewayOracle();
	const communityOracle = new ArDriveCommunityOracle(fakeArweave);
	const priceEstimator = new ARDataPriceRegressionEstimator(true, arweaveOracle);
	const walletDao = new WalletDAO(fakeArweave, 'Integration Test', '1.2');
	const arFSTagSettings = new ArFSTagSettings({ appName: 'Integration Test', appVersion: '1.2' });
	const arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'Integration Test', '1.2', arFSTagSettings);
	const uploadPlanner = new ArFSUploadPlanner({
		shouldBundle: false,
		arFSTagSettings: arFSTagSettings,
		priceEstimator,
		communityOracle
	});
	const bundledUploadPlanner = new ArFSUploadPlanner({
		arFSTagSettings: arFSTagSettings,
		priceEstimator,
		communityOracle
	});

	const arDrive = new ArDrive(
		wallet,
		walletDao,
		arfsDao,
		communityOracle,
		'Integration Test',
		'1.2',
		priceEstimator,
		new FeeMultiple(1.0),
		true,
		arFSTagSettings,
		uploadPlanner
	);

	const bundledArDrive = new ArDrive(
		wallet,
		walletDao,
		arfsDao,
		communityOracle,
		'Bundle Integration Test',
		'1.2',
		priceEstimator,
		new FeeMultiple(1.0),
		true,
		arFSTagSettings,
		bundledUploadPlanner
	);

	const walletOwner = stubArweaveAddress();
	const unexpectedOwner = stubArweaveAddress('0987654321klmnopqrxtuvwxyz123456789ABCDEFGH');

	// Use copies to expose any issues with object equality in tested code
	const expectedDriveId = EID(stubEntityID.toString());
	const unexpectedDriveId = EID(stubEntityIDAlt.toString());
	const existingFileId = EID(stubEntityIDAlt.toString());

	const matchingLastModifiedDate = new UnixTime(420);
	const differentLastModifiedDate = new UnixTime(1337);

	const stubNameConflictInfo = {
		files: [
			{
				fileName: 'CONFLICTING_FILE_NAME',
				fileId: existingFileId,
				lastModifiedDate: matchingLastModifiedDate
			}
		],
		folders: [{ folderName: 'CONFLICTING_FOLDER_NAME', folderId: stubEntityID }]
	};

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		stub(arweaveOracle, 'getWinstonPriceForByteCount').callsFake((input) => Promise.resolve(W(+input)));

		// Declare common stubs
		stub(walletDao, 'walletHasBalance').resolves(true);
		stub(wallet, 'getAddress').resolves(walletOwner);
		stub(arfsDao, 'getDriveIDForEntityId').resolves(expectedDriveId);
	});

	describe('utility function', () => {
		describe('sendCommunityTip', () => {
			it('returns the correct TipResult', async () => {
				stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());

				const result = await arDrive.sendCommunityTip({ communityWinstonTip: W('12345') });

				// Can't know the txID ahead of time without mocking arweave deeply
				expect(result.tipData.txId).to.match(txIdRegex);
				expect(`${result.tipData.recipient}`).to.equal(`${stubArweaveAddress()}`);
				expect(`${result.tipData.winston}`).to.equal('12345');
				expect(`${result.reward}`).to.equal('0');
			});
		});
	});

	describe('drive function', () => {
		describe('createPublicDrive', () => {
			it('returns the correct ArFSResult', async () => {
				const result = await arDrive.createPublicDrive({ driveName: 'TEST_DRIVE' });
				assertCreateDriveExpectations(result, W(75), W(21));
			});

			it('returns the correct bundled ArFSResult', async () => {
				const result = await bundledArDrive.createPublicDrive({
					driveName: 'TEST_DRIVE'
				});

				assertCreateDriveExpectations(result, W(2751), W(37), undefined, true);
			});
		});

		describe('createPrivateDrive', () => {
			it('returns the correct ArFSResult', async () => {
				const stubDriveKey = await getStubDriveKey();
				const stubPrivateDriveData: PrivateDriveKeyData = {
					driveId: stubEntityID,
					driveKey: stubDriveKey
				};

				const result = await arDrive.createPrivateDrive({
					driveName: 'TEST_DRIVE',
					newPrivateDriveData: stubPrivateDriveData
				});
				assertCreateDriveExpectations(result, W(91), W(37), urlEncodeHashKey(stubDriveKey));
			});

			it('returns the correct bundled ArFSResult', async () => {
				const stubDriveKey = await getStubDriveKey();
				const stubPrivateDriveData: PrivateDriveKeyData = {
					driveId: stubEntityID,
					driveKey: stubDriveKey
				};

				const result = await bundledArDrive.createPrivateDrive({
					driveName: 'TEST_DRIVE',
					newPrivateDriveData: stubPrivateDriveData
				});
				assertCreateDriveExpectations(result, W(2915), W(37), urlEncodeHashKey(stubDriveKey), true);
			});
		});
	});

	describe('folder function', () => {
		describe('createPublicFolder', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPublicEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
			});

			it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(unexpectedOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.createPublicFolder({
						folderName: 'TEST_FOLDER',
						driveId: stubEntityID,
						parentFolderId: stubEntityID
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws an error if the folder name conflicts with another ENTITY name in the destination folder', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.createPublicFolder({
						folderName: 'CONFLICTING_NAME',
						driveId: stubEntityID,
						parentFolderId: stubEntityID
					}),
					errorMessage: 'Entity name already exists in destination folder!'
				});
			});

			it('returns the correct ArFSResult', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				stub(arfsDao, 'getPublicDrive').resolves(stubPublicDrive());

				const result = await arDrive.createPublicFolder({
					folderName: 'TEST_FOLDER',
					driveId: stubEntityID,
					parentFolderId: stubEntityID
				});
				assertCreateFolderExpectations(result, W(22));
			});
		});

		describe('createPrivateFolder', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
			});

			it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(unexpectedOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.createPrivateFolder({
						folderName: 'TEST_FOLDER',
						driveId: stubEntityID,
						parentFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws an error if the folder name conflicts with another ENTITY name in the destination folder', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.createPrivateFolder({
						folderName: 'CONFLICTING_NAME',
						driveId: stubEntityID,
						parentFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Entity name already exists in destination folder!'
				});
			});

			it('returns the correct ArFSResult', async () => {
				stub(arfsDao, 'getPrivateDrive').resolves(stubPrivateDrive);
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

				const stubDriveKey = await getStubDriveKey();
				const result = await arDrive.createPrivateFolder({
					folderName: 'TEST_FOLDER',
					driveId: stubEntityID,
					parentFolderId: stubEntityID,
					driveKey: stubDriveKey
				});
				assertCreateFolderExpectations(result, W(38), urlEncodeHashKey(stubDriveKey));
			});
		});

		describe('movePublicFolder', () => {
			const folderHierarchy = {
				rootFolder: stubPublicFolder({ folderId: stubEntityIDRoot, parentFolderId: new RootFolderID() }),
				parentFolder: stubPublicFolder({
					folderId: stubEntityIDParent,
					parentFolderId: EID(stubEntityIDRoot.toString())
				}),
				childFolder: stubPublicFolder({
					folderId: stubEntityIDChild,
					parentFolderId: EID(stubEntityIDParent.toString())
				}),
				grandChildFolder: stubPublicFolder({
					folderId: stubEntityIDGrandchild,
					parentFolderId: EID(stubEntityIDChild.toString())
				})
			};

			beforeEach(() => {
				stub(arfsDao, 'getPublicEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
			});

			it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(unexpectedOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePublicFolder({
						folderId: stubEntityID,
						newParentFolderId: stubEntityIDAlt
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws an error if the folder name conflicts with another ENTITY name in the destination folder', async () => {
				stub(arfsDao, 'getPublicFolder').resolves(stubPublicFolder({ folderName: 'CONFLICTING_NAME' }));
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getDriveIdForFolderId').resolves(stubEntityID);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePublicFolder({
						folderId: EID(stubEntityID.toString()),
						newParentFolderId: stubEntityIDAlt
					}),
					errorMessage: 'Entity name already exists in destination folder!'
				});
			});

			it('throws an error if it is being moved inside any of its children folders', async () => {
				stub(arfsDao, 'getPublicFolder').resolves(folderHierarchy.rootFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPublicChildrenFolderIds').resolves([
					folderHierarchy.parentFolder.entityId,
					folderHierarchy.childFolder.entityId,
					folderHierarchy.grandChildFolder.entityId
				]);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePublicFolder({
						folderId: folderHierarchy.parentFolder.entityId,
						newParentFolderId: folderHierarchy.grandChildFolder.entityId
					}),
					errorMessage: 'Parent folder cannot be moved inside any of its children folders!'
				});
			});

			it('throws an error if the new parent folder id matches its current parent folder id', async () => {
				stub(arfsDao, 'getPublicFolder').resolves(folderHierarchy.childFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPublicChildrenFolderIds').resolves([folderHierarchy.grandChildFolder.entityId]);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePublicFolder({
						folderId: folderHierarchy.childFolder.entityId,
						newParentFolderId: folderHierarchy.parentFolder.entityId
					}),
					errorMessage: `Folder already has parent folder with ID: ${folderHierarchy.parentFolder.entityId}`
				});
			});

			it('throws an error if the new parent folder id matches its own folder id', async () => {
				stub(arfsDao, 'getPublicFolder').resolves(folderHierarchy.parentFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPublicChildrenFolderIds').resolves([
					folderHierarchy.childFolder.entityId,
					folderHierarchy.grandChildFolder.entityId
				]);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePublicFolder({
						folderId: folderHierarchy.parentFolder.entityId,
						newParentFolderId: folderHierarchy.parentFolder.entityId
					}),
					errorMessage: 'Folders cannot be moved into themselves!'
				});
			});

			it('throws an error if the folder is being moved to a different drive', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPublicFolder').resolves(stubPublicFolder({ driveId: unexpectedDriveId }));

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePublicFolder({
						folderId: stubEntityID,
						newParentFolderId: stubEntityIDAlt
					}),
					errorMessage: 'Entity must stay in the same drive!'
				});
			});

			it('returns the correct ArFSResult', async () => {
				stub(arfsDao, 'getPublicFolder').resolves(folderHierarchy.grandChildFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPublicChildrenFolderIds').resolves([]);

				const result = await arDrive.movePublicFolder({
					folderId: folderHierarchy.grandChildFolder.entityId,
					newParentFolderId: folderHierarchy.parentFolder.entityId
				});
				assertCreateFolderExpectations(result, W(20));
			});
		});

		describe('movePrivateFolder', () => {
			const folderHierarchy = {
				rootFolder: stubPrivateFolder({ folderId: stubEntityIDRoot, parentFolderId: new RootFolderID() }),
				parentFolder: stubPrivateFolder({
					folderId: stubEntityIDParent,
					parentFolderId: EID(stubEntityIDRoot.toString())
				}),
				childFolder: stubPrivateFolder({
					folderId: stubEntityIDChild,
					parentFolderId: EID(stubEntityIDParent.toString())
				}),
				grandChildFolder: stubPrivateFolder({
					folderId: stubEntityIDGrandchild,
					parentFolderId: EID(stubEntityIDChild.toString())
				})
			};

			beforeEach(() => {
				stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
			});

			it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(unexpectedOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePrivateFolder({
						folderId: stubEntityID,
						newParentFolderId: stubEntityIDAlt,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws an error if the folder name conflicts with another ENTITY name in the destination folder', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateFolder').resolves(stubPrivateFolder({ folderName: 'CONFLICTING_NAME' }));

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePrivateFolder({
						folderId: stubEntityID,
						newParentFolderId: stubEntityIDAlt,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Entity name already exists in destination folder!'
				});
			});

			it('throws an error if it is being moved inside any of its children folders', async () => {
				stub(arfsDao, 'getPrivateFolder').resolves(folderHierarchy.rootFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateChildrenFolderIds').resolves([
					folderHierarchy.parentFolder.entityId,
					folderHierarchy.childFolder.entityId,
					folderHierarchy.grandChildFolder.entityId
				]);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePrivateFolder({
						folderId: folderHierarchy.parentFolder.entityId,
						newParentFolderId: folderHierarchy.grandChildFolder.entityId,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Parent folder cannot be moved inside any of its children folders!'
				});
			});

			it('throws an error if the new parent folder id matches its current parent folder id', async () => {
				stub(arfsDao, 'getPrivateFolder').resolves(folderHierarchy.childFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateChildrenFolderIds').resolves([folderHierarchy.grandChildFolder.entityId]);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePrivateFolder({
						folderId: folderHierarchy.childFolder.entityId,
						newParentFolderId: folderHierarchy.parentFolder.entityId,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: `Folder already has parent folder with ID: ${folderHierarchy.parentFolder.entityId}`
				});
			});

			it('throws an error if the new parent folder id matches its own folder id', async () => {
				stub(arfsDao, 'getPrivateFolder').resolves(folderHierarchy.parentFolder);
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateChildrenFolderIds').resolves([
					folderHierarchy.childFolder.entityId,
					folderHierarchy.grandChildFolder.entityId
				]);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePrivateFolder({
						folderId: folderHierarchy.parentFolder.entityId,
						newParentFolderId: folderHierarchy.parentFolder.entityId,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Folders cannot be moved into themselves!'
				});
			});

			it('throws an error if the folder is being moved to a different drive', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateFolder').resolves(stubPrivateFolder({ driveId: unexpectedDriveId }));

				await expectAsyncErrorThrow({
					promiseToError: arDrive.movePrivateFolder({
						folderId: stubEntityID,
						newParentFolderId: stubEntityIDAlt,
						driveKey: await getStubDriveKey()
					}),
					errorMessage: 'Entity must stay in the same drive!'
				});
			});

			it('returns the correct ArFSResult', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateFolder').resolves(folderHierarchy.grandChildFolder);
				stub(arfsDao, 'getPrivateChildrenFolderIds').resolves([]);

				const result = await arDrive.movePrivateFolder({
					folderId: folderHierarchy.grandChildFolder.entityId,
					newParentFolderId: folderHierarchy.parentFolder.entityId,
					driveKey: await getStubDriveKey()
				});
				assertCreateFolderExpectations(result, W(36), urlEncodeHashKey(await getStubDriveKey()));
			});
		});

		describe('file function', () => {
			const stubbedFileAskPrompts: FileConflictPrompts = {
				fileToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
				fileToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' })
			};
			let wrappedFile: ArFSFileToUpload;

			describe('uploadPublicFile', () => {
				beforeEach(() => {
					wrappedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;

					stub(communityOracle, 'getCommunityWinstonTip').resolves(W('1'));
					stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());

					stub(arfsDao, 'getPublicNameConflictInfoInFolder').resolves(stubNameConflictInfo);
				});

				it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(unexpectedOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.uploadPublicFile({
							parentFolderId: EID(stubEntityID.toString()),
							wrappedFile
						}),
						errorMessage: 'Supplied wallet is not the owner of this drive!'
					});
				});

				it('throws an error if destination folder has a conflicting FOLDER name', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.uploadPublicFile({
							parentFolderId: stubEntityID,
							wrappedFile,
							destinationFileName: 'CONFLICTING_FOLDER_NAME'
						}),
						errorMessage: 'Entity name already exists in destination folder!'
					});
				});

				it('returns the correct empty ArFSResult if destination folder has a conflicting FILE name and conflict resolution is set to skip', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					const result = await arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'skip'
					});

					expect(result).to.deep.equal({
						created: [],
						tips: [],
						fees: {}
					});
				});

				it('returns the correct ArFSResult revision if destination folder has a conflicting FILE name and conflict resolution is set to replace', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					const result = await arDrive.uploadPublicFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'replace'
					});

					// Pass expected existing file id, so that the file would be considered a revision
					assertUploadFileExpectations(result, W(3204), W(171), W(1), 'public', existingFileId);
				});

				it('returns an empty ArFSResult if destination folder has a conflicting FILE name and a matching last modified date and the conflict resolution is set to upsert', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(wrappedFile, 'lastModifiedDate').get(() => matchingLastModifiedDate);

					const result = await arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'upsert'
					});

					expect(result).to.deep.equal({
						created: [],
						tips: [],
						fees: {}
					});
				});

				it('returns the correct ArFSResult revision if destination folder has a conflicting FILE name and a different last modified date and the conflict resolution is set to upsert', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(wrappedFile, 'lastModifiedDate').get(() => differentLastModifiedDate);

					const result = await arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'upsert'
					});

					// Pass expected existing file id, so that the file would be considered a revision
					assertUploadFileExpectations(result, W(3204), W(162), W('1'), 'public', existingFileId);
				});

				it('returns the correct ArFSResult if destination folder has a conflicting FILE name and the conflict resolution is set to ask and the user supplies a new file name', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
						resolution: 'rename',
						newFileName: 'New File!'
					});

					const result = await arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'ask',
						prompts: stubbedFileAskPrompts
					});

					assertUploadFileExpectations(result, W(3204), W(159), W('1'), 'public');
				});

				it('returns the correct revision ArFSResult if destination folder has a conflicting FILE name and the conflict resolution is set to ask and the user chooses to replace', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
						resolution: 'replace'
					});

					const result = await arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'ask',
						prompts: stubbedFileAskPrompts
					});

					assertUploadFileExpectations(result, W(3204), W(171), W('1'), 'public', existingFileId);
				});

				it('returns the correct empty ArFSResult if destination folder has a conflicting FILE name and the conflict resolution is set to ask and the user chooses to skip', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
						resolution: 'skip'
					});

					const result = await arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'ask',
						prompts: stubbedFileAskPrompts
					});

					expect(result).to.deep.equal({
						created: [],
						tips: [],
						fees: {}
					});
				});

				it('returns the correct bundled ArFSResult', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					const result = await bundledArDrive.uploadPublicFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile
					});
					assertUploadFileExpectations(result, W(5959), W(166), W(1), 'public', undefined, true);
				});

				it('returns the correct ArFSResult', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					const result = await arDrive.uploadPublicFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile
					});
					assertUploadFileExpectations(result, W(3204), W(166), W(1), 'public');
				});
			});

			describe('uploadPrivateFile', () => {
				beforeEach(() => {
					wrappedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;

					stub(communityOracle, 'getCommunityWinstonTip').resolves(W('1'));
					stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());

					stub(arfsDao, 'getPrivateNameConflictInfoInFolder').resolves(stubNameConflictInfo);
				});

				it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(unexpectedOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.uploadPrivateFile({
							parentFolderId: EID(stubEntityID.toString()),
							wrappedFile,
							driveKey: await getStubDriveKey()
						}),
						errorMessage: 'Supplied wallet is not the owner of this drive!'
					});
				});

				it('throws an error if destination folder has a conflicting FOLDER name', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.uploadPrivateFile({
							parentFolderId: EID(stubEntityID.toString()),
							wrappedFile,
							driveKey: await getStubDriveKey(),
							destinationFileName: 'CONFLICTING_FOLDER_NAME'
						}),
						errorMessage: 'Entity name already exists in destination folder!'
					});
				});

				it('returns the correct empty ArFSResult if destination folder has a conflicting FILE name and conflict resolution is set to skip', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						driveKey: await getStubDriveKey(),
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'skip'
					});

					expect(result).to.deep.equal({
						created: [],
						tips: [],
						fees: {}
					});
				});

				it('returns the correct ArFSResult revision with if destination folder has a conflicting FILE name and conflict resolution is set to replace', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						driveKey: await getStubDriveKey(),
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'replace'
					});

					// Pass expected existing file id, so that the file would be considered a revision
					assertUploadFileExpectations(result, W(3220), W(187), W(1), 'private', existingFileId);
				});

				it('returns empty ArFSResult if destination folder has a conflicting FILE name and a matching last modified date and the conflict resolution is set to upsert', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(wrappedFile, 'lastModifiedDate').get(() => matchingLastModifiedDate);

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile,
						driveKey: await getStubDriveKey(),
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'upsert'
					});

					expect(result).to.deep.equal({
						created: [],
						tips: [],
						fees: {}
					});
				});

				it('returns the correct ArFSResult revision if destination folder has a conflicting FILE name and a different last modified date and the conflict resolution is set to upsert', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(wrappedFile, 'lastModifiedDate').get(() => differentLastModifiedDate);

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'upsert',
						driveKey: await getStubDriveKey()
					});

					// Pass expected existing file id, so that the file would be considered a revision
					assertUploadFileExpectations(result, W(3220), W(178), W('1'), 'private', existingFileId);
				});

				it('returns the correct ArFSResult if destination folder has a conflicting FILE name and the conflict resolution is set to ask and the user supplies a new file name', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
						resolution: 'rename',
						newFileName: 'New File!'
					});

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'ask',
						driveKey: await getStubDriveKey(),
						prompts: stubbedFileAskPrompts
					});

					assertUploadFileExpectations(result, W(3220), W(175), W('1'), 'private');
				});

				it('returns the correct revision ArFSResult if destination folder has a conflicting FILE name and the conflict resolution is set to ask and the user chooses to replace', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
						resolution: 'replace'
					});

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'ask',
						driveKey: await getStubDriveKey(),
						prompts: stubbedFileAskPrompts
					});

					assertUploadFileExpectations(result, W(3220), W(187), W('1'), 'private', existingFileId);
				});

				it('returns the correct empty ArFSResult if destination folder has a conflicting FILE name and the conflict resolution is set to ask and the user chooses to skip', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
						resolution: 'skip'
					});

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: stubEntityID,
						wrappedFile,
						destinationFileName: 'CONFLICTING_FILE_NAME',
						conflictResolution: 'ask',
						driveKey: await getStubDriveKey(),
						prompts: stubbedFileAskPrompts
					});

					expect(result).to.deep.equal({
						created: [],
						tips: [],
						fees: {}
					});
				});

				it('returns the correct bundled ArFSResult', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					const stubDriveKey = await getStubDriveKey();

					const result = await bundledArDrive.uploadPrivateFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile,
						driveKey: stubDriveKey
					});
					assertUploadFileExpectations(result, W(6097), W(182), W(1), 'private', undefined, true);
				});

				it('returns the correct ArFSResult', async () => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
					const stubDriveKey = await getStubDriveKey();

					const result = await arDrive.uploadPrivateFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile,
						driveKey: stubDriveKey
					});
					assertUploadFileExpectations(result, W(3220), W(182), W(1), 'private');
				});
			});

			describe('movePublicFile', () => {
				beforeEach(() => {
					stub(arfsDao, 'getPublicEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
				});

				it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
					stub(arfsDao, 'getOwnerForDriveId').resolves(unexpectedOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePublicFile({
							fileId: stubEntityID,
							newParentFolderId: stubEntityIDAlt
						}),
						errorMessage: 'Supplied wallet is not the owner of this drive!'
					});
				});

				it('throws an error if the destination folder has a conflicting entity name', async () => {
					stub(arfsDao, 'getPublicFile').resolves(stubPublicFile({ fileName: 'CONFLICTING_NAME' }));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePublicFile({
							fileId: stubEntityID,
							newParentFolderId: stubEntityIDAlt
						}),
						errorMessage: 'Entity name already exists in destination folder!'
					});
				});

				it('throws an error if the new parent folder id matches its current parent folder id', async () => {
					stub(arfsDao, 'getPublicFile').resolves(stubPublicFile({}));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePublicFile({
							fileId: stubEntityID,
							newParentFolderId: EID(stubEntityID.toString())
						})
					});
				});

				it('throws an error if the file is being moved to a different drive', async () => {
					stub(arfsDao, 'getPublicFile').resolves(stubPublicFile({ driveId: unexpectedDriveId }));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePublicFile({
							fileId: stubEntityID,
							newParentFolderId: EID(stubEntityID.toString())
						}),
						errorMessage: 'Entity must stay in the same drive!'
					});
				});

				it('returns the correct ArFSResult', async () => {
					stub(arfsDao, 'getPublicFile').resolves(stubPublicFile({}));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					const result = await arDrive.movePublicFile({
						fileId: stubEntityID,
						newParentFolderId: stubEntityIDAlt
					});
					assertMoveFileExpectations(result, W(153), 'public');
				});
			});

			describe('movePrivateFile', () => {
				beforeEach(() => {
					stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
				});

				it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
					stub(arfsDao, 'getOwnerForDriveId').resolves(unexpectedOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePrivateFile({
							fileId: stubEntityID,
							newParentFolderId: stubEntityIDAlt,
							driveKey: await getStubDriveKey()
						}),
						errorMessage: 'Supplied wallet is not the owner of this drive!'
					});
				});

				it('throws an error if the destination folder has a conflicting entity name', async () => {
					stub(arfsDao, 'getPrivateFile').resolves(stubPrivateFile({ fileName: 'CONFLICTING_NAME' }));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePrivateFile({
							fileId: stubEntityID,
							newParentFolderId: stubEntityIDAlt,
							driveKey: await getStubDriveKey()
						}),
						errorMessage: 'Entity name already exists in destination folder!'
					});
				});

				it('throws an error if the new parent folder id matches its current parent folder id', async () => {
					stub(arfsDao, 'getPrivateFile').resolves(stubPrivateFile({}));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePrivateFile({
							fileId: stubEntityID,
							newParentFolderId: EID(stubEntityID.toString()),
							driveKey: await getStubDriveKey()
						}),
						errorMessage: `File already has parent folder with ID: ${stubEntityID}`
					});
				});

				it('throws an error if the file is being moved to a different drive', async () => {
					stub(arfsDao, 'getPrivateFile').resolves(stubPrivateFile({ driveId: unexpectedDriveId }));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					await expectAsyncErrorThrow({
						promiseToError: arDrive.movePrivateFile({
							fileId: stubEntityID,
							newParentFolderId: EID(stubEntityID.toString()),
							driveKey: await getStubDriveKey()
						}),
						errorMessage: 'Entity must stay in the same drive!'
					});
				});

				it('returns the correct ArFSResult', async () => {
					stub(arfsDao, 'getPrivateFile').resolves(stubPrivateFile({}));
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

					const result = await arDrive.movePrivateFile({
						fileId: stubEntityID,
						newParentFolderId: stubEntityIDAlt,
						driveKey: await getStubDriveKey()
					});
					assertMoveFileExpectations(result, W(169), 'private');
				});
			});
		});
	});

	describe('uploadPublicManifest', async () => {
		beforeEach(() => {
			stub(arfsDao, 'getDriveIdForFolderId').resolves(stubEntityID);
			stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
			stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
			stub(communityOracle, 'getCommunityWinstonTip').resolves(W('1'));
			stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());
			stub(arfsDao, 'getPublicNameConflictInfoInFolder').resolves(stubNameConflictInfo);
		});

		it('returns the correct ArFSManifestResult revision if destination folder has a conflicting FILE name and conflictResolution is set to replace', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubPublicEntitiesWithPaths);

			const result = await arDrive.uploadPublicManifest({
				folderId: stubEntityID,
				destManifestName: 'CONFLICTING_FILE_NAME',
				conflictResolution: 'replace'
			});

			assertUploadManifestExpectations(result, W(336), W(186), W(1), existingFileId);
		});

		it('returns the correct ArFSManifestResult revision if destination folder has a conflicting FILE name and conflictResolution is set to upsert', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubPublicEntitiesWithPaths);

			const result = await arDrive.uploadPublicManifest({
				folderId: stubEntityID,
				destManifestName: 'CONFLICTING_FILE_NAME',
				conflictResolution: 'upsert'
			});

			assertUploadManifestExpectations(result, W(336), W(186), W(1), existingFileId);
		});

		it('returns an empty ArFSManifestResult if destination folder has a conflicting FILE name and conflictResolution is set to skip', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubPublicEntitiesWithPaths);

			const result = await arDrive.uploadPublicManifest({
				folderId: stubEntityID,
				destManifestName: 'CONFLICTING_FILE_NAME',
				conflictResolution: 'skip'
			});

			expect(result).to.deep.equal({
				created: [],
				tips: [],
				fees: {},
				manifest: {},
				links: []
			});
		});

		it('throws an error if destination folder has a conflicting FOLDER name', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubPublicEntitiesWithPaths);

			await expectAsyncErrorThrow({
				promiseToError: arDrive.uploadPublicManifest({
					folderId: stubEntityID,
					destManifestName: 'CONFLICTING_FOLDER_NAME'
				}),
				errorMessage: 'Entity name already exists in destination folder!'
			});
		});

		it('returns the correct ArFSManifestResult', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubPublicEntitiesWithPaths);

			const result = await arDrive.uploadPublicManifest({
				folderId: stubEntityID
			});

			assertUploadManifestExpectations(result, W(336), W(183), W(1));
		});

		it('returns the correct bundled ArFSManifestResult', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubPublicEntitiesWithPaths);

			const result = await bundledArDrive.uploadPublicManifest({
				folderId: stubEntityID
			});

			assertUploadManifestExpectations(result, W(3108), W(183), W(1), undefined, undefined, true);
		});

		it('returns the correct ArFSManifestResult when using special characters', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubSpecialCharEntitiesWithPaths);

			const result = await arDrive.uploadPublicManifest({
				folderId: stubEntityID
			});

			assertUploadManifestExpectations(result, W(475), W(183), W(1), undefined, true);
		});

		it('throws an error if target folder has no files to put in the manifest', async () => {
			stub(arfsDao, 'listPublicFolder').resolves(stubEntitiesWithNoFilesWithPaths);

			await expectAsyncErrorThrow({
				promiseToError: arDrive.uploadPublicManifest({
					folderId: stubEntityID
				}),
				errorMessage: 'Cannot construct a manifest of a folder that has no file entities!'
			});
		});
	});

	const stubbedFolderAskPrompts: FolderConflictPrompts = {
		fileToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
		fileToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' }),
		folderToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
		folderToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' })
	};

	describe('uploadAllEntities ArDrive method', () => {
		beforeEach(() => {
			stub(arfsDao, 'getDriveIdForFolderId').resolves(stubEntityID);
			stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
			stub(communityOracle, 'getCommunityWinstonTip').resolves(W('1'));
			stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());
			stub(arfsDao, 'getPublicNameConflictInfoInFolder').resolves(stubNameConflictInfo);
			stub(arfsDao, 'getPrivateNameConflictInfoInFolder').resolves(stubNameConflictInfo);
		});

		it('returns the expected v2 ArFSResult with a single public file', async () => {
			const result = await arDrive.uploadAllEntities({ entitiesToUpload: [stubFileUploadStats()] });

			assertUploadFileExpectations(result, W(3204), W(166), W(1), 'public');
		});

		it('returns the expected v2 ArFSResult with a single private file', async () => {
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [{ ...stubFileUploadStats(), driveKey: await getStubDriveKey() }]
			});

			assertUploadFileExpectations(result, W(3220), W(182), W(1), 'private');
		});

		it('returns the expected bundled ArFSResult with a single public file', async () => {
			const result = await bundledArDrive.uploadAllEntities({ entitiesToUpload: [stubFileUploadStats()] });

			assertUploadFileExpectations(result, W(5959), W(166), W(1), 'public', undefined, true);
		});

		it('returns the expected bundled ArFSResult with two over-sized files', async () => {
			const overSizedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
			stub(overSizedFile, 'size').get(() => new ByteCount(+MAX_BUNDLE_SIZE + 1));
			const overSizedFileStats = { ...stubFileUploadStats(), wrappedEntity: overSizedFile };

			const { created, fees, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [overSizedFileStats, overSizedFileStats]
			});

			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(3);
			expect(tips.length).to.equal(2);
			expect(feeKeys.length).to.equal(3);

			assertFileCreatedResult(created[0]);
			assertFileCreatedResult(created[1]);

			assertBundleCreatedResult(created[2]);

			const file1DataTxId = created[0].dataTxId!;
			const file2DataTxId = created[1].dataTxId!;
			const bundleTxId = created[2].bundleTxId!;

			assertTipSetting(tips[0], file1DataTxId);
			assertTipSetting(tips[1], file2DataTxId);

			expect(feeKeys[0]).to.equal(`${file1DataTxId}`);
			expect(+fees[`${file1DataTxId}`]).to.equal(+MAX_BUNDLE_SIZE + 1);

			expect(feeKeys[1]).to.equal(`${file2DataTxId}`);
			expect(+fees[`${file2DataTxId}`]).to.equal(+MAX_BUNDLE_SIZE + 1);

			expect(feeKeys[2]).to.equal(`${bundleTxId}`);
			expect(+fees[`${bundleTxId}`]).to.equal(3124);
		});

		it('returns the expected bundled ArFSResult with a folder that has two over-sized files', async () => {
			const overSizedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
			stub(overSizedFile, 'size').get(() => new ByteCount(+MAX_BUNDLE_SIZE + 1));

			const folderWithOverSizedFiles = stubEmptyFolderStats();
			folderWithOverSizedFiles.wrappedEntity.files = [overSizedFile, overSizedFile];

			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [folderWithOverSizedFiles]
			});

			const { created, fees, tips } = result;
			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(4);
			expect(tips.length).to.equal(2);
			expect(feeKeys.length).to.equal(3);

			assertFolderCreatedResult(created[0]);

			assertFileCreatedResult(created[1]);
			assertFileCreatedResult(created[2]);

			assertBundleCreatedResult(created[3]);

			const file1DataTxId = created[1].dataTxId!;
			const file2DataTxId = created[2].dataTxId!;
			const bundleTxId = created[3].bundleTxId!;

			assertTipSetting(tips[0], file1DataTxId);
			assertTipSetting(tips[1], file2DataTxId);

			expect(feeKeys[0]).to.equal(`${file1DataTxId}`);
			expect(+fees[`${file1DataTxId}`]).to.equal(+MAX_BUNDLE_SIZE + 1);

			expect(feeKeys[1]).to.equal(`${file2DataTxId}`);
			expect(+fees[`${file2DataTxId}`]).to.equal(+MAX_BUNDLE_SIZE + 1);

			expect(feeKeys[2]).to.equal(`${bundleTxId}`);
			expect(+fees[`${bundleTxId}`]).to.equal(3215);
		});

		it('returns an empty result if a folder name conflicts with a folder name and use chooses to skip the folder via an ask prompt', async () => {
			stub(stubbedFolderAskPrompts, 'folderToFileNameConflict').resolves({ resolution: 'skip' });

			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						...stubFolderUploadStats(),
						destName: 'CONFLICTING_FOLDER_NAME',
						driveKey: await getStubDriveKey()
					}
				],
				conflictResolution: 'ask',
				prompts: stubbedFolderAskPrompts
			});

			expect(result).to.deep.equal({
				created: [],
				tips: [],
				fees: {}
			});
		});

		it('returns the expected ArFSResult for two empty folders', async () => {
			const { created, fees, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [stubEmptyFolderStats(), stubEmptyFolderStats()],
				conflictResolution: 'ask',
				prompts: stubbedFolderAskPrompts
			});
			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(3);
			expect(tips.length).to.equal(0);
			expect(feeKeys.length).to.equal(1);

			assertFolderCreatedResult(created[0]);
			assertFolderCreatedResult(created[1]);

			assertBundleCreatedResult(created[2]);

			expect(feeKeys[0]).to.equal(`${created[2].bundleTxId!}`);
			expect(+fees[`${created[2].bundleTxId}`]).to.equal(214);
		});

		it('throws an error if a folder name conflicts with a file name', async () => {
			await expectAsyncErrorThrow({
				promiseToError: bundledArDrive.uploadAllEntities({
					entitiesToUpload: [{ ...stubFolderUploadStats(), destName: 'CONFLICTING_FILE_NAME' }]
				}),
				errorMessage: 'Entity name already exists in destination folder!'
			});
		});

		it('throws an error if a file name conflicts with a folder name', async () => {
			await expectAsyncErrorThrow({
				promiseToError: bundledArDrive.uploadAllEntities({
					entitiesToUpload: [{ ...stubFileUploadStats(), destName: 'CONFLICTING_FOLDER_NAME' }]
				}),
				errorMessage: 'Entity name already exists in destination folder!'
			});
		});

		it('throws an error if a folder name conflicts with a file name', async () => {
			await expectAsyncErrorThrow({
				promiseToError: bundledArDrive.uploadAllEntities({
					entitiesToUpload: [{ ...stubFolderUploadStats(), destName: 'CONFLICTING_FILE_NAME' }]
				}),
				errorMessage: 'Entity name already exists in destination folder!'
			});
		});

		it('returns the expected bundled ArFSResult with a single private file', async () => {
			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ ...stubFileUploadStats(), driveKey: await getStubDriveKey() }]
			});

			assertUploadFileExpectations(result, W(6097), W(182), W(1), 'private', undefined, true);
		});

		it('returns the expected v2 ArFSResult with a single public folder', async () => {
			const result = await arDrive.uploadAllEntities({ entitiesToUpload: [stubEmptyFolderStats()] });

			assertCreateFolderExpectations(result, W(27));
		});

		it('returns the expected v2 ArFSResult with a single private folder', async () => {
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [{ ...stubEmptyFolderStats(), driveKey: await getStubDriveKey() }]
			});

			assertCreateFolderExpectations(result, W(43), urlEncodeHashKey(await getStubDriveKey()));
		});
	});
});

function assertCreateDriveExpectations(
	result: ArFSResult,
	driveFee: Winston,
	folderFee?: Winston,
	expectedDriveKey?: string,
	isBundled = false
) {
	// Ensure that 3 arfs entities are created with a bundled transaction,
	// and 2 arfs entities are created during a v2 transaction
	expect(result.created.length).to.equal(isBundled ? 3 : 2);

	// Ensure that the drive entity looks healthy
	const driveEntity = result.created[0];
	expect(driveEntity.dataTxId).to.be.undefined;
	expect(driveEntity.entityId).to.match(entityIdRegex);
	expect(driveEntity.key).to.equal(expectedDriveKey);
	expect(driveEntity.metadataTxId).to.match(txIdRegex);
	expect(driveEntity.type).to.equal('drive');

	// Ensure that the root folder entity looks healthy
	const rootFolderEntity = result.created[1];
	expect(rootFolderEntity.dataTxId).to.be.undefined;
	expect(rootFolderEntity.entityId).to.match(entityIdRegex);
	expect(rootFolderEntity.key).to.equal(expectedDriveKey);
	expect(rootFolderEntity.metadataTxId).to.match(txIdRegex);
	expect(rootFolderEntity.type).to.equal('folder');

	// There should be no tips
	expect(result.tips).to.be.empty;

	const feeKeys = Object.keys(result.fees);

	if (isBundled) {
		// Ensure that the bundle tx looks healthy
		const bundleEntity = result.created[2];
		expect(bundleEntity.dataTxId).to.be.undefined;
		expect(bundleEntity.entityId).to.be.undefined;
		expect(bundleEntity.key).to.be.undefined;
		expect(bundleEntity.metadataTxId).to.be.undefined;
		expect(bundleEntity.bundleTxId).to.match(txIdRegex);
		expect(bundleEntity.type).to.equal('bundle');

		// Ensure that the bundle fee look healthy
		expect(feeKeys.length).to.equal(1);
		expect(feeKeys[0]).to.equal(bundleEntity.bundleTxId!.toString());
		expect(feeKeys[0]).to.match(txIdRegex);
		expect(`${result.fees[bundleEntity.bundleTxId!.toString()]}`).to.equal(`${driveFee}`);
	} else {
		// Ensure that the V2 transaction fees look healthy
		expect(feeKeys.length).to.equal(2);
		expect(feeKeys[0]).to.equal(driveEntity.metadataTxId!.toString());
		expect(feeKeys[0]).to.match(txIdRegex);
		expect(`${result.fees[driveEntity.metadataTxId!.toString()]}`).to.equal(`${driveFee}`);
		expect(feeKeys[1]).to.equal(rootFolderEntity.metadataTxId!.toString());
		expect(feeKeys[1]).to.match(txIdRegex);
		expect(`${result.fees[rootFolderEntity.metadataTxId!.toString()]}`).to.equal(`${folderFee}`);
	}
}

function assertCreateFolderExpectations(result: ArFSResult, folderFee: Winston, expectedDriveKey?: string) {
	// Ensure that 1 arfs entity was created
	expect(result.created.length).to.equal(1);

	// Ensure that the folder entity looks healthy
	const folderEntity = result.created[0];
	expect(folderEntity.dataTxId).to.be.undefined;
	expect(folderEntity.entityId).to.match(entityIdRegex);
	expect(folderEntity.key).to.equal(expectedDriveKey);
	expect(folderEntity.metadataTxId).to.match(txIdRegex);
	expect(folderEntity.type).to.equal('folder');

	// There should be no tips
	expect(result.tips).to.be.empty;

	// Ensure that the fees look healthy
	const feeKeys = Object.keys(result.fees);
	expect(feeKeys.length).to.equal(1);
	expect(feeKeys[0]).to.match(txIdRegex);
	expect(feeKeys[0]).to.equal(folderEntity.metadataTxId!.toString());
	expect(`${result.fees[folderEntity.metadataTxId!.toString()]}`).to.equal(`${folderFee}`);
}

function assertUploadFileExpectations(
	result: ArFSResult,
	fileFee: Winston,
	metadataFee: Winston,
	expectedTip: Winston,
	drivePrivacy: DrivePrivacy,
	expectedFileId?: FileID,
	isBundled = false
) {
	// Ensure that 2 arfs entities are created with a bundled transaction,
	// and 1 arfs entity is created during a v2 transaction
	expect(result.created.length).to.equal(isBundled ? 2 : 1);

	// Ensure that the file data entity looks healthy
	const fileEntity = result.created[0];
	expect(fileEntity.dataTxId).to.match(txIdRegex);
	expect(fileEntity.entityId).to.match(entityIdRegex);

	if (expectedFileId) {
		expect(fileEntity.entityId).to.equal(expectedFileId);
	}

	switch (drivePrivacy) {
		case 'public':
			expect(fileEntity.key).to.equal(undefined);
			break;
		case 'private':
			expect(fileEntity.key).to.match(fileKeyRegex);
	}
	expect(fileEntity.metadataTxId).to.match(txIdRegex);
	expect(fileEntity.type).to.equal('file');

	// There should be 1 tip
	expect(result.tips.length).to.equal(1);
	const uploadTip = result.tips[0];
	expect(uploadTip.txId).to.match(txIdRegex);
	expect(`${uploadTip.winston}`).to.equal(`${expectedTip}`);
	expect(uploadTip.recipient).to.match(txIdRegex);

	const feeKeys = Object.keys(result.fees);

	if (isBundled) {
		// Ensure that the bundle tx looks healthy
		const bundleEntity = result.created[1];
		expect(bundleEntity.dataTxId).to.be.undefined;
		expect(bundleEntity.entityId).to.be.undefined;
		expect(bundleEntity.key).to.be.undefined;
		expect(bundleEntity.metadataTxId).to.be.undefined;
		expect(bundleEntity.bundleTxId).to.match(txIdRegex);
		expect(bundleEntity.type).to.equal('bundle');

		// Ensure that the bundle fee looks healthy
		expect(feeKeys.length).to.equal(1);
		expect(feeKeys[0]).to.equal(bundleEntity.bundleTxId!.toString());
		expect(feeKeys[0]).to.match(txIdRegex);
		expect(`${result.fees[bundleEntity.bundleTxId!.toString()]}`).to.equal(`${fileFee}`);
	} else {
		// Ensure that the fees look healthy
		expect(feeKeys.length).to.equal(2);

		expect(feeKeys[0]).to.match(txIdRegex);
		expect(feeKeys[0]).to.equal(fileEntity.dataTxId!.toString());
		expect(`${result.fees[fileEntity.dataTxId!.toString()]}`).to.equal(`${fileFee}`);

		expect(feeKeys[1]).to.match(txIdRegex);
		expect(feeKeys[1]).to.equal(fileEntity.metadataTxId!.toString());
		expect(`${result.fees[fileEntity.metadataTxId!.toString()]}`).to.equal(`${metadataFee}`);
	}
}

function assertMoveFileExpectations(result: ArFSResult, fileFee: Winston, drivePrivacy: DrivePrivacy) {
	// Ensure that 1 arfs entity was created
	expect(result.created.length).to.equal(1);

	// Ensure that the file entity looks healthy
	const fileEntity = result.created[0];
	expect(fileEntity.dataTxId).to.match(txIdRegex);
	expect(fileEntity.entityId).to.match(entityIdRegex);
	switch (drivePrivacy) {
		case 'public':
			expect(fileEntity.key).to.equal(undefined);
			break;
		case 'private':
			expect(fileEntity.key).to.match(fileKeyRegex);
	}
	expect(fileEntity.metadataTxId).to.match(txIdRegex);
	expect(fileEntity.type).to.equal('file');

	// There should be no tips
	expect(result.tips).to.be.empty;

	// Ensure that the fees look healthy
	const feeKeys = Object.keys(result.fees);
	expect(feeKeys.length).to.equal(1);
	expect(feeKeys[0]).to.match(txIdRegex);
	expect(feeKeys[0]).to.equal(fileEntity.metadataTxId!.toString());
	expect(`${result.fees[fileEntity.metadataTxId!.toString()]}`).to.equal(`${fileFee}`);
}

function assertUploadManifestExpectations(
	result: ArFSManifestResult,
	fileFee: Winston,
	metadataFee: Winston,
	expectedTip: Winston,
	expectedFileId?: FileID,
	specialCharacters = false,
	isBundled = false
) {
	// Ensure that 2 arfs entities are created with a bundled transaction,
	// and 1 arfs entity is created during a v2 transaction
	expect(result.created.length).to.equal(isBundled ? 2 : 1);

	// Ensure that the file data entity looks healthy
	const fileEntity = result.created[0];
	expect(fileEntity.dataTxId).to.match(txIdRegex);
	expect(fileEntity.entityId).to.match(entityIdRegex);

	if (expectedFileId) {
		expect(fileEntity.entityId).to.equal(expectedFileId);
	}

	expect(fileEntity.metadataTxId).to.match(txIdRegex);
	expect(fileEntity.type).to.equal('file');

	// There should be 1 tip
	expect(result.tips.length).to.equal(1);
	const uploadTip = result.tips[0];
	expect(uploadTip.txId).to.match(txIdRegex);
	expect(`${uploadTip.winston}`).to.equal(`${expectedTip}`);
	expect(uploadTip.recipient).to.match(txIdRegex);

	const feeKeys = Object.keys(result.fees);

	if (isBundled) {
		// Ensure that the bundle tx looks healthy
		const bundleEntity = result.created[1];
		expect(bundleEntity.dataTxId).to.be.undefined;
		expect(bundleEntity.entityId).to.be.undefined;
		expect(bundleEntity.key).to.be.undefined;
		expect(bundleEntity.metadataTxId).to.be.undefined;
		expect(bundleEntity.bundleTxId).to.match(txIdRegex);
		expect(bundleEntity.type).to.equal('bundle');

		// Ensure that the bundle fee look healthy
		expect(feeKeys.length).to.equal(1);
		expect(feeKeys[0]).to.equal(bundleEntity.bundleTxId!.toString());
		expect(feeKeys[0]).to.match(txIdRegex);
		expect(`${result.fees[bundleEntity.bundleTxId!.toString()]}`).to.equal(`${fileFee}`);
	} else {
		// Ensure that the fees look healthy
		expect(feeKeys.length).to.equal(2);

		expect(feeKeys[0]).to.match(txIdRegex);
		expect(feeKeys[0]).to.equal(fileEntity.dataTxId!.toString());
		expect(`${result.fees[fileEntity.dataTxId!.toString()]}`).to.equal(`${fileFee}`);

		expect(feeKeys[1]).to.match(txIdRegex);
		expect(feeKeys[1]).to.equal(fileEntity.metadataTxId!.toString());
		expect(`${result.fees[fileEntity.metadataTxId!.toString()]}`).to.equal(`${metadataFee}`);
	}

	if (specialCharacters) {
		// Verify links are healthy
		expect(result.links.length).to.equal(4);
		expect(result.links[0]).to.equal(`https://arweave.net/${result.created[0].dataTxId}`);
		expect(result.links[1]).to.equal(
			`https://arweave.net/${result.created[0].dataTxId}/%25%26%40*(%25%26(%40*%3A%22%3E%3F%7B%7D%5B%5D`
		);
		expect(result.links[2]).to.equal(
			`https://arweave.net/${result.created[0].dataTxId}/~!%40%23%24%25%5E%26*()_%2B%7B%7D%7C%5B%5D%3A%22%3B%3C%3E%3F%2C./%60/'/''_%5C___''_'__/'___'''_/QWERTYUIOPASDFGHJKLZXCVBNM!%40%23%24%25%5E%26*()_%2B%7B%7D%3A%22%3E%3F`
		);
		expect(result.links[3]).to.equal(
			`https://arweave.net/${result.created[0].dataTxId}/~!%40%23%24%25%5E%26*()_%2B%7B%7D%7C%5B%5D%3A%22%3B%3C%3E%3F%2C./%60/dwijqndjqwnjNJKNDKJANKDNJWNJIvmnbzxnmvbcxvbm%2Cuiqwerioeqwndjkla`
		);

		// Assert manifest shape
		expect(result.manifest).to.deep.equal({
			manifest: 'arweave/paths',
			version: '0.1.0',
			index: { path: '%&@*(%&(@*:">?{}[]' },
			paths: {
				'%&@*(%&(@*:">?{}[]': { id: '0000000000000000000000000000000000000000001' },
				"~!@#$%^&*()_+{}|[]:\";<>?,./`/'/''_\\___''_'__/'___'''_/QWERTYUIOPASDFGHJKLZXCVBNM!@#$%^&*()_+{}:\">?":
					// eslint-disable-next-line prettier/prettier
					{ id: '0000000000000000000000000000000000000000003' },
				'~!@#$%^&*()_+{}|[]:";<>?,./`/dwijqndjqwnjNJKNDKJANKDNJWNJIvmnbzxnmvbcxvbm,uiqwerioeqwndjkla': {
					id: '0000000000000000000000000000000000000000002'
				}
			}
		});
	} else {
		// Verify links are healthy
		expect(result.links.length).to.equal(4);
		expect(result.links[0]).to.equal(`https://arweave.net/${result.created[0].dataTxId}`);
		expect(result.links[1]).to.equal(`https://arweave.net/${result.created[0].dataTxId}/file-in-root`);
		expect(result.links[2]).to.equal(
			`https://arweave.net/${result.created[0].dataTxId}/parent-folder/child-folder/file-in-child`
		);
		expect(result.links[3]).to.equal(
			`https://arweave.net/${result.created[0].dataTxId}/parent-folder/file-in-parent`
		);

		// Assert manifest shape
		expect(result.manifest).to.deep.equal({
			manifest: 'arweave/paths',
			version: '0.1.0',
			index: { path: 'file-in-root' },
			paths: {
				'file-in-root': { id: '0000000000000000000000000000000000000000001' },
				'parent-folder/child-folder/file-in-child': { id: '0000000000000000000000000000000000000000003' },
				'parent-folder/file-in-parent': { id: '0000000000000000000000000000000000000000002' }
			}
		});
	}
}

function assertFileCreatedResult(
	{ type, bundleTxId, dataTxId, entityId, key, metadataTxId }: ArFSEntityData,
	expectFileKey = false,
	expectedFileId?: FileID
) {
	expect(type).to.equal('file');

	expect(bundleTxId).to.be.undefined;
	expect(metadataTxId).to.match(txIdRegex);
	expect(dataTxId).to.match(txIdRegex);

	if (expectedFileId) {
		expect(`${entityId}`).to.equal(`${expectedFileId}`);
	} else {
		expect(entityId).to.match(entityIdRegex);
	}

	if (expectFileKey) {
		expect(key).to.exist;
	} else {
		expect(key).to.be.undefined;
	}
}

function assertFolderCreatedResult(
	{ type, bundleTxId, dataTxId, entityId, key, metadataTxId }: ArFSEntityData,
	expectDriveKey = false,
	expectedFolderId?: FolderID
) {
	expect(type).to.equal('folder');

	expect(bundleTxId).to.be.undefined;
	expect(dataTxId).to.be.undefined;
	expect(metadataTxId).to.match(txIdRegex);

	if (expectedFolderId) {
		expect(`${entityId}`).to.equal(`${expectedFolderId}`);
	} else {
		expect(entityId).to.match(entityIdRegex);
	}

	if (expectDriveKey) {
		// Output of stubDriveKey
		expect(key).to.equal('nxTl2ki5hWjyYE0SjOg2FV3PE7EBKMe9E6kD8uOvm6w');
	} else {
		expect(key).to.be.undefined;
	}
}

function assertBundleCreatedResult({ type, bundleTxId, dataTxId, entityId, key, metadataTxId }: ArFSEntityData) {
	expect(type).to.equal('bundle');

	expect(bundleTxId).to.match(txIdRegex);
	expect(dataTxId).to.be.undefined;
	expect(metadataTxId).to.be.undefined;

	expect(entityId).to.be.undefined;
	expect(key).to.be.undefined;
}

function assertTipSetting({ recipient, txId, winston }: TipData, expectedTxId: TransactionID, expectedReward = 1) {
	expect(`${recipient}`).to.equal('abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH');
	expect(`${txId}`).to.equal(`${expectedTxId}`);
	expect(+winston).to.equal(expectedReward);
}
