/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { stub } from 'sinon';
import {
	stubPrivateDriveMetaDataTx,
	stubPrivateFolderMetaDataTx,
	stubPublicDriveMetaDataTx,
	stubPublicFolderMetaDataTx
} from '../../tests/stubs';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { FeeMultiple, W } from '../types';
import {
	BundleRewardSettings,
	CreateDriveV2TxRewardSettings,
	EstimateCreateDriveParams
} from '../types/cost_estimator_types';
import { ArFSCostEstimator } from './arfs_cost_estimator';
import { ARDataPriceChunkEstimator } from './ar_data_price_chunk_estimator';
import { GatewayOracle } from './gateway_oracle';

describe('The ArFSCostEstimator class', () => {
	const arweaveOracle = new GatewayOracle();
	const priceEstimator = new ARDataPriceChunkEstimator(true, arweaveOracle);
	const arFSTagBuilder = new ArFSTagSettings({ appName: 'Fabulous-Test', appVersion: '1.2' });

	const bundledCostEstimator = new ArFSCostEstimator({
		priceEstimator,
		arFSTagBuilder
	});

	const v2TxCostEstimator = new ArFSCostEstimator({
		shouldBundle: false,
		priceEstimator,
		arFSTagBuilder
	});

	const boostedCostEstimator = new ArFSCostEstimator({
		priceEstimator,
		arFSTagBuilder,
		feeMultiple: new FeeMultiple(10)
	});

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		stub(arweaveOracle, 'getWinstonPriceForByteCount').callsFake((input) => Promise.resolve(W(+input)));
	});

	describe('estimateCreateDrive function', () => {
		describe('used on a public drive', () => {
			const publicCreateDriveParams: EstimateCreateDriveParams = {
				rootFolderMetaDataPrototype: stubPublicFolderMetaDataTx,
				driveMetaDataPrototype: stubPublicDriveMetaDataTx
			};

			it('returns correct rewardSetting and totalWinstonPrice for a bundle', async () => {
				const { rewardSettings, totalWinstonPrice } = await bundledCostEstimator.estimateCreateDrive(
					publicCreateDriveParams
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+totalWinstonPrice).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await v2TxCostEstimator.estimateCreateDrive(
					publicCreateDriveParams
				);
				const v2RewardSettings = rewardSettings as CreateDriveV2TxRewardSettings;

				expect(+totalWinstonPrice).to.equal(6);
				expect(+v2RewardSettings.driveRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.driveRewardSettings.feeMultiple!).to.equal(1);
				expect(+v2RewardSettings.rootFolderRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.rootFolderRewardSettings.feeMultiple!).to.equal(1);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a fee boosted bundle', async () => {
				const { rewardSettings, totalWinstonPrice } = await boostedCostEstimator.estimateCreateDrive(
					publicCreateDriveParams
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+totalWinstonPrice).to.equal(30);
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(10);
			});
		});

		describe('used on a private drive', async () => {
			const privateCreateDriveParams: () => Promise<EstimateCreateDriveParams> = async () => {
				return {
					rootFolderMetaDataPrototype: await stubPrivateFolderMetaDataTx,
					driveMetaDataPrototype: await stubPrivateDriveMetaDataTx
				};
			};

			it('returns correct rewardSetting and totalWinstonPrice for a bundle', async () => {
				const { rewardSettings, totalWinstonPrice } = await bundledCostEstimator.estimateCreateDrive(
					await privateCreateDriveParams()
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+totalWinstonPrice).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await v2TxCostEstimator.estimateCreateDrive(
					await privateCreateDriveParams()
				);
				const v2RewardSettings = rewardSettings as CreateDriveV2TxRewardSettings;

				expect(+totalWinstonPrice).to.equal(6);
				expect(+v2RewardSettings.driveRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.driveRewardSettings.feeMultiple!).to.equal(1);
				expect(+v2RewardSettings.rootFolderRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.rootFolderRewardSettings.feeMultiple!).to.equal(1);
			});
		});
	});
});
