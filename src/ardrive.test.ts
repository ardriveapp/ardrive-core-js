import Arweave from 'arweave';
import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { ArDrive } from './ardrive';
import {
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPublicDriveTransactionData
} from './arfs/arfs_trx_data_types';
import { ArFSDAO } from './arfsdao';
import { ArDriveCommunityOracle } from './community/ardrive_community_oracle';
import { CommunityOracle } from './community/community_oracle';
import { ArweaveOracle } from './pricing/arweave_oracle';
import { ARDataPriceRegressionEstimator } from './pricing/ar_data_price_regression_estimator';
import { GatewayOracle } from './pricing/gateway_oracle';
import { ByteCount, UnixTime, stubTransactionID, W, FeeMultiple, TipType } from './types';
import { readJWKFile } from './utils/common';
import { stubEntityID } from './utils/stubs';
import { expectAsyncErrorThrow } from './utils/test_helpers';
import { WalletDAO } from './wallet';

describe('ArDrive class', () => {
	let arDrive: ArDrive;
	let arweaveOracleStub: SinonStubbedInstance<ArweaveOracle>;
	let communityOracleStub: SinonStubbedInstance<CommunityOracle>;
	let priceEstimator: ARDataPriceRegressionEstimator;
	let walletDao: WalletDAO;
	const fakeArweave = Arweave.init({
		host: 'localhost',
		port: 443,
		protocol: 'https',
		timeout: 600000
	});
	const wallet = readJWKFile('./test_wallet.json');
	const stubPublicFileTransactionData = new ArFSPublicFileMetadataTransactionData(
		'stubName',
		new ByteCount(12345),
		new UnixTime(0),
		stubTransactionID,
		'application/json'
	);
	const stubPublicFolderTransactionData = new ArFSPublicFolderTransactionData('stubName');
	const stubPublicDriveMetadataTransactionData = new ArFSPublicDriveTransactionData('stubName', stubEntityID);

	beforeEach(async () => {
		// Set pricing algo up as x = y (bytes = Winston)
		arweaveOracleStub = stub(new GatewayOracle());
		arweaveOracleStub.getWinstonPriceForByteCount.callsFake((input) => Promise.resolve(W(+input)));
		communityOracleStub = stub(new ArDriveCommunityOracle(fakeArweave));
		priceEstimator = new ARDataPriceRegressionEstimator(true, arweaveOracleStub);
		walletDao = new WalletDAO(fakeArweave, 'Unit Test', '1.0');
		arDrive = new ArDrive(
			wallet,
			walletDao,
			new ArFSDAO(wallet, fakeArweave, true, 'Unit Test', '1.0'),
			communityOracleStub,
			'Unit Test',
			'1.0',
			priceEstimator,
			new FeeMultiple(1.0),
			true
		);
	});

	describe('encryptedDataSize function', () => {
		it('throws an error when passed a value too large for computation', () => {
			expect(() => arDrive.encryptedDataSize(new ByteCount(Number.MAX_SAFE_INTEGER - 15))).to.throw(Error);
		});

		it('returns the expected values for valid inputs', () => {
			const inputsAndExpectedOutputs = [
				[0, 16],
				[1, 17],
				[15, 31],
				[16, 32],
				[17, 33],
				[Number.MAX_SAFE_INTEGER - 16, Number.MAX_SAFE_INTEGER]
			].map((pair) => pair.map((vol) => new ByteCount(vol)));
			inputsAndExpectedOutputs.forEach(([input, expectedOutput]) => {
				const actualSize = arDrive.encryptedDataSize(input);
				expect(actualSize.equals(expectedOutput), `${actualSize} === ${expectedOutput}`).to.be.true;
			});
		});
	});

	describe('getTipTags function', () => {
		it('returns the expected tags', () => {
			const baseTags = [
				{ name: 'App-Name', value: 'Unit Test' },
				{ name: 'App-Version', value: '1.0' }
			];
			const inputsAndExpectedOutputs = [
				[undefined, [...baseTags, { name: 'Type', value: 'fee' }, { name: 'Tip-Type', value: 'data upload' }]],
				[
					'data upload',
					[...baseTags, { name: 'Type', value: 'fee' }, { name: 'Tip-Type', value: 'data upload' }]
				]
			];
			inputsAndExpectedOutputs.forEach(([input, expectedOutput]) => {
				expect(arDrive.getTipTags(input as TipType)).to.deep.equal(expectedOutput);
			});
		});
	});

	describe('estimateAndAssertCostOfFileUpload function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(false);
			});
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(0));
			});
			communityOracleStub.getCommunityWinstonTip.callsFake(() => {
				return Promise.resolve(W(9876543210));
			});
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFileUpload(
					new ByteCount(1),
					stubPublicFileTransactionData,
					'private'
				)
			});
		});

		it('returns the correct reward and tip data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});
			communityOracleStub.getCommunityWinstonTip.callsFake(() => {
				return Promise.resolve(W(9876543210));
			});

			const actual = await arDrive.estimateAndAssertCostOfFileUpload(
				new ByteCount(1234567),
				stubPublicFileTransactionData,
				'private'
			);
			expect(`${actual.metaDataBaseReward}`).to.equal('147');
			expect(`${actual.fileDataBaseReward}`).to.equal('1234583');
			expect(`${actual.communityWinstonTip}`).to.equal('9876543210');
		});
	});

	describe('estimateAndAssertCostOfFolderUpload function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(false);
			});
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(0));
			});
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfFolderUpload(stubPublicFolderTransactionData)
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

	describe('estimateAndAssertCostOfDriveCreation function', () => {
		it('throws an error when there is an insufficient wallet balance', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(false);
			});
			stub(walletDao, 'getWalletWinstonBalance').callsFake(() => {
				return Promise.resolve(W(0));
			});
			await expectAsyncErrorThrow({
				promiseToError: arDrive.estimateAndAssertCostOfDriveCreation(
					stubPublicDriveMetadataTransactionData,
					stubPublicFolderTransactionData
				)
			});
		});

		it('returns the correct reward data', async () => {
			stub(walletDao, 'walletHasBalance').callsFake(() => {
				return Promise.resolve(true);
			});

			const actual = await arDrive.estimateAndAssertCostOfDriveCreation(
				stubPublicDriveMetadataTransactionData,
				stubPublicFolderTransactionData
			);
			expect(`${actual.driveMetaDataBaseReward}`).to.equal('73');
			expect(`${actual.rootFolderMetaDataBaseReward}`).to.equal('19');
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