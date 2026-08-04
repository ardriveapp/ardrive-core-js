import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { ArDrive } from './ardrive';
import {
	ArFSPublicDriveTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderTransactionData
} from './arfs/tx/arfs_tx_data_types';
import { ArFSDAO } from './arfs/arfsdao';
import { ArDriveCommunityOracle } from './community/ardrive_community_oracle';
import { CommunityOracle } from './community/community_oracle';
import { ArweaveOracle } from './pricing/arweave_oracle';
import { ARDataPriceRegressionEstimator } from './pricing/ar_data_price_regression_estimator';
import { GatewayOracle } from './pricing/gateway_oracle';
import { ByteCount, UnixTime, stubTransactionID, W, FeeMultiple } from './types';
import { readJWKFile } from './utils/common';
import { expectAsyncErrorThrow, TEST_WALLET_ADDRESS } from '../tests/test_helpers';
import { WalletDAO } from './wallet_dao';
import { ArFSTagSettings } from './arfs/arfs_tag_settings';
import { fakeArweave, stubArweaveAddress, stubEntityID, stubEntityIDAlt } from '../tests/stubs';
import { ArFSUploadPlanner } from './arfs/arfs_upload_planner';
import { ArweaveSigner } from '@dha-team/arbundles';
import { JWKWallet } from './jwk_wallet';

