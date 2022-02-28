/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { stub } from 'sinon';
import { statSync } from 'fs';
import { ArDrive } from '../../src/ardrive';
import { RootFolderID } from '../../src/arfs/arfs_builders/arfs_folder_builders';
import { wrapFileOrFolder, ArFSFileToUpload, ArFSFolderToUpload } from '../../src/arfs/arfs_file_wrapper';
import { ArFSDAO, PrivateDriveKeyData } from '../../src/arfs/arfsdao';
import { ArDriveCommunityOracle } from '../../src/community/ardrive_community_oracle';
import { deriveDriveKey } from '../../src/utils/crypto';
import { ARDataPriceRegressionEstimator } from '../../src/pricing/ar_data_price_regression_estimator';
import { GatewayOracle } from '../../src/pricing/gateway_oracle';
import {
	ArFSManifestResult,
	ArFSResult,
	DriveKey,
	DrivePrivacy,
	EID,
	EntityType,
	FeeMultiple,
	FileConflictPrompts,
	FileID,
	FolderConflictPrompts,
	ArFSEntityData,
	FolderID,
	ByteCount,
	TipData,
	TransactionID,
	UnixTime,
	W,
	Winston
} from '../../src/types';
import { readJWKFile } from '../../src/utils/common';
import {
	fakeArweave,
	stubArweaveAddress,
	stubEntitiesWithNoFilesWithPaths,
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDChild,
	stubEntityIDGrandchild,
	stubEntityIDParent,
	stubEntityIDRoot,
	stubPrivateDrive,
	stubPrivateFile,
	stubPrivateFolder,
	stubPublicDrive,
	stubPublicEntitiesWithPaths,
	stubSpecialCharEntitiesWithPaths,
	stubPublicEntities,
	stubPublicFolders,
	stubPublicHierarchy,
	stubEntityIDAltTwo,
	stubFileUploadStats,
	stubEmptyFolderStats,
	stubFolderUploadStats,
	stubEmptyFolderToUpload,
	stubFileToUpload,
	stubPublicFile,
	stubPublicFolder
} from '../stubs';
import { expectAsyncErrorThrow } from '../test_helpers';
import { JWKWallet } from '../../src/jwk_wallet';
import { WalletDAO } from '../../src/wallet_dao';
import { ArFSUploadPlanner } from '../../src/arfs/arfs_upload_planner';
import { ArFSTagSettings } from '../../src/arfs/arfs_tag_settings';
import {
	ArFSPrivateFile,
	ArFSPrivateFolder,
	FolderHierarchy,
	privateEntityWithPathsFactory,
	privateEntityWithPathsKeylessFactory,
	publicEntityWithPathsFactory
} from '../../src/exports';
import { MAX_BUNDLE_SIZE } from '../../src/utils/constants';

// Don't use the existing constants just to make sure our expectations don't change
const entityIdRegex = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
const txIdRegex = /^(\w|-){43}$/;
const fileKeyRegex = /^([a-zA-Z]|[0-9]|-|_|\/|\+){43}$/;

enum EntityNameValidationErrorMessageType {
	EMPTY,
	LONG,
	NULL_CHAR
}

