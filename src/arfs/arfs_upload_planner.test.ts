/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { stub } from 'sinon';
import {
	fakeArweave,
	stubArweaveAddress,
	stubEntityID,
	stubEntityIDAlt,
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
import { MAX_BUNDLE_SIZE, privateOctetContentTypeTag, publicJsonContentTypeTag } from '../utils/constants';
import { ArFSUploadPlanner } from './arfs_upload_planner';
import { ARDataPriceNetworkEstimator } from '../pricing/ar_data_price_network_estimator';
import { wrapFileOrFolder, ArFSFileToUpload, ArFSFolderToUpload } from './arfs_file_wrapper';

describe('The ArFSUploadPlanner class', () => {
	const priceEstimator = new ARDataPriceNetworkEstimator();
	const arFSTagSettings = new ArFSTagSettings({ appName: 'Fabulous-Test', appVersion: '1.2' });
	const communityOracle = new ArDriveCommunityOracle(fakeArweave);

	const bundledUploadPlanner = new ArFSUploadPlanner({
		priceEstimator,
		arFSTagSettings: arFSTagSettings,
		feeMultiple: new FeeMultiple(1),
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

	/** An upload planner set to only send v2 transactions */
	const v2TxUploadPlanner = new ArFSUploadPlanner({
		shouldBundle: false,
		priceEstimator,
		arFSTagSettings: arFSTagSettings,
		feeMultiple: new FeeMultiple(1),
		communityOracle
	});

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		stub(priceEstimator, 'getBaseWinstonPriceForByteCount').callsFake((input) => Promise.resolve(W(+input)));
		// Stub community tip to always be 123456 Winston
		stub(communityOracle, 'getCommunityWinstonTip').resolves(W(123456));
		// Stub community tip to always be 123456 Winston
		stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());
	});

	it('cannot be constructed with a max data item limit of less than 2', () => {
		expect(() => new ArFSUploadPlanner({ arFSTagSettings, maxDataItemLimit: 1 })).to.throw(
			Error,
			'Maximum data item limit must be an integer value of 2 or more!'
		);
	});
	it('cannot be constructed with a non-integer decimal value as the max data item limit', () => {
		expect(() => new ArFSUploadPlanner({ arFSTagSettings, maxDataItemLimit: 5.5 })).to.throw(
			Error,
			'Maximum data item limit must be an integer value of 2 or more!'
		);
	});

	describe('planUploadAllEntities method', () => {
		const stubPlanUploadStats = {
			destDriveId: stubEntityID,
			destFolderId: stubEntityID
		};

		const newStubPlanFileUploadStats = () => {
			return { ...stubPlanUploadStats, wrappedEntity: wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload };
		};
		const newStubPlanFolderUploadStats = () => {
			return {
				...stubPlanUploadStats,
				wrappedEntity: wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload
			};
		};

		it('returns the expected uploadPlan for a single wrappedFile', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				newStubPlanFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadOrders, totalByteCount } = bundlePlans[0];

			expect(uploadOrders.length).to.equal(1);
			expect(+totalByteCount).to.equal(5953);
		});

		it('returns the expected uploadPlan for a single wrappedFolder', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				newStubPlanFolderUploadStats()
			]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadOrders, totalByteCount } = bundlePlans[0];

			expect(uploadOrders.length).to.equal(8);
			expect(+totalByteCount).to.equal(11287);
		});

		it('returns the expected uploadPlan for a folder with an existing folder id', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const wrappedFolderWithExistingId = wrapFileOrFolder(
				'./tests/stub_files/bulk_root_folder'
			) as ArFSFolderToUpload;
			wrappedFolderWithExistingId.existingId = stubEntityIDAlt;

			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				{ ...newStubPlanFolderUploadStats(), wrappedEntity: wrappedFolderWithExistingId }
			]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadOrders, totalByteCount } = bundlePlans[0];

			expect(uploadOrders.length).to.equal(7);
			expect(+totalByteCount).to.equal(11196);

			// Expect first upload order to have our existing stub folder id
			expect(`${uploadOrders[0].destFolderId}`).to.equal(`${stubEntityIDAlt}`);
		});

		it('returns the expected uploadPlan for a two wrappedFiles', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				newStubPlanFileUploadStats(),
				newStubPlanFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadOrders, totalByteCount } = bundlePlans[0];

			expect(uploadOrders.length).to.equal(2);
			expect(+totalByteCount).to.equal(11874);
		});

		it('returns the expected uploadPlan for a single file that is over the size limit', async () => {
			const uploadPlannerWithLowByteLimit = new ArFSUploadPlanner({
				arFSTagSettings,
				maxBundleLimit: new ByteCount(3_000)
			});
			const { bundlePlans, v2TxPlans } = await uploadPlannerWithLowByteLimit.planUploadAllEntities([
				newStubPlanFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(0);
			expect(v2TxPlans.length).to.equal(1);

			const { fileDataByteCount, metaDataByteCount, metaDataBundleIndex } = v2TxPlans[0];

			expect(+fileDataByteCount!).to.equal(3204);
			expect(+metaDataByteCount!).to.equal(166);
			expect(metaDataBundleIndex).to.be.undefined;
		});

		it('returns the expected uploadPlan for a two files that are over the size limit', async () => {
			const uploadPlannerWithLowByteLimit = new ArFSUploadPlanner({
				arFSTagSettings,
				maxBundleLimit: new ByteCount(3_000)
			});
			const { bundlePlans, v2TxPlans } = await uploadPlannerWithLowByteLimit.planUploadAllEntities([
				newStubPlanFileUploadStats(),
				newStubPlanFileUploadStats()
			]);

			// Expect one bundle for the 2 metadata data items
			expect(bundlePlans.length).to.equal(1);
			const { uploadOrders, totalByteCount: bundleByteCount } = bundlePlans[0];
			expect(+bundleByteCount).to.equal(3108);
			expect(uploadOrders.length).to.equal(0);

			// Expect two v2 transactions for the oversized files
			expect(v2TxPlans.length).to.equal(2);
			for (const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } of v2TxPlans) {
				expect(+fileDataByteCount!).to.equal(3204);

				// V2 tx plan will have a metadata bundle index for
				expect(metaDataBundleIndex).to.equal(0);
				expect(metaDataByteCount).to.be.undefined;
			}
		});

		it('returns the expected uploadPlan for a two wrappedFiles when shouldBundle is set to false', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings, shouldBundle: false });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				newStubPlanFileUploadStats(),
				newStubPlanFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(0);

			expect(v2TxPlans.length).to.equal(2);
			for (const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } of v2TxPlans) {
				expect(+fileDataByteCount!).to.equal(3204);
				expect(+metaDataByteCount!).to.equal(166);
				expect(metaDataBundleIndex).to.be.undefined;
			}
		});

		const bulkFolderV2Expectations = [
			{ expectedMetaDataSize: 27 },
			{ expectedFileSize: 12, expectedMetaDataSize: 158 },
			{ expectedMetaDataSize: 24 },
			{ expectedFileSize: 12, expectedMetaDataSize: 160 },
			{ expectedMetaDataSize: 23 },
			{ expectedFileSize: 14, expectedMetaDataSize: 159 },
			{ expectedMetaDataSize: 28 },
			{ expectedFileSize: 14, expectedMetaDataSize: 164 }
		];

		it('returns the expected uploadPlan for a wrappedFolder when shouldBundle is set to false', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings, shouldBundle: false });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				newStubPlanFolderUploadStats()
			]);

			expect(bundlePlans.length).to.equal(0);

			expect(v2TxPlans.length).to.equal(8);
			for (let index = 0; index < v2TxPlans.length; index++) {
				const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } = v2TxPlans[index];
				const { expectedFileSize, expectedMetaDataSize } = bulkFolderV2Expectations[index];

				if (expectedFileSize) {
					expect(+fileDataByteCount!).to.equal(expectedFileSize);
				}
				expect(+metaDataByteCount!).to.equal(expectedMetaDataSize);
				expect(metaDataBundleIndex).to.be.undefined;
			}
		});

		it('returns the expected uploadPlan for single wrappedFolder', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const emptyWrappedFolder = wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;

			// Empty the contents of the folder to upload
			emptyWrappedFolder.files = [];
			emptyWrappedFolder.folders = [];

			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				{ ...newStubPlanFolderUploadStats(), wrappedEntity: emptyWrappedFolder }
			]);

			// Expect no bundles for a single folder meta data upload
			expect(bundlePlans.length).to.equal(0);
			expect(v2TxPlans.length).to.equal(1);

			const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } = v2TxPlans[0];

			expect(fileDataByteCount).to.be.undefined;
			expect(+metaDataByteCount!).to.equal(27);
			expect(metaDataBundleIndex).to.be.undefined;
		});
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
					fileDataSize: new ByteCount(+MAX_BUNDLE_SIZE + 1)
				};

				// We will expect a v2 transaction if the upload will be larger than the max bundle size
				const result = await bundledUploadPlanner.estimateUploadFile(hugeUploadFileParams);

				const { rewardSettings, totalWinstonPrice, communityWinstonTip } = result;
				const v2RewardSettings = rewardSettings as UploadFileV2TxRewardSettings;

				// Expect file data transaction of max bundle size + 1
				expect(+v2RewardSettings.dataTxRewardSettings.reward!).to.equal(+MAX_BUNDLE_SIZE + 1);
				expect(+v2RewardSettings.dataTxRewardSettings.feeMultiple!).to.equal(1);

				// Expected meta data transaction size is 163 bytes
				expect(+v2RewardSettings.metaDataRewardSettings.reward!).to.equal(163);
				expect(+v2RewardSettings.metaDataRewardSettings.feeMultiple!).to.equal(1);
				expect(+communityWinstonTip).to.equal(123_456);

				// Expect total price to be: MAX_BUNDLE_SIZE + 1 + (meta data price) + (community tip)
				expect(+totalWinstonPrice).to.equal(+MAX_BUNDLE_SIZE + 1 + 163 + 123456);
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