describe('ArDrive class', () => {
	let arDrive: ArDrive;
	let boostedArDrive: ArDrive;
	let arweaveOracleStub: SinonStubbedInstance<ArweaveOracle>;
	let communityOracleStub: SinonStubbedInstance<CommunityOracle>;
	let priceEstimator: ARDataPriceRegressionEstimator;
	let walletDao: WalletDAO;

	const wallet = readJWKFile('./test_wallet.json');
	const stubPublicFileTransactionData = new ArFSPublicFileMetadataTransactionData(
		'stubName',
		new ByteCount(12345),
		new UnixTime(0),
		stubTransactionID,
		'application/json'
	);
	const stubPublicFolderTransactionData = new ArFSPublicFolderTransactionData('stubName');
	const stubPublicDriveTransactionData = new ArFSPublicDriveTransactionData('stubName', stubEntityID);
	const getWalletWinstonBalanceZero = async () => W(0);
	const getWalletWinstonBalanceEnoughForFileMetadataTx = async () => W(+stubPublicFileTransactionData.sizeOf());
	const getWalletWinstonBalanceEnoughForFolderMetadataTx = async () => W(+stubPublicFolderTransactionData.sizeOf());
	const getWalletWinstonBalanceEnoughForDriveMetadataTx = async () => W(+stubPublicDriveTransactionData.sizeOf());

	beforeEach(async () => {
		// Set pricing algo up as x = y (bytes = Winston)
		arweaveOracleStub = stub(new GatewayOracle());
		arweaveOracleStub.getWinstonPriceForByteCount.callsFake((input) => Promise.resolve(W(+input)));
		communityOracleStub = stub(new ArDriveCommunityOracle(fakeArweave));
		priceEstimator = new ARDataPriceRegressionEstimator(true, arweaveOracleStub);
		walletDao = new WalletDAO(fakeArweave, 'Unit Test', '1.2');

		const arFSTagSettings = new ArFSTagSettings({ appName: 'Unit Test', appVersion: '1.2' });
		const uploadPlanner = new ArFSUploadPlanner({
			arFSTagSettings: arFSTagSettings,
			priceEstimator,
			communityOracle: communityOracleStub
		});

		arDrive = new ArDrive(
			wallet,
			walletDao,
			new ArFSDAO(wallet, fakeArweave, true, 'Unit Test', '1.2', arFSTagSettings),
			communityOracleStub,
			'Unit Test',
			'1.0',
			priceEstimator,
			new FeeMultiple(1.0),
			true,
			arFSTagSettings,
			uploadPlanner
		);

		boostedArDrive = new ArDrive(
			wallet,
			walletDao,
			new ArFSDAO(wallet, fakeArweave, true, 'Unit Test', '1.2', arFSTagSettings),
			communityOracleStub,
			'Unit Test',
			'1.0',
			priceEstimator,
			new FeeMultiple(2.0),
			true,
			arFSTagSettings,
			uploadPlanner
		);
	});

	describe('estimateAndAssertCostOfFolderUpload function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceZero);
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFolderUpload(stubPublicFolderTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceEnoughForFolderMetadataTx);
			await expectAsyncErrorThrow({
				promiseToError: boostedArDrive.estimateAndAssertCostOfFolderUpload(stubPublicFolderTransactionData)
			});
		});

		it('returns the correct reward data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});

			const actual = await arDrive.estimateAndAssertCostOfFolderUpload(stubPublicFileTransactionData);
			// TODO: Bummer to lose deep equal verification
			expect(`${actual.metaDataBaseReward}`).to.equal('147');
		});
	});

	describe('estimateAndAssertCostOfFileRename function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceZero);
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFileRename(stubPublicFileTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceEnoughForFileMetadataTx);
			await expectAsyncErrorThrow({
				promiseToError: boostedArDrive.estimateAndAssertCostOfFileRename(stubPublicFileTransactionData)
			});
		});

		it('returns the correct reward data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});

			const actual = await arDrive.estimateAndAssertCostOfFileRename(stubPublicFileTransactionData);
			// TODO: Bummer to lose deep equal verification
			expect(`${actual.metaDataBaseReward}`).to.equal('147');
		});
	});

	describe('estimateAndAssertCostOfFolderRename function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceZero);
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFolderRename(stubPublicFolderTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceEnoughForFolderMetadataTx);
			await expectAsyncErrorThrow({
				promiseToError: boostedArDrive.estimateAndAssertCostOfFolderRename(stubPublicFolderTransactionData)
			});
		});

		it('returns the correct reward data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});

			const actual = await arDrive.estimateAndAssertCostOfFolderRename(stubPublicFolderTransactionData);
			// TODO: Bummer to lose deep equal verification
			expect(`${actual.metaDataBaseReward}`).to.equal('19');
		});
	});

	describe('estimateAndAssertCostOfDriveRename function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceZero);
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfDriveRename(stubPublicDriveTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceEnoughForDriveMetadataTx);
			await expectAsyncErrorThrow({
				promiseToError: boostedArDrive.estimateAndAssertCostOfDriveRename(stubPublicDriveTransactionData)
			});
		});

		it('returns the correct reward data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});

			const actual = await arDrive.estimateAndAssertCostOfDriveRename(stubPublicDriveTransactionData);
			// TODO: Bummer to lose deep equal verification
			expect(`${actual.metaDataBaseReward}`).to.equal('73');
		});
	});

	describe('assertWalletBalanceFunction function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(false);
			});
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceZero);

			await expectAsyncErrorThrow({
				promiseToError: arDrive.assertWalletBalance(W(1)),
				errorMessage: `Wallet balance of 0 Winston is not enough (1) for this action!`
			});
		});
	});

	describe('estimateAndAssertCostOfMoveFile function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceZero);
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfMoveFile(stubPublicFileTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(getWalletWinstonBalanceEnoughForFileMetadataTx);
			await expectAsyncErrorThrow({
				promiseToError: boostedArDrive.estimateAndAssertCostOfMoveFile(stubPublicFileTransactionData)
			});
		});

		it('returns the correct reward data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});

			const actual = await arDrive.estimateAndAssertCostOfMoveFile(stubPublicFileTransactionData);
			expect(`${actual.metaDataBaseReward}`).to.equal('147');
		});
	});

	describe('getOwnerAddress function', () => {
		// Helper function to create common test setup
		const createTestSetup = async () => {
			const jwkWallet = wallet as JWKWallet;
			expect((await jwkWallet.getAddress()).toString()).to.equal(TEST_WALLET_ADDRESS);
			const arFSTagSettings = new ArFSTagSettings({ appName: 'Unit Test', appVersion: '1.2' });
			const uploadPlanner = new ArFSUploadPlanner({
				arFSTagSettings,
				priceEstimator,
				communityOracle: communityOracleStub
			});
			return { jwkWallet, arFSTagSettings, uploadPlanner };
		};

		it('returns correct address when instantiated with ArweaveSigner', async () => {
			const { jwkWallet, arFSTagSettings, uploadPlanner } = await createTestSetup();
			const signer = new ArweaveSigner(jwkWallet.getPrivateKey());

			const arDriveWithSigner = new ArDrive(
				undefined, // No wallet
				walletDao,
				new ArFSDAO(
					undefined,
					fakeArweave,
					true,
					'Unit Test',
					'1.2',
					arFSTagSettings,
					undefined,
					undefined,
					signer
				),
				communityOracleStub,
				'Unit Test',
				'1.0',
				priceEstimator,
				new FeeMultiple(1.0),
				true,
				arFSTagSettings,
				uploadPlanner,
				undefined, // No cost calculator
				signer
			);

			expect((await arDriveWithSigner.getOwnerAddress()).toString()).to.equal(TEST_WALLET_ADDRESS);
		});

		it('returns correct address when instantiated with JWKWallet', async () => {
			const { jwkWallet, arFSTagSettings, uploadPlanner } = await createTestSetup();

			const arDriveWithWallet = new ArDrive(
				jwkWallet, // JWK wallet provided
				walletDao,
				new ArFSDAO(jwkWallet, fakeArweave, true, 'Unit Test', '1.2', arFSTagSettings),
				communityOracleStub,
				'Unit Test',
				'1.0',
				priceEstimator,
				new FeeMultiple(1.0),
				true,
				arFSTagSettings,
				uploadPlanner
			);

			expect((await arDriveWithWallet.getOwnerAddress()).toString()).to.equal(TEST_WALLET_ADDRESS);
		});
	});

	describe('pinPublicFile function', () => {
		const dataTxId = stubTransactionID;

		it('throws (before any GQL lookup or post) when the destination drive is private', async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const dao = (arDrive as any).arFsDao;
			stub(dao, 'getDriveIdForFolderId').resolves(stubEntityID);
			stub(dao, 'isPublicDrive').resolves(false);
			const infoSpy = stub(dao, 'getInfoOfTxToBePinned').resolves();
			const pinSpy = stub(dao, 'pinPublicFile').resolves();

			await expectAsyncErrorThrow({
				promiseToError: arDrive.pinPublicFile({
					parentFolderId: stubEntityID,
					dataTxId,
					pinnedFileName: 'pinned.png'
				}),
				errorMessage: 'Pinning is only supported for public drives'
			});

			expect(infoSpy.called).to.equal(false);
			expect(pinSpy.called).to.equal(false);
		});

		it('throws (before the public-drive guard or any write) when a supplied driveId does not own parentFolderId', async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const dao = (arDrive as any).arFsDao;
			// The folder actually lives in stubEntityID's drive...
			stub(dao, 'getDriveIdForFolderId').resolves(stubEntityID);
			// ...but the caller asserts a DIFFERENT (e.g. public) drive. This must be rejected before
			// the public-drive guard runs — otherwise a public driveId could smuggle a pin into a folder
			// that really belongs to a private drive.
			const publicDriveSpy = stub(dao, 'isPublicDrive').resolves(true);
			const infoSpy = stub(dao, 'getInfoOfTxToBePinned').resolves();
			const pinSpy = stub(dao, 'pinPublicFile').resolves();

			await expectAsyncErrorThrow({
				promiseToError: arDrive.pinPublicFile({
					parentFolderId: stubEntityID,
					dataTxId,
					pinnedFileName: 'pinned.png',
					driveId: stubEntityIDAlt
				}),
				errorMessage: `Supplied driveId (${stubEntityIDAlt}) does not own the destination folder (${stubEntityID}), which belongs to drive ${stubEntityID}`
			});

			// The mismatch is caught before the drive-privacy guard, the source lookup, or any post.
			expect(publicDriveSpy.called).to.equal(false);
			expect(infoSpy.called).to.equal(false);
			expect(pinSpy.called).to.equal(false);
		});

		it('accepts a supplied driveId that matches the drive resolved from parentFolderId', async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const dao = (arDrive as any).arFsDao;
			const resolveSpy = stub(dao, 'getDriveIdForFolderId').resolves(stubEntityID);
			stub(dao, 'isPublicDrive').resolves(true);
			stub(dao, 'getPublicEntityNamesInFolder').resolves([]);
			stub(dao, 'getInfoOfTxToBePinned').resolves({
				pinnedDataOwner: stubArweaveAddress(),
				size: new ByteCount(2048),
				dataContentType: 'image/png'
			});
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			stub((arDrive as any).uploadPlanner, 'isTurboUpload').returns(true);
			const pinStub = stub(dao, 'pinPublicFile').resolves({
				fileId: stubEntityID,
				dataTxId,
				metaDataTxId: stubTransactionID,
				dataCaches: [],
				fastFinalityIndexes: []
			});

			const result = await arDrive.pinPublicFile({
				parentFolderId: stubEntityID,
				dataTxId,
				pinnedFileName: 'pinned.png',
				driveId: stubEntityID
			});

			expect(result.created.length).to.equal(1);
			// The drive is always resolved from the folder, even when a (matching) driveId is supplied.
			expect(resolveSpy.calledOnce).to.equal(true);
			// The resolved drive is the one handed to the DAO write.
			expect(`${pinStub.firstCall.args[0].driveId}`).to.equal(`${stubEntityID}`);
		});

		it('pins a public file: reuses the dataTxId, sets pinnedDataOwner, returns a new file entity', async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const dao = (arDrive as any).arFsDao;
			stub(dao, 'getDriveIdForFolderId').resolves(stubEntityID);
			stub(dao, 'isPublicDrive').resolves(true);
			stub(dao, 'getPublicEntityNamesInFolder').resolves([]);
			stub(dao, 'getInfoOfTxToBePinned').resolves({
				pinnedDataOwner: stubArweaveAddress(),
				size: new ByteCount(2048),
				dataContentType: 'image/png'
			});
			// Force the Turbo path so no AR cost estimation / wallet balance lookup is needed.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			stub((arDrive as any).uploadPlanner, 'isTurboUpload').returns(true);
			const pinStub = stub(dao, 'pinPublicFile').resolves({
				fileId: stubEntityID,
				dataTxId,
				metaDataTxId: stubTransactionID,
				dataCaches: [],
				fastFinalityIndexes: []
			});

			const result = await arDrive.pinPublicFile({
				parentFolderId: stubEntityID,
				dataTxId,
				pinnedFileName: 'pinned.png'
			});

			expect(result.created.length).to.equal(1);
			expect(result.created[0].type).to.equal('file');
			expect(`${result.created[0].entityId}`).to.equal(`${stubEntityID}`);
			expect(`${result.created[0].dataTxId}`).to.equal(`${dataTxId}`);
			expect(result.created[0].entityName).to.equal('pinned.png');

			// The DAO receives pin metadata reusing the caller's dataTxId with a non-null pinnedDataOwner.
			const daoArgs = pinStub.firstCall.args[0];
			expect(`${daoArgs.dataTxId}`).to.equal(`${dataTxId}`);
			const json = JSON.parse(daoArgs.transactionData.asTransactionData());
			expect(json.pinnedDataOwner).to.equal(`${stubArweaveAddress()}`);
			expect(json.dataTxId).to.equal(`${dataTxId}`);
			expect(json.name).to.equal('pinned.png');
		});
	});
});