describe('ArDrive class - integrated', () => {
	const wallet = readJWKFile('./test_wallet.json');

	const getStubDriveKey = async (): Promise<DriveKey> => {
		const key = await deriveDriveKey(
			'stubPassword',
			`${stubEntityID}`,
			JSON.stringify((wallet as JWKWallet).getPrivateKey())
		);
		return key;
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
	const anotherExistingFileId = EID(stubEntityIDAltTwo.toString());

	const stubNameConflictInfo = {
		files: [
			{
				fileName: 'CONFLICTING_FILE_NAME',
				fileId: existingFileId,
				lastModifiedDate: new UnixTime(420)
			},
			{
				fileName: 'ANOTHER_CONFLICTING_FILE_NAME',
				fileId: anotherExistingFileId,
				lastModifiedDate: new UnixTime(101)
			}
		],
		folders: [{ folderName: 'CONFLICTING_FOLDER_NAME', folderId: stubEntityID }]
	};

	const invalidEntityNameShort = '';
	const invalidEntityNameLong =
		'+===============================================================================================================================================================================================================================================================';
	const invalidEntityNameNullChar = '\0';
	const validEntityName = 'some happy file name which is valid.txt';

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
		describe('getPrivateDrive', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPrivateDrive').returns(stubPrivateDrive());
			});

			it('returns the key-less version of the entitites by default', async () => {
				const drive = await arDrive.getPrivateDrive({
					driveId: stubEntityID,
					owner: walletOwner,
					driveKey: await getStubDriveKey()
				});
				expect(drive.driveKey).to.be.undefined;
			});

			it('returns the with-keys version of the entitites if withKeys is true', async () => {
				const drive = await arDrive.getPrivateDrive({
					driveId: stubEntityID,
					owner: walletOwner,
					driveKey: await getStubDriveKey(),
					withKeys: true
				});
				expect(drive.driveKey).to.not.be.undefined;
			});
		});

		describe('createPublicDrive', () => {
			describe('entity name validation', () => {
				it('throws if the given name is empty', () => {
					const promiseToError = arDrive.createPublicDrive({
						driveName: invalidEntityNameShort
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', () => {
					const promiseToError = arDrive.createPublicDrive({
						driveName: invalidEntityNameLong
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', () => {
					const promiseToError = arDrive.createPublicDrive({
						driveName: invalidEntityNameNullChar
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('returns the correct ArFSResult', async () => {
				const result = await arDrive.createPublicDrive({ driveName: validEntityName });

				assertCreateDriveExpectations(result, W(104), W(50));
			});

			it('returns the correct bundled ArFSResult', async () => {
				const result = await bundledArDrive.createPublicDrive({
					driveName: validEntityName
				});

				assertCreateDriveExpectations(result, W(2809), W(37), undefined, true);
			});
		});

		describe('createPrivateDrive', () => {
			describe('entity name validation', () => {
				it('throws if the given name is empty', async () => {
					const stubDriveKey = await getStubDriveKey();
					const stubPrivateDriveData: PrivateDriveKeyData = {
						driveId: stubEntityID,
						driveKey: stubDriveKey
					};
					const promiseToError = arDrive.createPrivateDrive({
						driveName: invalidEntityNameShort,
						newPrivateDriveData: stubPrivateDriveData
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', async () => {
					const stubDriveKey = await getStubDriveKey();
					const stubPrivateDriveData: PrivateDriveKeyData = {
						driveId: stubEntityID,
						driveKey: stubDriveKey
					};

					const promiseToError = arDrive.createPrivateDrive({
						driveName: invalidEntityNameLong,
						newPrivateDriveData: stubPrivateDriveData
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', async () => {
					const stubDriveKey = await getStubDriveKey();
					const stubPrivateDriveData: PrivateDriveKeyData = {
						driveId: stubEntityID,
						driveKey: stubDriveKey
					};

					const promiseToError = arDrive.createPrivateDrive({
						driveName: invalidEntityNameNullChar,
						newPrivateDriveData: stubPrivateDriveData
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('returns the correct ArFSResult', async () => {
				const stubDriveKey = await getStubDriveKey();
				const stubPrivateDriveData: PrivateDriveKeyData = {
					driveId: stubEntityID,
					driveKey: stubDriveKey
				};

				const result = await arDrive.createPrivateDrive({
					driveName: validEntityName,
					newPrivateDriveData: stubPrivateDriveData
				});

				assertCreateDriveExpectations(result, W(120), W(66), stubDriveKey);
			});

			it('returns the correct bundled ArFSResult', async () => {
				const stubDriveKey = await getStubDriveKey();
				const stubPrivateDriveData: PrivateDriveKeyData = {
					driveId: stubEntityID,
					driveKey: stubDriveKey
				};

				const result = await bundledArDrive.createPrivateDrive({
					driveName: validEntityName,
					newPrivateDriveData: stubPrivateDriveData
				});

				assertCreateDriveExpectations(result, W(2973), W(37), stubDriveKey, true);
			});
		});
	});

	describe('folder function', () => {
		describe('listPublicFolder', () => {
			const [
				stubPublicRootFolder,
				stubPublicParentFolder,
				stubPublicChildFolder,
				stubPublicFileInRoot,
				stubPublicFileInParent,
				stubPublicFileInChild
			] = stubPublicEntities;
			const stubFileEntities = [stubPublicFileInRoot, stubPublicFileInParent, stubPublicFileInChild];

			beforeEach(() => {
				stub(arfsDao, 'getAllFoldersOfPublicDrive').resolves(stubPublicFolders);
				stub(arfsDao, 'getPublicFilesWithParentFolderIds').callsFake(async (searchFolderIDs) =>
					stubFileEntities.filter((entity) =>
						searchFolderIDs.some((folderID) => folderID.equals(entity.parentFolderId))
					)
				);
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				stub(arfsDao, 'getPublicFolder').resolves(stubPublicRootFolder);
			});

			describe('maxDepth parameter', () => {
				it('throws if provided a negative value', () => {
					return expectAsyncErrorThrow({
						promiseToError: arDrive.listPublicFolder({ folderId: stubEntityIDRoot, maxDepth: -1 }),
						errorMessage: 'maxDepth should be a non-negative integer!'
					});
				});

				it('throws if provided a non integer value', () => {
					return expectAsyncErrorThrow({
						promiseToError: arDrive.listPublicFolder({ folderId: stubEntityIDRoot, maxDepth: 0.5 }),
						errorMessage: 'maxDepth should be a non-negative integer!'
					});
				});

				it('lists with depth zero by default', async () => {
					const entities = await arDrive.listPublicFolder({ folderId: stubEntityIDRoot });
					expect(entities.length).to.equal(2);
					expect(entities).to.deep.equal(
						[stubPublicParentFolder, stubPublicFileInRoot].map((entity) =>
							publicEntityWithPathsFactory(entity, stubPublicHierarchy)
						)
					);
				});

				it('maxDepth of one', async () => {
					const entities = await arDrive.listPublicFolder({ folderId: stubEntityIDRoot, maxDepth: 1 });
					expect(entities.length).to.equal(4);
					expect(entities).to.deep.equal(
						[
							stubPublicParentFolder,
							stubPublicChildFolder,
							stubPublicFileInRoot,
							stubPublicFileInParent
						].map((entity) => publicEntityWithPathsFactory(entity, stubPublicHierarchy))
					);
				});

				it('maxDepth to maximum', async () => {
					const entities = await arDrive.listPublicFolder({
						folderId: stubEntityIDRoot,
						maxDepth: Number.MAX_SAFE_INTEGER
					});
					expect(entities.length).to.equal(5);
					expect(entities).to.deep.equal(
						[
							stubPublicParentFolder,
							stubPublicChildFolder,
							stubPublicFileInRoot,
							stubPublicFileInParent,
							stubPublicFileInChild
						].map((entity) => publicEntityWithPathsFactory(entity, stubPublicHierarchy))
					);
				});
			});

			describe('includeRoot flag', () => {
				it('does include root if set as true', async () => {
					const entities = await arDrive.listPublicFolder({ folderId: stubEntityIDRoot, includeRoot: true });
					expect(entities.length).to.equal(3);
					expect(entities[0]).to.deep.equal(
						publicEntityWithPathsFactory(stubPublicRootFolder, stubPublicHierarchy)
					);
				});

				it('does not include root if omitted', async () => {
					const entities = await arDrive.listPublicFolder({ folderId: stubEntityIDRoot });
					expect(entities.length).to.equal(2);
					expect(entities).to.not.include(stubPublicRootFolder);
				});
			});
		});

		describe('listPrivateFolder', () => {
			let stubPrivateRootFolder: ArFSPrivateFolder;
			let stubPrivateParentFolder: ArFSPrivateFolder;
			let stubPrivateFolder_0: ArFSPrivateFolder;
			let stubPrivateFolder_1: ArFSPrivateFolder;
			let stubPrivateFolder_3: ArFSPrivateFolder;
			let stubPrivateGrandChildFile: ArFSPrivateFile;

			let stubFileEntities: ArFSPrivateFile[];
			let stubFolderEntities: ArFSPrivateFolder[];

			let stubPrivateHierarchy: FolderHierarchy;

			let stubDriveKey: DriveKey;

			beforeEach(async () => {
				// Root folder (Depth 0)
				stubPrivateRootFolder = await stubPrivateFolder({
					folderId: stubEntityIDRoot,
					parentFolderId: new RootFolderID(),
					folderName: 'Root Folder'
				});
				// Depth 1
				stubPrivateParentFolder = await stubPrivateFolder({
					folderId: stubEntityIDParent,
					parentFolderId: stubEntityIDRoot,
					folderName: 'Parent folder'
				});
				// Depth 2
				stubPrivateFolder_0 = await stubPrivateFolder({
					folderId: stubEntityID,
					parentFolderId: stubEntityIDParent,
					folderName: 'Child folder #1'
				});
				stubPrivateFolder_1 = await stubPrivateFolder({
					folderId: stubEntityIDAlt,
					parentFolderId: stubEntityIDParent,
					folderName: 'Child folder #2'
				});
				// Depth 3
				stubPrivateFolder_3 = await stubPrivateFolder({
					folderId: stubEntityIDGrandchild,
					parentFolderId: stubEntityID,
					folderName: 'Grand child folder'
				});
				stubPrivateGrandChildFile = await stubPrivateFile({
					fileId: stubEntityIDAltTwo,
					fileName: 'Child file.pdf',
					parentFolderId: stubEntityID
				});

				stubFileEntities = [stubPrivateGrandChildFile];
				stubFolderEntities = [
					stubPrivateRootFolder,
					stubPrivateParentFolder,
					stubPrivateFolder_0,
					stubPrivateFolder_1,
					stubPrivateFolder_3
				];

				stub(arfsDao, 'getAllFoldersOfPrivateDrive').resolves(stubFolderEntities);
				stub(arfsDao, 'getPrivateFilesWithParentFolderIds').callsFake(async (searchFolderIDs) =>
					stubFileEntities.filter((entity) =>
						searchFolderIDs.some((folderID) => folderID.equals(entity.parentFolderId))
					)
				);
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				stub(arfsDao, 'getPrivateFolder').resolves(stubPrivateRootFolder);

				stubPrivateHierarchy = FolderHierarchy.newFromEntities(stubFolderEntities);
				stubDriveKey = await getStubDriveKey();
			});

			describe('maxDepth parameter', () => {
				it('throws if provided a negative value', () => {
					return expectAsyncErrorThrow({
						promiseToError: arDrive.listPrivateFolder({
							folderId: stubEntityIDRoot,
							maxDepth: -1,
							driveKey: stubDriveKey
						}),
						errorMessage: 'maxDepth should be a non-negative integer!'
					});
				});

				it('throws if provided a non integer value', () => {
					return expectAsyncErrorThrow({
						promiseToError: arDrive.listPrivateFolder({
							folderId: stubEntityIDRoot,
							maxDepth: 0.5,
							driveKey: stubDriveKey
						}),
						errorMessage: 'maxDepth should be a non-negative integer!'
					});
				});

				it('lists with depth zero by default', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						driveKey: stubDriveKey
					});
					expect(entities.length).to.equal(1);
					expect(entities).to.deep.equal(
						[stubPrivateParentFolder].map((entity) =>
							privateEntityWithPathsKeylessFactory(entity, stubPrivateHierarchy)
						)
					);
				});

				it('maxDepth of one', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						maxDepth: 1,
						driveKey: stubDriveKey
					});
					expect(entities.length).to.equal(3);
					expect(entities).to.deep.equal(
						[stubPrivateParentFolder, stubPrivateFolder_0, stubPrivateFolder_1].map((entity) =>
							privateEntityWithPathsKeylessFactory(entity, stubPrivateHierarchy)
						)
					);
				});

				it('maxDepth to maximum', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						maxDepth: Number.MAX_SAFE_INTEGER,
						driveKey: stubDriveKey
					});
					expect(entities.length).to.equal(5);
					expect(entities).to.deep.equal(
						[
							stubPrivateParentFolder,
							stubPrivateFolder_0,
							stubPrivateFolder_1,
							stubPrivateFolder_3,
							stubPrivateGrandChildFile
						].map((entity) => privateEntityWithPathsKeylessFactory(entity, stubPrivateHierarchy))
					);
				});
			});

			describe('includeRoot flag', () => {
				it('does include root if set as true', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						includeRoot: true,
						driveKey: stubDriveKey
					});
					expect(entities.length).to.equal(2);
					expect(entities[0]).to.deep.equal(
						privateEntityWithPathsKeylessFactory(stubPrivateRootFolder, stubPrivateHierarchy)
					);
				});

				it('does not include root if omitted', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						driveKey: stubDriveKey
					});
					expect(entities.length).to.equal(1);
					expect(entities).to.not.include(stubPrivateRootFolder);
				});
			});

			describe('withKeys flag', () => {
				it('returns the keyless by default', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						driveKey: stubDriveKey
					});
					expect(entities[0]).to.deep.equal(
						privateEntityWithPathsKeylessFactory(stubPrivateParentFolder, stubPrivateHierarchy)
					);
				});

				it('when specified, returns the entities with keys', async () => {
					const entities = await arDrive.listPrivateFolder({
						folderId: stubEntityIDRoot,
						driveKey: stubDriveKey,
						withKeys: true
					});
					expect(entities[0]).to.deep.equal(
						privateEntityWithPathsFactory(stubPrivateParentFolder, stubPrivateHierarchy)
					);
				});
			});
		});

		describe('getPrivateFolder', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPrivateFolder').returns(stubPrivateFolder({ folderId: stubEntityID }));
			});

			it('returns the key-less version of the entitites by default', async () => {
				const folder = await arDrive.getPrivateFolder({
					folderId: stubEntityID,
					owner: walletOwner,
					driveKey: await getStubDriveKey()
				});
				expect(folder.driveKey).to.be.undefined;
			});

			it('returns the with-keys version of the entitites if withKeys is true', async () => {
				const folder = await arDrive.getPrivateFolder({
					folderId: stubEntityID,
					owner: walletOwner,
					driveKey: await getStubDriveKey(),
					withKeys: true
				});
				expect(folder.driveKey).to.not.be.undefined;
			});
		});

		describe('createPublicFolder', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPublicEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				});

				it('throws if the given name is empty', () => {
					const promiseToError = arDrive.createPublicFolder({
						folderName: invalidEntityNameShort,
						driveId: stubEntityID,
						parentFolderId: stubEntityID
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', () => {
					const promiseToError = arDrive.createPublicFolder({
						folderName: invalidEntityNameLong,
						driveId: stubEntityID,
						parentFolderId: stubEntityID
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', () => {
					const promiseToError = arDrive.createPublicFolder({
						folderName: invalidEntityNameNullChar,
						driveId: stubEntityID,
						parentFolderId: stubEntityID
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(unexpectedOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.createPublicFolder({
						folderName: validEntityName,
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
					folderName: validEntityName,
					driveId: stubEntityID,
					parentFolderId: stubEntityID
				});
				assertCreateFolderExpectations(result, W(50));
			});
		});

		describe('createPrivateFolder', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves(['CONFLICTING_NAME']);
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				});

				it('throws if the given name is empty', async () => {
					const promiseToError = arDrive.createPrivateFolder({
						folderName: invalidEntityNameShort,
						driveId: stubEntityID,
						parentFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', async () => {
					const promiseToError = arDrive.createPrivateFolder({
						folderName: invalidEntityNameLong,
						driveId: stubEntityID,
						parentFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', async () => {
					const promiseToError = arDrive.createPrivateFolder({
						folderName: invalidEntityNameNullChar,
						driveId: stubEntityID,
						parentFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('throws an error if the owner of the drive conflicts with supplied wallet', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(unexpectedOwner);

				await expectAsyncErrorThrow({
					promiseToError: arDrive.createPrivateFolder({
						folderName: validEntityName,
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
				stub(arfsDao, 'getPrivateDrive').returns(stubPrivateDrive());
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);

				const stubDriveKey = await getStubDriveKey();
				const result = await arDrive.createPrivateFolder({
					folderName: validEntityName,
					driveId: stubEntityID,
					parentFolderId: stubEntityID,
					driveKey: stubDriveKey
				});
				assertCreateFolderExpectations(result, W(66), stubDriveKey);
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
			let folderHierarchy: {
				rootFolder: ArFSPrivateFolder;
				parentFolder: ArFSPrivateFolder;
				childFolder: ArFSPrivateFolder;
				grandChildFolder: ArFSPrivateFolder;
			};

			before(async () => {
				folderHierarchy = {
					rootFolder: await stubPrivateFolder({
						folderId: stubEntityIDRoot,
						parentFolderId: new RootFolderID()
					}),
					parentFolder: await stubPrivateFolder({
						folderId: stubEntityIDParent,
						parentFolderId: EID(stubEntityIDRoot.toString())
					}),
					childFolder: await stubPrivateFolder({
						folderId: stubEntityIDChild,
						parentFolderId: EID(stubEntityIDParent.toString())
					}),
					grandChildFolder: await stubPrivateFolder({
						folderId: stubEntityIDGrandchild,
						parentFolderId: EID(stubEntityIDChild.toString())
					})
				};
			});

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
				stub(arfsDao, 'getPrivateFolder').returns(stubPrivateFolder({ folderName: 'CONFLICTING_NAME' }));

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
				stub(arfsDao, 'getPrivateFolder').returns(stubPrivateFolder({ driveId: unexpectedDriveId }));

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
				const stubbedKey = await getStubDriveKey();
				assertCreateFolderExpectations(result, W(36), stubbedKey);
			});
		});
	});

	describe('file function', () => {
		const stubbedFileAskPrompts: FileConflictPrompts = {
			fileToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
			fileToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' })
		};
		let wrappedFile: ArFSFileToUpload;
		const fileStats = statSync('test_wallet.json');

		describe('getPrivateFile', () => {
			beforeEach(() => {
				stub(arfsDao, 'getPrivateFile').returns(stubPrivateFile({ fileId: stubEntityID }));
			});

			it('returns the key-less version of the entitites by default', async () => {
				const file = await arDrive.getPrivateFile({
					fileId: stubEntityID,
					owner: walletOwner,
					driveKey: await getStubDriveKey()
				});
				expect(file.driveKey).to.be.undefined;
				expect(file.fileKey).to.be.undefined;
			});

			it('returns the with-keys version of the entitites if withKeys is true', async () => {
				const file = await arDrive.getPrivateFile({
					fileId: stubEntityID,
					owner: walletOwner,
					driveKey: await getStubDriveKey(),
					withKeys: true
				});
				expect(file.driveKey).to.not.be.undefined;
				expect(file.fileKey).to.not.be.undefined;
			});
		});

		describe('uploadPublicFile', () => {
			beforeEach(() => {
				wrappedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;

				stub(communityOracle, 'getCommunityWinstonTip').resolves(W('1'));
				stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());

				stub(arfsDao, 'getPublicNameConflictInfoInFolder').resolves(stubNameConflictInfo);
			});

			describe('entity name validation', () => {
				const wrappedFileWithInvalidName = new ArFSFileToUpload('test_wallet.json', fileStats);

				beforeEach(() => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				});

				it('throws if the given name is empty', () => {
					// Stub ArFSFileToUpload with a real file changing the filename to an invalid name
					stub(wrappedFileWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameShort);

					const promiseToError = arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile: wrappedFileWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', () => {
					// Stub ArFSFileToUpload with a real file changing the filename to an invalid name
					stub(wrappedFileWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameLong);

					const promiseToError = arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile: wrappedFileWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', () => {
					// Stub ArFSFileToUpload with a real file changing the filename to an invalid name
					stub(wrappedFileWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameNullChar);

					const promiseToError = arDrive.uploadPublicFile({
						parentFolderId: stubEntityID,
						wrappedFile: wrappedFileWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('returns an empty ArFSResult if destination folder has a conflicting FILE name and a matching last modified date and the conflict resolution is set to upsert', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(420));

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

			it('throws an error if destination folder has a conflicting FILE name and a matching last modified date and the conflict resolution is set to upsert', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(420));

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
				stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(1337));

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
		});

		describe('uploadPrivateFile', () => {
			beforeEach(() => {
				wrappedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
				stub(communityOracle, 'getCommunityWinstonTip').resolves(W('1'));
				stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());
				stub(arfsDao, 'getPrivateNameConflictInfoInFolder').resolves(stubNameConflictInfo);
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

			describe('entity name validation', () => {
				const wrappedFileWithInvalidName = new ArFSFileToUpload('test_wallet.json', fileStats);

				beforeEach(() => {
					stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				});

				it('throws if the given name is empty', async () => {
					// Stub ArFSFileToUpload with a real file changing the filename to an invalid name
					stub(wrappedFileWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameShort);

					const promiseToError = arDrive.uploadPrivateFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile: wrappedFileWithInvalidName,
						driveKey: await getStubDriveKey()
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', async () => {
					// Stub ArFSFileToUpload with a real file changing the filename to an invalid name
					stub(wrappedFileWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameLong);

					const promiseToError = arDrive.uploadPrivateFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile: wrappedFileWithInvalidName,
						driveKey: await getStubDriveKey()
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', async () => {
					// Stub ArFSFileToUpload with a real file changing the filename to an invalid name
					stub(wrappedFileWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameNullChar);

					const promiseToError = arDrive.uploadPrivateFile({
						parentFolderId: EID(stubEntityID.toString()),
						wrappedFile: wrappedFileWithInvalidName,
						driveKey: await getStubDriveKey()
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('returns empty ArFSResult if destination folder has a conflicting FILE name and a matching last modified date and the conflict resolution is set to upsert', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(420));

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

			it('throws an error if destination folder has a conflicting FILE name and a matching last modified date and the conflict resolution is set to upsert', async () => {
				stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
				stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(420));

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
				stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(1337));

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
				stub(arfsDao, 'getPrivateFile').returns(stubPrivateFile({ fileName: 'CONFLICTING_NAME' }));
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
				stub(arfsDao, 'getPrivateFile').returns(stubPrivateFile({}));
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
				stub(arfsDao, 'getPrivateFile').returns(stubPrivateFile({ driveId: unexpectedDriveId }));
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
				stub(arfsDao, 'getPrivateFile').returns(stubPrivateFile({}));
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);

				const result = await arDrive.movePrivateFile({
					fileId: stubEntityID,
					newParentFolderId: stubEntityIDAlt,
					driveKey: await getStubDriveKey()
				});
				assertMoveFileExpectations(result, W(169), 'private');
			});
		});

		describe('renamePublicFile', () => {
			const stubFileName = 'Test Public File Metadata';
			const conflictingName = 'CONFLICTING_NAME';

			beforeEach(() => {
				stub(arfsDao, 'getPublicFile').resolves(stubPublicFile({ fileName: stubFileName }));
				stub(arfsDao, 'getPublicEntityNamesInFolder').resolves([stubFileName, conflictingName]);
			});

			it('throws if the owner mismatches', () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(unexpectedOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicFile({
						fileId: stubEntityID,
						newName: validEntityName
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws if the given name is the same as the current one', () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicFile({
						fileId: stubEntityID,
						newName: stubFileName
					}),
					errorMessage: `To rename a file, the new name must be different`
				});
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				});

				it('throws if the given name is empty', () => {
					const promiseToError = arDrive.renamePublicFile({
						fileId: stubEntityID,
						newName: invalidEntityNameShort
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', () => {
					const promiseToError = arDrive.renamePublicFile({
						fileId: stubEntityID,
						newName: invalidEntityNameLong
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', () => {
					const promiseToError = arDrive.renamePublicFile({
						fileId: stubEntityID,
						newName: invalidEntityNameNullChar
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('throws if the new name collides with an on-chain sibling', () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicFile({
						fileId: stubEntityID,
						newName: conflictingName
					}),
					errorMessage: `There already is an entity named that way`
				});
			});

			it('succeeds creating the transaction if a healthy input is given', async () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				const { created, tips, fees } = await arDrive.renamePublicFile({
					fileId: stubEntityID,
					newName: validEntityName
				});
				expect(created.length).to.equal(1);
				expect(tips.length).to.equal(0);
				expect(Object.keys(fees).length).to.equal(1);
				expect(Object.keys(fees)[0]).to.equal(`${created[0].metadataTxId}`);
			});
		});

		describe('renamePrivateFile', async () => {
			const stubFileName = 'Test Private File Metadata';
			const conflictingName = 'CONFLICTING_NAME';

			const stubDriveKey = getStubDriveKey();

			beforeEach(() => {
				stub(arfsDao, 'getPrivateFile').returns(stubPrivateFile({ fileName: stubFileName }));
				stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves([stubFileName, conflictingName]);
			});

			it('throws if the owner mismatches', async () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(unexpectedOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateFile({
						fileId: stubEntityID,
						newName: validEntityName,
						driveKey: await stubDriveKey
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws if the given name is the same as the current one', async () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateFile({
						fileId: stubEntityID,
						newName: stubFileName,
						driveKey: await stubDriveKey
					}),
					errorMessage: `To rename a file, the new name must be different`
				});
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				});

				it('throws if the given name is empty', async () => {
					const promiseToError = arDrive.renamePrivateFile({
						fileId: stubEntityID,
						newName: invalidEntityNameShort,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', async () => {
					const promiseToError = arDrive.renamePrivateFile({
						fileId: EID(stubEntityID.toString()),
						newName: invalidEntityNameLong,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', async () => {
					const promiseToError = arDrive.renamePrivateFile({
						fileId: stubEntityID,
						newName: invalidEntityNameNullChar,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('throws if the new name collides with an on-chain sibling', async () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateFile({
						fileId: stubEntityID,
						newName: 'CONFLICTING_NAME',
						driveKey: await stubDriveKey
					}),
					errorMessage: `There already is an entity named that way`
				});
			});

			it('succeeds creating the transaction if a healthy input is given', async () => {
				stub(arfsDao, 'getDriveOwnerForFileId').resolves(walletOwner);
				const { created, tips, fees } = await arDrive.renamePrivateFile({
					fileId: stubEntityID,
					newName: 'some happy file name which is valid.txt',
					driveKey: await stubDriveKey
				});
				expect(created.length).to.equal(1);
				expect(tips.length).to.equal(0);
				expect(Object.keys(fees).length).to.equal(1);
				expect(Object.keys(fees)[0]).to.equal(`${created[0].metadataTxId}`);
			});
		});

		describe('renamePublicFolder', () => {
			const stubFileName = 'Test Public File Metadata';
			const conflictingName = 'CONFLICTING_NAME';

			beforeEach(() => {
				stub(arfsDao, 'getPublicFolder').resolves(stubPublicFolder({ folderName: stubFileName }));
				stub(arfsDao, 'getPublicEntityNamesInFolder').resolves([stubFileName, conflictingName]);
			});

			it('throws if the owner mismatches', () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(unexpectedOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicFolder({
						folderId: stubEntityID,
						newName: validEntityName
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws if the given name is the same as the current one', () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicFolder({
						folderId: stubEntityID,
						newName: stubFileName
					}),
					errorMessage: `New folder name '${stubFileName}' must be different from the current folder name!`
				});
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				});

				it('throws if the given name is empty', () => {
					const promiseToError = arDrive.renamePublicFolder({
						folderId: stubEntityID,
						newName: invalidEntityNameShort
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', () => {
					const promiseToError = arDrive.renamePublicFolder({
						folderId: stubEntityID,
						newName: invalidEntityNameLong
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', () => {
					const promiseToError = arDrive.renamePublicFolder({
						folderId: stubEntityID,
						newName: invalidEntityNameNullChar
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('throws if the new name collides with an on-chain sibling', () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicFolder({
						folderId: stubEntityID,
						newName: conflictingName
					}),
					errorMessage: `There already is an entity named that way`
				});
			});

			it('succeeds creating the transaction if a healthy input is given', async () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				const { created, tips, fees } = await arDrive.renamePublicFolder({
					folderId: stubEntityID,
					newName: validEntityName
				});
				expect(created.length).to.equal(1);
				expect(tips.length).to.equal(0);
				expect(Object.keys(fees).length).to.equal(1);
				expect(Object.keys(fees)[0]).to.equal(`${created[0].metadataTxId}`);
			});
		});

		describe('renamePrivateFolder', async () => {
			const stubFileName = 'Test Private File Metadata';
			const conflictingName = 'CONFLICTING_NAME';

			const stubDriveKey = getStubDriveKey();

			beforeEach(() => {
				stub(arfsDao, 'getPrivateFolder').returns(stubPrivateFolder({ folderName: stubFileName }));
				stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves([stubFileName, conflictingName]);
			});

			it('throws if the owner mismatches', async () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(unexpectedOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateFolder({
						folderId: stubEntityID,
						newName: validEntityName,
						driveKey: await stubDriveKey
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws if the given name is the same as the current one', async () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateFolder({
						folderId: stubEntityID,
						newName: stubFileName,
						driveKey: await stubDriveKey
					}),
					errorMessage: `New folder name '${stubFileName}' must be different from the current folder name!`
				});
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				});

				it('throws if the given name is empty', async () => {
					const promiseToError = arDrive.renamePrivateFolder({
						folderId: stubEntityID,
						newName: invalidEntityNameShort,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', async () => {
					const promiseToError = arDrive.renamePrivateFolder({
						folderId: stubEntityID,
						newName: invalidEntityNameLong,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', async () => {
					const promiseToError = arDrive.renamePrivateFolder({
						folderId: stubEntityID,
						newName: invalidEntityNameNullChar,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('throws if the new name collides with an on-chain sibling', async () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateFolder({
						folderId: stubEntityID,
						newName: 'CONFLICTING_NAME',
						driveKey: await stubDriveKey
					}),
					errorMessage: `There already is an entity named that way`
				});
			});

			it('succeeds creating the transaction if a healthy input is given', async () => {
				stub(arfsDao, 'getDriveOwnerForFolderId').resolves(walletOwner);
				const { created, tips, fees } = await arDrive.renamePrivateFolder({
					folderId: stubEntityID,
					newName: 'some happy file name which is valid.txt',
					driveKey: await stubDriveKey
				});
				expect(created.length).to.equal(1);
				expect(tips.length).to.equal(0);
				expect(Object.keys(fees).length).to.equal(1);
				expect(Object.keys(fees)[0]).to.equal(`${created[0].metadataTxId}`);
			});
		});

		describe('renamePublicDrive', () => {
			const stubDriveName = 'STUB DRIVE';
			const conflictingName = 'CONFLICTING_NAME';

			beforeEach(() => {
				stub(arfsDao, 'getPublicDrive').resolves(stubPublicDrive());
				stub(arfsDao, 'getPublicEntityNamesInFolder').resolves([stubDriveName, conflictingName]);
			});

			it('throws if the owner mismatches', () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(unexpectedOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicDrive({
						driveId: stubEntityID,
						newName: validEntityName
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws if the given name is the same as the current one', () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePublicDrive({
						driveId: stubEntityID,
						newName: stubDriveName
					}),
					errorMessage: `New drive name '${stubDriveName}' must be different from the current drive name!`
				});
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				});

				it('throws if the given name is empty', () => {
					const promiseToError = arDrive.renamePublicDrive({
						driveId: stubEntityID,
						newName: invalidEntityNameShort
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', () => {
					const promiseToError = arDrive.renamePublicDrive({
						driveId: stubEntityID,
						newName: invalidEntityNameLong
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', () => {
					const promiseToError = arDrive.renamePublicDrive({
						driveId: stubEntityID,
						newName: invalidEntityNameNullChar
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('succeeds creating the transaction if a healthy input is given', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				const { created, tips, fees } = await arDrive.renamePublicDrive({
					driveId: stubEntityID,
					newName: validEntityName
				});
				expect(created.length).to.equal(1);
				expect(tips.length).to.equal(0);
				expect(Object.keys(fees).length).to.equal(1);
				expect(Object.keys(fees)[0]).to.equal(`${created[0].metadataTxId}`);
			});
		});

		describe('renamePrivateDrive', async () => {
			const stubDriveName = 'STUB DRIVE';
			const conflictingName = 'CONFLICTING_NAME';

			const stubDriveKey = getStubDriveKey();

			beforeEach(() => {
				stub(arfsDao, 'getPrivateDrive').returns(stubPrivateDrive());
				stub(arfsDao, 'getPrivateEntityNamesInFolder').resolves([stubDriveName, conflictingName]);
			});

			it('throws if the owner mismatches', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(unexpectedOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateDrive({
						driveId: stubEntityID,
						newName: validEntityName,
						driveKey: await stubDriveKey
					}),
					errorMessage: 'Supplied wallet is not the owner of this drive!'
				});
			});

			it('throws if the given name is the same as the current one', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				return expectAsyncErrorThrow({
					promiseToError: arDrive.renamePrivateDrive({
						driveId: stubEntityID,
						newName: stubDriveName,
						driveKey: await stubDriveKey
					}),
					errorMessage: `New drive name '${stubDriveName}' must be different from the current drive name!`
				});
			});

			describe('entity name validation', () => {
				beforeEach(() => {
					stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				});

				it('throws if the given name is empty', async () => {
					const promiseToError = arDrive.renamePrivateDrive({
						driveId: stubEntityID,
						newName: invalidEntityNameShort,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if the given name is too long', async () => {
					const promiseToError = arDrive.renamePrivateDrive({
						driveId: stubEntityID,
						newName: invalidEntityNameLong,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if the given name is a null character', async () => {
					const promiseToError = arDrive.renamePrivateDrive({
						driveId: stubEntityID,
						newName: invalidEntityNameNullChar,
						driveKey: await stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'drive',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});

			it('succeeds creating the transaction if a healthy input is given', async () => {
				stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
				const { created, tips, fees } = await arDrive.renamePrivateDrive({
					driveId: stubEntityID,
					newName: 'some happy file name which is valid.txt',
					driveKey: await stubDriveKey
				});
				expect(created.length).to.equal(1);
				expect(tips.length).to.equal(0);
				expect(Object.keys(fees).length).to.equal(1);
				expect(Object.keys(fees)[0]).to.equal(`${created[0].metadataTxId}`);
			});
		});
	});

	describe('folder and children function', () => {
		const fileStats = statSync('tests/stub_files');
		const wrappedFolderWithInvalidName = new ArFSFolderToUpload('tests/stub_files', fileStats);

		beforeEach(() => {
			stub(arfsDao, 'getDriveIdForFolderId').resolves(stubEntityID);
			stub(arfsDao, 'getOwnerForDriveId').resolves(walletOwner);
			stub(arfsDao, 'getOwnerAndAssertDrive').resolves(walletOwner);
		});

		describe('createPublicFolderAndUploadChildren', () => {
			describe('entity name validation', () => {
				it('throws if folder name is empty', () => {
					stub(wrappedFolderWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameShort);
					const promiseToError = arDrive.createPublicFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if folder name is too long', () => {
					stub(wrappedFolderWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameLong);

					const promiseToError = arDrive.createPublicFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if folder name is a null character', () => {
					stub(wrappedFolderWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameNullChar);

					const promiseToError = arDrive.createPublicFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});

				it('throws if file name is empty', () => {
					stub(wrappedFolderWithInvalidName.folders[0].files[0], 'destinationBaseName').get(
						() => invalidEntityNameShort
					);
					const promiseToError = arDrive.createPublicFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if file name is too long', () => {
					stub(wrappedFolderWithInvalidName.folders[0].files[0], 'destinationBaseName').get(
						() => invalidEntityNameShort
					);
					const promiseToError = arDrive.createPublicFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if file name is a null character', () => {
					stub(wrappedFolderWithInvalidName.folders[0].files[0], 'destinationBaseName').get(
						() => invalidEntityNameNullChar
					);
					const promiseToError = arDrive.createPublicFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});
			});
		});

		describe('createPrivateFolderAndUploadChildren', () => {
			describe('entity name validation', () => {
				it('throws if folder name is empty', async () => {
					const stubDriveKey = await getStubDriveKey();
					stub(wrappedFolderWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameShort);
					const promiseToError = arDrive.createPrivateFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName,
						driveKey: stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if folder name is too long', async () => {
					const stubDriveKey = await getStubDriveKey();
					stub(wrappedFolderWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameLong);
					const promiseToError = arDrive.createPrivateFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName,
						driveKey: stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.LONG
					});
				});

				it('throws if folder name is a null character', async () => {
					const stubDriveKey = await getStubDriveKey();
					stub(wrappedFolderWithInvalidName, 'destinationBaseName').get(() => invalidEntityNameNullChar);
					const promiseToError = arDrive.createPrivateFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName,
						driveKey: stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'folder',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
				});

				it('throws if file name is empty', async () => {
					const stubDriveKey = await getStubDriveKey();
					stub(wrappedFolderWithInvalidName.folders[0].files[0], 'destinationBaseName').get(
						() => invalidEntityNameShort
					);
					const promiseToError = arDrive.createPrivateFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName,
						driveKey: stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if file name is too long', async () => {
					const stubDriveKey = await getStubDriveKey();
					stub(wrappedFolderWithInvalidName.folders[0].files[0], 'destinationBaseName').get(
						() => invalidEntityNameShort
					);
					const promiseToError = arDrive.createPrivateFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName,
						driveKey: stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.EMPTY
					});
				});

				it('throws if file name is a null character', async () => {
					const stubDriveKey = await getStubDriveKey();
					stub(wrappedFolderWithInvalidName.folders[0].files[0], 'destinationBaseName').get(
						() => invalidEntityNameNullChar
					);
					const promiseToError = arDrive.createPrivateFolderAndUploadChildren({
						parentFolderId: stubEntityID,
						wrappedFolder: wrappedFolderWithInvalidName,
						driveKey: stubDriveKey
					});

					return assertEntityNameExpectations({
						entity: 'file',
						promiseToError,
						errorMessageFor: EntityNameValidationErrorMessageType.NULL_CHAR
					});
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

			assertUploadManifestExpectations(result, W(3127), W(183), W(1), undefined, undefined, true);
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

		it('throws an error if two files with the same destination name are sent to the same destination folder', async () => {
			await expectAsyncErrorThrow({
				promiseToError: bundledArDrive.uploadAllEntities({
					entitiesToUpload: [stubFileUploadStats(), stubFileUploadStats()]
				}),
				errorMessage: 'Upload cannot contain multiple destination names to the same destination folder!'
			});
		});

		it('returns the expected bundled ArFSResult with two over-sized files', async () => {
			const overSizedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
			stub(overSizedFile, 'size').get(() => new ByteCount(+MAX_BUNDLE_SIZE + 1));
			const overSizedFileStats = { ...stubFileUploadStats(), wrappedEntity: overSizedFile };

			const { created, fees, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ ...overSizedFileStats, destName: 'Unique-Name' }, overSizedFileStats]
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
			expect(+fees[`${bundleTxId}`]).to.equal(3114);
		});

		it('throws an error if two files with the same destination name are sent to the same destination folder', async () => {
			const wrappedFolder = stubEmptyFolderStats();
			wrappedFolder.wrappedEntity.files = [
				stubFileUploadStats().wrappedEntity,
				stubFileUploadStats().wrappedEntity
			];

			await expectAsyncErrorThrow({
				promiseToError: bundledArDrive.uploadAllEntities({
					entitiesToUpload: [wrappedFolder]
				}),
				errorMessage: 'Folders cannot contain identical destination names!'
			});
		});

		it('throws an error if two folders with the same destination name are sent to the same destination folder', async () => {
			const wrappedFolder = stubEmptyFolderStats();
			wrappedFolder.wrappedEntity.folders = [
				stubEmptyFolderStats().wrappedEntity,
				stubEmptyFolderStats().wrappedEntity
			];

			await expectAsyncErrorThrow({
				promiseToError: bundledArDrive.uploadAllEntities({
					entitiesToUpload: [wrappedFolder]
				}),
				errorMessage: 'Folders cannot contain identical destination names!'
			});
		});

		it('returns the expected bundled ArFSResult with a folder that has two over-sized files', async () => {
			const overSizedFileOne = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
			stub(overSizedFileOne, 'size').get(() => new ByteCount(+MAX_BUNDLE_SIZE + 1));

			const overSizedFileTwo = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
			stub(overSizedFileTwo, 'destinationBaseName').get(() => 'Unique-Name');
			stub(overSizedFileTwo, 'size').get(() => new ByteCount(+MAX_BUNDLE_SIZE + 1));

			const folderWithOverSizedFiles = stubEmptyFolderStats();
			folderWithOverSizedFiles.wrappedEntity.files = [overSizedFileOne, overSizedFileTwo];

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
			expect(+fees[`${bundleTxId}`]).to.equal(4471);
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

		// Legacy bulk method test for to confirm backwards compatibility and coverage
		it('returns the expected ArFSResult when using the deprecated public bulk folder method', async () => {
			const wrappedFolder = wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;

			const { created, fees, tips } = await bundledArDrive.createPublicFolderAndUploadChildren({
				parentFolderId: stubEntityID,
				wrappedFolder
			});
			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(9);
			expect(tips.length).to.equal(1);
			expect(feeKeys.length).to.equal(1);

			assertFolderCreatedResult(created[0]);
			assertFolderCreatedResult(created[1]);
			assertFolderCreatedResult(created[2]);
			assertFolderCreatedResult(created[3]);

			assertFileCreatedResult(created[4]);
			assertFileCreatedResult(created[5]);
			assertFileCreatedResult(created[6]);
			assertFileCreatedResult(created[7]);

			assertBundleCreatedResult(created[8]);

			expect(feeKeys[0]).to.equal(`${created[8].bundleTxId!}`);
			expect(+fees[`${created[8].bundleTxId}`]).to.equal(16331);
		});

		// Legacy bulk method test for to confirm backwards compatibility and coverage
		it('returns the expected ArFSResult when using the deprecated private bulk folder method', async () => {
			const wrappedFolder = wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;

			const { created, fees, tips } = await bundledArDrive.createPrivateFolderAndUploadChildren({
				parentFolderId: stubEntityID,
				wrappedFolder,
				driveKey: await getStubDriveKey()
			});
			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(9);
			expect(tips.length).to.equal(1);
			expect(feeKeys.length).to.equal(1);

			assertFolderCreatedResult(created[0], true);
			assertFolderCreatedResult(created[1], true);
			assertFolderCreatedResult(created[2], true);
			assertFolderCreatedResult(created[3], true);

			assertFileCreatedResult(created[4], true);
			assertFileCreatedResult(created[5], true);
			assertFileCreatedResult(created[6], true);
			assertFileCreatedResult(created[7], true);

			assertBundleCreatedResult(created[8]);

			expect(feeKeys[0]).to.equal(`${created[8].bundleTxId!}`);
			expect(+fees[`${created[8].bundleTxId}`]).to.equal(17183);
		});

		it('returns the expected ArFSResult with a folder that has conflicting names within its tree and uses --skip conflictResolution', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			const conflictingFileInParent = stubFileToUpload('CONFLICTING_FILE_NAME');
			const conflictingFileInChild = stubFileToUpload('CONFLICTING_FILE_NAME');

			const childFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			childFolder.files = [conflictingFileInChild];

			const parentFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			parentFolder.folders = [childFolder];
			parentFolder.files = [conflictingFileInParent];

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.folders = [parentFolder];
			rootFolder.files = [conflictingFileInRoot];

			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'skip'
			});

			expect(result).to.deep.equal({
				created: [],
				tips: [],
				fees: {}
			});
		});

		it('returns the expected ArFSResult with a folder that has conflicting names within its tree and uses --upsert conflictResolution on files that return the expected unchanged last modified date', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInRoot, 'lastModifiedDate').get(() => new UnixTime(420));
			const conflictingFileInParent = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInParent, 'lastModifiedDate').get(() => new UnixTime(420));
			const conflictingFileInChild = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInChild, 'lastModifiedDate').get(() => new UnixTime(420));

			const childFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			childFolder.files = [conflictingFileInChild];

			const parentFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			parentFolder.folders = [childFolder];
			parentFolder.files = [conflictingFileInParent];

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.folders = [parentFolder];
			rootFolder.files = [conflictingFileInRoot];

			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'upsert'
			});

			expect(result).to.deep.equal({
				created: [],
				tips: [],
				fees: {}
			});
		});

		it('returns the expected revision ArFSResults with a folder that has conflicting names within its tree and uses --upsert conflictResolution on files that return unique different last modified dates', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInRoot, 'lastModifiedDate').get(() => new UnixTime(1337));
			const conflictingFileInParent = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInParent, 'lastModifiedDate').get(() => new UnixTime(10101));
			const conflictingFileInChild = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInChild, 'lastModifiedDate').get(() => new UnixTime(90909));

			const childFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			childFolder.files = [conflictingFileInChild];

			const parentFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			parentFolder.folders = [childFolder];
			parentFolder.files = [conflictingFileInParent];

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.folders = [parentFolder];
			rootFolder.files = [conflictingFileInRoot];

			const { created, fees, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'upsert'
			});

			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(4);
			expect(tips.length).to.equal(1);
			expect(feeKeys.length).to.equal(1);

			assertFileCreatedResult(created[0], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));
			assertFileCreatedResult(created[1], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));
			assertFileCreatedResult(created[2], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));

			assertBundleCreatedResult(created[3]);

			const bundleTxId = created[3].bundleTxId;

			expect(feeKeys[0]).to.equal(`${bundleTxId}`);
			expect(+fees[`${bundleTxId}`]).to.equal(17803);

			assertTipSetting(tips[0], bundleTxId!);
		});

		it('returns the expected revision ArFSResults with a folder that has conflicting names within its tree and uses --replace conflictResolution', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			const conflictingFileInParent = stubFileToUpload('CONFLICTING_FILE_NAME');
			const conflictingFileInChild = stubFileToUpload('CONFLICTING_FILE_NAME');

			const childFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			childFolder.files = [conflictingFileInChild];

			const parentFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			parentFolder.folders = [childFolder];
			parentFolder.files = [conflictingFileInParent];

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.folders = [parentFolder];
			rootFolder.files = [conflictingFileInRoot];

			const { created, fees, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'replace'
			});

			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(4);
			expect(tips.length).to.equal(1);
			expect(feeKeys.length).to.equal(1);

			assertFileCreatedResult(created[0], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));
			assertFileCreatedResult(created[1], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));
			assertFileCreatedResult(created[2], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));

			assertBundleCreatedResult(created[3]);

			const bundleTxId = created[3].bundleTxId;

			expect(feeKeys[0]).to.equal(`${bundleTxId}`);
			expect(+fees[`${bundleTxId}`]).to.equal(17828);

			assertTipSetting(tips[0], bundleTxId!);
		});

		it('returns the expected empty ArFSResult with a folder that has multiple conflicting names within its tree and uses --skip conflictResolution', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			const anotherConflictingFileInRoot = stubFileToUpload('ANOTHER_CONFLICTING_FILE_NAME');

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.files = [conflictingFileInRoot, anotherConflictingFileInRoot];

			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'skip'
			});

			expect(result).to.deep.equal({
				created: [],
				tips: [],
				fees: {}
			});
		});

		it('returns the expected revision ArFSResults with a folder that has multiple conflicting names within its tree and uses --upsert conflictResolution and has unique last modified dates', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			const anotherConflictingFileInRoot = stubFileToUpload('ANOTHER_CONFLICTING_FILE_NAME');

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.files = [conflictingFileInRoot, anotherConflictingFileInRoot];

			const { fees, created, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'upsert'
			});

			const feeKeys = Object.keys(fees);

			expect(created.length).to.equal(3);
			expect(tips.length).to.equal(1);
			expect(feeKeys.length).to.equal(1);

			assertFileCreatedResult(created[0], false, EID('caa8b54a-eb5e-4134-8ae2-a3946a428ec7'));
			assertFileCreatedResult(created[1], false, EID('72b8b54a-eb5e-4134-8ae2-a3946a428ec7'));

			assertBundleCreatedResult(created[2]);

			const bundleTxId = created[2].bundleTxId;

			expect(feeKeys[0]).to.equal(`${bundleTxId}`);
			expect(+fees[`${bundleTxId}`]).to.equal(11904);

			assertTipSetting(tips[0], bundleTxId!);
		});

		it('returns the empty revision ArFSResults with a folder that has multiple conflicting names within its tree and uses --upsert conflictResolution and has matching last modified dates', async () => {
			const conflictingFileInRoot = stubFileToUpload('CONFLICTING_FILE_NAME');
			stub(conflictingFileInRoot, 'lastModifiedDate').get(() => new UnixTime(420));
			const anotherConflictingFileInRoot = stubFileToUpload('ANOTHER_CONFLICTING_FILE_NAME');
			stub(anotherConflictingFileInRoot, 'lastModifiedDate').get(() => new UnixTime(101));

			const rootFolder = stubEmptyFolderToUpload('CONFLICTING_FOLDER_NAME');
			rootFolder.files = [conflictingFileInRoot, anotherConflictingFileInRoot];

			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: rootFolder, destFolderId: stubEntityID }],
				conflictResolution: 'upsert'
			});

			expect(result).to.deep.equal({
				created: [],
				tips: [],
				fees: {}
			});
		});

		it('returns the expected ArFSResult for two empty folders', async () => {
			const { created, fees, tips } = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ ...stubEmptyFolderStats(), destName: 'Unique-Name' }, stubEmptyFolderStats()],
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
			expect(+fees[`${created[2].bundleTxId}`]).to.equal(2731);
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

			assertCreateFolderExpectations(result, W(43), await getStubDriveKey());
		});

		it('returns the expected v2 ArFSResult with a single public .txt file', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt'
			);
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: wrappedFile, destFolderId: stubEntityID }]
			});

			assertUploadFileExpectations(result, W(14), W(159), W(1), 'public');
		});

		it('returns the expected v2 ArFSResult with a single public .txt file that has a custom content type', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt',
				'Custom-type-77'
			);
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: wrappedFile, destFolderId: stubEntityID }]
			});

			assertUploadFileExpectations(result, W(14), W(163), W(1), 'public');
		});

		it('returns the expected v2 ArFSResult with a single private .txt file', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt'
			);
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [
					{ wrappedEntity: wrappedFile, destFolderId: stubEntityID, driveKey: await getStubDriveKey() }
				]
			});

			assertUploadFileExpectations(result, W(30), W(175), W(1), 'private');
		});

		it('returns the expected v2 ArFSResult with a single private .txt file that has a custom content type', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt',
				'Custom-type-77'
			);
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						wrappedEntity: wrappedFile,
						destFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					}
				]
			});

			assertUploadFileExpectations(result, W(30), W(179), W(1), 'private');
		});

		it('returns the expected bundled ArFSResult with a single public .txt file', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt'
			);
			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: wrappedFile, destFolderId: stubEntityID }]
			});

			assertUploadFileExpectations(result, W(2756), W(159), W(1), 'public', undefined, true);
		});

		it('returns the expected bundled ArFSResult with a single public .txt file that has a custom content type', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt',
				'Custom-type-77'
			);
			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [{ wrappedEntity: wrappedFile, destFolderId: stubEntityID }]
			});

			assertUploadFileExpectations(result, W(2764), W(163), W(1), 'public', undefined, true);
		});

		it('returns the expected bundled ArFSResult with a single private .txt file', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt'
			);
			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [
					{ wrappedEntity: wrappedFile, destFolderId: stubEntityID, driveKey: await getStubDriveKey() }
				]
			});

			assertUploadFileExpectations(result, W(2900), W(179), W(1), 'private', undefined, true);
		});

		it('returns the expected bundled ArFSResult with a single private .txt file that has a custom content type', async () => {
			const wrappedFile = wrapFileOrFolder(
				'tests/stub_files/bulk_root_folder/parent_folder/child_folder/file_in_child.txt',
				'Custom-type-77'
			);
			const result = await bundledArDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						wrappedEntity: wrappedFile,
						destFolderId: stubEntityID,
						driveKey: await getStubDriveKey()
					}
				]
			});

			assertUploadFileExpectations(result, W(2904), W(179), W(1), 'private', undefined, true);
		});
	});
});

