/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { stub } from 'sinon';
import {
	fakeArweave,
	stubPrivateDriveMetaDataTx,
	stubPrivateFileMetaDataTx,
	stubPrivateFolderMetaDataTx,
	stubPublicDriveMetaDataTx,
	stubPublicFileMetaDataTx,
	stubPublicFolderMetaDataTx
} from '../../tests/stubs';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ArDriveCommunityOracle } from '../community/ardrive_community_oracle';
import { ByteCount, FeeMultiple, W } from '../types';
import {
	BundleRewardSettings,
	CreateDriveV2TxRewardSettings,
	EstimateCreateDriveParams,
	EstimateUploadFileParams,
	UploadFileV2TxRewardSettings
} from '../types/cost_estimator_types';
import { privateOctetContentTypeTag, publicJsonContentTypeTag } from '../utils/constants';
import { ArFSUploadPlanner } from './arfs_upload_planner';
import { ARDataPriceChunkEstimator } from '../pricing/ar_data_price_chunk_estimator';
import { GatewayOracle } from '../pricing/gateway_oracle';

describe('The ArFSUploadPlanner class', () => {
	const arweaveOracle = new GatewayOracle();
	const priceEstimator = new ARDataPriceChunkEstimator(true, arweaveOracle);
	const arFSTagSettings = new ArFSTagSettings({ appName: 'Fabulous-Test', appVersion: '1.2' });
	const communityOracle = new ArDriveCommunityOracle(fakeArweave);

	const bundledUploadPlanner = new ArFSUploadPlanner({
		priceEstimator,
		arFSTagSettings: arFSTagSettings,
		communityOracle
	});

	const v2TxUploadPlanner = new ArFSUploadPlanner({
		shouldBundle: false,
		priceEstimator,
		arFSTagSettings: arFSTagSettings,
		communityOracle
	});

	const boostedUploadPlanner = new ArFSUploadPlanner({
		priceEstimator,
		arFSTagSettings: arFSTagSettings,
		feeMultiple: new FeeMultiple(10),
		communityOracle
	});

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		stub(arweaveOracle, 'getWinstonPriceForByteCount').callsFake((input) => Promise.resolve(W(+input)));

		// Stub community tip to always be 2 Winston
		stub(communityOracle, 'getCommunityWinstonTip').resolves(W(2));
	});

	describe('estimateCreateDrive function', () => {
		describe('used on a public drive', () => {
			const publicCreateDriveParams: EstimateCreateDriveParams = {
				rootFolderMetaDataPrototype: stubPublicFolderMetaDataTx,
				driveMetaDataPrototype: stubPublicDriveMetaDataTx
			};

			it('returns correct rewardSetting and totalWinstonPrice for a bundle', async () => {
				const { rewardSettings, totalWinstonPrice } = await bundledUploadPlanner.estimateCreateDrive(
					publicCreateDriveParams
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+totalWinstonPrice).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await v2TxUploadPlanner.estimateCreateDrive(
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
				const { rewardSettings, totalWinstonPrice } = await boostedUploadPlanner.estimateCreateDrive(
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
				const { rewardSettings, totalWinstonPrice } = await bundledUploadPlanner.estimateCreateDrive(
					await privateCreateDriveParams()
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+totalWinstonPrice).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await v2TxUploadPlanner.estimateCreateDrive(
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

	describe('estimateUploadFile function', () => {
		describe('used on a public file', () => {
			const publicUploadFileParams: EstimateUploadFileParams = {
				fileDataSize: new ByteCount(10),
				fileMetaDataPrototype: stubPublicFileMetaDataTx,
				contentTypeTag: publicJsonContentTypeTag
			};

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a bundle', async () => {
				const result = await bundledUploadPlanner.estimateUploadFile(publicUploadFileParams);
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;

				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(2);

				expect(+totalWinstonPrice).to.equal(7);
			});

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a v2 transaction', async () => {
				const result = await v2TxUploadPlanner.estimateUploadFile(publicUploadFileParams);
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;

				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(1);
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(2);

				expect(+totalWinstonPrice).to.equal(10);
			});

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a fee boosted bundle', async () => {
				const result = await boostedUploadPlanner.estimateUploadFile(publicUploadFileParams);
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(10);
				expect(+communityWinstonTip).to.equal(2);

				expect(+totalWinstonPrice).to.equal(34);
			});
		});

		describe('used on a private file', async () => {
			const privateUploadFileParams: () => Promise<EstimateUploadFileParams> = async () => {
				return {
					fileDataSize: new ByteCount(10),
					fileMetaDataPrototype: await stubPrivateFileMetaDataTx,
					contentTypeTag: privateOctetContentTypeTag
				};
			};

			it('returns correct rewardSetting and totalWinstonPrice for a bundle', async () => {
				const result = await bundledUploadPlanner.estimateUploadFile(await privateUploadFileParams());
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(3);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(2);

				expect(+totalWinstonPrice).to.equal(7);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const result = await v2TxUploadPlanner.estimateUploadFile(await privateUploadFileParams());
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(1);
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(3);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(2);

				expect(+totalWinstonPrice).to.equal(10);
			});
		});
	});
});
