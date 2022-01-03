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
} from '../types/upload_planner_types';
import { privateOctetContentTypeTag, publicJsonContentTypeTag } from '../utils/constants';
import { ArFSUploadPlanner, MAX_BUNDLE_SIZE } from './arfs_upload_planner';
import { ARDataPriceNetworkEstimator } from '../pricing/ar_data_price_network_estimator';

describe('The ArFSUploadPlanner class', () => {
	const priceEstimator = new ARDataPriceNetworkEstimator();
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

	const boostedV2TxUploadPlanner = new ArFSUploadPlanner({
		shouldBundle: false,
		priceEstimator,
		arFSTagSettings: arFSTagSettings,
		feeMultiple: new FeeMultiple(10),
		communityOracle
	});

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		stub(priceEstimator, 'getBaseWinstonPriceForByteCount').callsFake((input) => Promise.resolve(W(+input)));

		// Stub community tip to always be 123456 Winston
		stub(communityOracle, 'getCommunityWinstonTip').resolves(W(123456));
	});

	describe('estimateCreateDrive function', () => {
		describe('used on a public drive', () => {
			const publicCreateDriveParams: EstimateCreateDriveParams = {
				rootFolderMetaDataPrototype: stubPublicFolderMetaDataTx,
				driveMetaDataPrototype: stubPublicDriveMetaDataTx
			};

			it('returns correct rewardSettings and totalWinstonPrice for a bundle', async () => {
				const { rewardSettings, totalWinstonPrice } = await bundledUploadPlanner.estimateCreateDrive(
					publicCreateDriveParams
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				// Expected ByteCount for this create drive Bundle is 2832
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(2832);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);

				expect(+totalWinstonPrice).to.equal(2832);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await v2TxUploadPlanner.estimateCreateDrive(
					publicCreateDriveParams
				);
				const v2RewardSettings = rewardSettings as CreateDriveV2TxRewardSettings;

				// Expected byte count of drive metadata tx is 91 bytes
				expect(+v2RewardSettings.driveRewardSettings.reward!).to.equal(91);
				expect(+v2RewardSettings.driveRewardSettings.feeMultiple!).to.equal(1);

				// Expected byte count of root folder metadata tx is 38 bytes
				expect(+v2RewardSettings.rootFolderRewardSettings.reward!).to.equal(38);
				expect(+v2RewardSettings.rootFolderRewardSettings.feeMultiple!).to.equal(1);

				expect(+totalWinstonPrice).to.equal(129);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a fee boosted bundle', async () => {
				const { rewardSettings, totalWinstonPrice } = await boostedUploadPlanner.estimateCreateDrive(
					publicCreateDriveParams
				);
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				// Expected ByteCount for this create drive Bundle is 2832
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(2832);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(10);

				// Expect the total to be boosted x10
				expect(+totalWinstonPrice).to.equal(28320);
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

				// Expected ByteCount for this private drive Bundle is 2998
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(2998);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);

				expect(+totalWinstonPrice).to.equal(2998);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await v2TxUploadPlanner.estimateCreateDrive(
					await privateCreateDriveParams()
				);
				const v2RewardSettings = rewardSettings as CreateDriveV2TxRewardSettings;

				// Expected byte count of private drive metadata tx is 108 bytes
				expect(+v2RewardSettings.driveRewardSettings.reward!).to.equal(108);
				expect(+v2RewardSettings.driveRewardSettings.feeMultiple!).to.equal(1);

				// Expected byte count of private root folder metadata tx is 55 bytes
				expect(+v2RewardSettings.rootFolderRewardSettings.reward!).to.equal(55);
				expect(+v2RewardSettings.rootFolderRewardSettings.feeMultiple!).to.equal(1);

				expect(+totalWinstonPrice).to.equal(163);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a fee boosted v2 transaction', async () => {
				const { rewardSettings, totalWinstonPrice } = await boostedV2TxUploadPlanner.estimateCreateDrive(
					await privateCreateDriveParams()
				);
				const v2RewardSettings = rewardSettings as CreateDriveV2TxRewardSettings;

				// Expected byte count of private drive metadata tx is 108 bytes
				expect(+v2RewardSettings.driveRewardSettings.reward!).to.equal(108);
				expect(+v2RewardSettings.driveRewardSettings.feeMultiple!).to.equal(10);

				// Expected byte count of private root folder metadata tx is 55 bytes
				expect(+v2RewardSettings.rootFolderRewardSettings.reward!).to.equal(55);
				expect(+v2RewardSettings.rootFolderRewardSettings.feeMultiple!).to.equal(10);

				// Expect total price to be boosted x10
				expect(+totalWinstonPrice).to.equal(1630);
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

				// Expected byteCount of meta data as data item = 1471
				// Expected byteCount of file data as data item = 1125
				// Expected byteCount of these data items as a bundle = 2756
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(2756);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(123_456);

				expect(+totalWinstonPrice).to.equal(126_212);
			});

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a v2 transaction if the total size of the bundle would exceed the max bundle size limit', async () => {
				const hugeUploadFileParams = {
					...publicUploadFileParams,
					fileDataSize: new ByteCount(MAX_BUNDLE_SIZE + 1)
				};

				// We will expect a v2 transaction if the upload will be larger than the max bundle size
				const result = await bundledUploadPlanner.estimateUploadFile(hugeUploadFileParams);

				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				// Expect file data transaction of max bundle size + 1
				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(MAX_BUNDLE_SIZE + 1);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(1);

				// Expected meta data transaction size is 163 bytes
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(163);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(123_456);

				// Expect total price to be: MAX_BUNDLE_SIZE + 1 + (meta data price) + (community tip)
				expect(+totalWinstonPrice).to.equal(MAX_BUNDLE_SIZE + 1 + 163 + 123456);
			});

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a v2 transaction', async () => {
				const result = await v2TxUploadPlanner.estimateUploadFile(publicUploadFileParams);
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;

				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				// File data transaction of 10 bytes
				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(10);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(1);

				// Expected meta data transaction size is 163 bytes
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(163);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(123_456);

				// 10 + 163 + 123,456 = 123629 totalPrice
				expect(+totalWinstonPrice).to.equal(123_629);
			});

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a fee boosted v2 transaction', async () => {
				const result = await boostedV2TxUploadPlanner.estimateUploadFile(publicUploadFileParams);
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;

				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				// File data transaction of 10 bytes
				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(10);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(10);

				// Expected meta data transaction size is 163 bytes
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(163);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(10);
				expect(+communityWinstonTip).to.equal(123_456);

				// Expect rewards to be boosted x10 on total price:
				// 100 + 1630 + 123,456 = 123629 totalPrice
				expect(+totalWinstonPrice).to.equal(125_186);
			});

			it('returns correct rewardSetting, totalWinstonPrice, and communityWinstonTip for a fee boosted bundle', async () => {
				const result = await boostedUploadPlanner.estimateUploadFile(publicUploadFileParams);
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const bundleRewardSettings = rewardSettings as BundleRewardSettings;

				// Expected byteCount of meta data as data item = 1471
				// Expected byteCount of file data as data item = 1125
				// Expected byteCount of these data items as a bundle = 2756
				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(2756);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(10);
				expect(+communityWinstonTip).to.equal(123_456);

				// Expect total price to have bundle reward boosted by 10x and have tip added
				// 2,756 * 10 + 123,456 = 151,016
				expect(+totalWinstonPrice).to.equal(151_016);
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

				expect(+bundleRewardSettings.bundleRewardSettings.reward!).to.equal(2834);
				expect(+bundleRewardSettings.bundleRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(123_456);

				expect(+totalWinstonPrice).to.equal(126_290);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const result = await v2TxUploadPlanner.estimateUploadFile(await privateUploadFileParams());
				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				// File data transaction of 10 bytes
				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(10);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(1);

				// Expected private meta data transaction size is 180 bytes
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(180);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(123_456);

				expect(+totalWinstonPrice).to.equal(123_646);
			});
		});
	});
});