function assertCreateDriveExpectations(
	result: ArFSResult,
	driveFee: Winston,
	folderFee?: Winston,
	expectedDriveKey?: DriveKey,
	isBundled = false
) {
	// Ensure that 3 arfs entities are created with a bundled transaction,
	// and 2 arfs entities are created during a v2 transaction
	expect(result.created.length).to.equal(isBundled ? 3 : 2);

	// Ensure that the drive entity looks healthy
	const driveEntity = result.created[0];
	expect(driveEntity.dataTxId).to.be.undefined;
	expect(driveEntity.entityId).to.match(entityIdRegex);
	expect(driveEntity.key?.toString()).to.equal(expectedDriveKey?.toString());
	expect(driveEntity.metadataTxId).to.match(txIdRegex);
	expect(driveEntity.type).to.equal('drive');

	// Ensure that the root folder entity looks healthy
	const rootFolderEntity = result.created[1];
	expect(rootFolderEntity.dataTxId).to.be.undefined;
	expect(rootFolderEntity.entityId).to.match(entityIdRegex);
	expect(rootFolderEntity.key?.toString()).to.equal(expectedDriveKey?.toString());
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
		expect(bundleEntity.key?.toString()).to.be.undefined;
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

function assertCreateFolderExpectations(result: ArFSResult, folderFee: Winston, expectedDriveKey?: DriveKey) {
	// Ensure that 1 arfs entity was created
	expect(result.created.length).to.equal(1);

	// Ensure that the folder entity looks healthy
	const folderEntity = result.created[0];
	expect(folderEntity.dataTxId).to.be.undefined;
	expect(folderEntity.entityId).to.match(entityIdRegex);
	expect(folderEntity.key?.toString()).to.equal(expectedDriveKey?.toString());
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
		expect(key?.toString()).to.equal('nxTl2ki5hWjyYE0SjOg2FV3PE7EBKMe9E6kD8uOvm6w');
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

function assertEntityNameExpectations({
	entity,
	promiseToError,
	errorMessageFor
}: {
	entity: EntityType;
	promiseToError: Promise<ArFSResult>;
	errorMessageFor: EntityNameValidationErrorMessageType;
}): Promise<void> | undefined {
	const expectError = (errorMessage: string) =>
		expectAsyncErrorThrow({
			promiseToError,
			errorMessage
		});

	if (errorMessageFor === EntityNameValidationErrorMessageType.EMPTY) {
		return expectError(`The ${entity} name cannot be empty`);
	}

	if (errorMessageFor === EntityNameValidationErrorMessageType.LONG) {
		return expectError(`The ${entity} name must not exceed 255 bytes`);
	}

	if (errorMessageFor === EntityNameValidationErrorMessageType.NULL_CHAR) {
		return expectError(`The ${entity} name cannot contain null characters`);
	}

	return;
}
