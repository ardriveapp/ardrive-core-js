import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { ArDrive } from './ardrive';
import { ArFSPublicFileMetadataTransactionData, ArFSPublicFolderTransactionData } from './arfs/arfs_tx_data_types';
import { ArFSDAO } from './arfs/arfsdao';
import { ArDriveCommunityOracle } from './community/ardrive_community_oracle';
import { CommunityOracle } from './community/community_oracle';
import { ArweaveOracle } from './pricing/arweave_oracle';
import { ARDataPriceRegressionEstimator } from './pricing/ar_data_price_regression_estimator';
import { GatewayOracle } from './pricing/gateway_oracle';
import { ByteCount, UnixTime, stubTransactionID, W, FeeMultiple } from './types';
import { readJWKFile } from './utils/common';
import { expectAsyncErrorThrow } from '../tests/test_helpers';
import { WalletDAO } from './wallet_dao';
import { ArFSTagSettings } from './arfs/arfs_tag_settings';
import { fakeArweave } from '../tests/stubs';
import { ArFSUploadPlanner } from './arfs/arfs_upload_planner';

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
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(0));
			});
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFolderUpload(stubPublicFolderTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(async () =>
				W(+stubPublicFolderTransactionData.sizeOf())
			);
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
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(0));
			});
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFileRename(stubPublicFileTransactionData)
			});
		});

		it('Throws an error when there is insufficient wallet balance if boosted', async () => {
			stub(walletDao, 'getWalletWinstonBalance').callsFake(async () =>
				W(+stubPublicFileTransactionData.sizeOf())
			);
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

	describe('assertWalletBalanceFunction function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(false);
			});
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(4));
			});

			await expectAsyncErrorThrow({
				promiseToError: arDrive.assertWalletBalance(W(5)),
				errorMessage: `Wallet balance of 4 Winston is not enough (5) for this action!`
			});
		});
	});

	describe('estimateAndAssertCostOfMoveFile function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(false);
			});
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(0));
			});
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfMoveFile(stubPublicFileTransactionData)
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
});
