/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave, stubFileUploadStats, stubArweaveAddress, stubEmptyFolderStats } from '../../tests/stubs';
import { ArDriveCommunityOracle } from '../exports';
import { ARDataPriceNetworkEstimator } from '../pricing/ar_data_price_network_estimator';
import { ByteCount, FeeMultiple, W } from '../types';
import { BundleRewardSettings, CreateDriveV2TxRewardSettings, emptyV2TxPlans } from '../types/upload_planner_types';
import { ArFSCostCalculator } from './arfs_cost_calculator';

describe('ArFSCostCalculator class', () => {
	const priceEstimator = new ARDataPriceNetworkEstimator();
	const communityOracle = new ArDriveCommunityOracle(fakeArweave);

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		stub(priceEstimator, 'getBaseWinstonPriceForByteCount').callsFake((input) => Promise.resolve(W(+input)));

		stub(communityOracle, 'getCommunityWinstonTip').resolves(W(1_234));
		stub(communityOracle, 'selectTokenHolder').resolves(stubArweaveAddress());
	});

	const costCalc = new ArFSCostCalculator({ priceEstimator, communityOracle, feeMultiple: new FeeMultiple(1) });
	const boostedX10CostCalc = new ArFSCostCalculator({
		priceEstimator,
		communityOracle,
		feeMultiple: new FeeMultiple(10)
	});
	const stubUploadStatsWithFile = stubFileUploadStats();

	describe('calculateCostsForUploadPlan method', () => {
		it('returns the expected calculated upload plan for an upload plan with a bundlePlan that has no file upload stats', async () => {
			const { calculatedUploadPlan, totalWinstonPrice } = await costCalc.calculateCostsForUploadPlan({
				bundlePlans: [{ uploadStats: [], totalByteCount: new ByteCount(10) }],
				v2TxPlans: emptyV2TxPlans
			});

			const { bundlePlans, v2TxPlans } = calculatedUploadPlan;
			const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans } = v2TxPlans;

			expect(bundlePlans.length).to.equal(1);

			expect(fileAndMetaDataPlans.length).to.equal(0);
			expect(fileDataOnlyPlans.length).to.equal(0);
			expect(folderMetaDataPlans.length).to.equal(0);

			const { bundleRewardSettings, uploadStats, communityTipSettings } = bundlePlans[0];

			expect(uploadStats.length).to.equal(0);
			expect(communityTipSettings).to.be.undefined;

			expect(+bundleRewardSettings.reward!).to.equal(10);
			expect(+bundleRewardSettings.feeMultiple!).to.equal(1);

			expect(+totalWinstonPrice).to.equal(10);
		});

		it('returns the expected calculated upload plan for an upload plan with a bundlePlan that has file upload stats', async () => {
			const { calculatedUploadPlan, totalWinstonPrice } = await costCalc.calculateCostsForUploadPlan({
				bundlePlans: [{ uploadStats: [stubUploadStatsWithFile], totalByteCount: new ByteCount(10) }],
				v2TxPlans: emptyV2TxPlans
			});

			const { bundlePlans, v2TxPlans } = calculatedUploadPlan;
			const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans } = v2TxPlans;

			expect(bundlePlans.length).to.equal(1);

			expect(fileAndMetaDataPlans.length).to.equal(0);
			expect(fileDataOnlyPlans.length).to.equal(0);
			expect(folderMetaDataPlans.length).to.equal(0);

			const { bundleRewardSettings, uploadStats, communityTipSettings } = bundlePlans[0];

			expect(uploadStats.length).to.equal(1);

			expect(`${communityTipSettings?.communityTipTarget}`).to.equal(
				'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'
			);
			expect(+communityTipSettings!.communityWinstonTip).to.equal(1_234);

			expect(+bundleRewardSettings.reward!).to.equal(10);
			expect(+bundleRewardSettings.feeMultiple!).to.equal(1);

			// (byteCount: 10) + (commTip: 1,234) = (totalPrice: 1,244)
			expect(+totalWinstonPrice).to.equal(1244);
		});

		it('returns the expected calculated upload plan for an upload plan with a v2TxPlan that has only a meta data byte count', async () => {
			const { calculatedUploadPlan, totalWinstonPrice } = await costCalc.calculateCostsForUploadPlan({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					folderMetaDataPlans: [{ uploadStats: stubEmptyFolderStats(), metaDataByteCount: new ByteCount(5) }]
				}
			});

			const { bundlePlans, v2TxPlans } = calculatedUploadPlan;
			const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans } = v2TxPlans;

			expect(bundlePlans.length).to.equal(0);

			expect(fileAndMetaDataPlans.length).to.equal(0);
			expect(fileDataOnlyPlans.length).to.equal(0);
			expect(folderMetaDataPlans.length).to.equal(1);

			const { metaDataRewardSettings } = folderMetaDataPlans[0];

			expect(+metaDataRewardSettings.reward!).to.equal(5);
			expect(+metaDataRewardSettings.feeMultiple!).to.equal(1);

			expect(+totalWinstonPrice).to.equal(5);
		});

		it('returns the expected calculated upload plan for an upload plan with a v2TxPlan that has a file data byte count and a meta data byte count', async () => {
			const { calculatedUploadPlan, totalWinstonPrice } = await costCalc.calculateCostsForUploadPlan({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileAndMetaDataPlans: [
						{
							uploadStats: stubUploadStatsWithFile,
							metaDataByteCount: new ByteCount(5),
							fileDataByteCount: new ByteCount(20)
						}
					]
				}
			});

			const { bundlePlans, v2TxPlans } = calculatedUploadPlan;
			const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans } = v2TxPlans;

			expect(bundlePlans.length).to.equal(0);

			expect(fileAndMetaDataPlans.length).to.equal(1);
			expect(fileDataOnlyPlans.length).to.equal(0);
			expect(folderMetaDataPlans.length).to.equal(0);

			const { dataTxRewardSettings, metaDataRewardSettings, communityTipSettings } = fileAndMetaDataPlans[0];

			expect(communityTipSettings).to.not.be.undefined;

			expect(`${communityTipSettings!.communityTipTarget}`).to.equal(
				'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'
			);
			expect(+communityTipSettings!.communityWinstonTip).to.equal(1_234);

			expect(+dataTxRewardSettings.reward!).to.equal(20);
			expect(+dataTxRewardSettings.feeMultiple!).to.equal(1);

			expect(+metaDataRewardSettings.reward!).to.equal(5);
			expect(+metaDataRewardSettings.feeMultiple!).to.equal(1);

			// (data reward: 20) + (metadata reward: 5) + (commTip: 1,234) = (totalPrice)
			expect(+totalWinstonPrice).to.equal(1_259);
		});

		it('returns the expected calculated upload plan for an upload plan with a v2TxPlan that has only a file data byte count', async () => {
			const { calculatedUploadPlan, totalWinstonPrice } = await costCalc.calculateCostsForUploadPlan({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileDataOnlyPlans: [
						{
							uploadStats: stubUploadStatsWithFile,
							fileDataByteCount: new ByteCount(25),
							metaDataBundleIndex: 0
						}
					]
				}
			});

			const { bundlePlans, v2TxPlans } = calculatedUploadPlan;
			const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans } = v2TxPlans;

			expect(bundlePlans.length).to.equal(0);

			expect(fileAndMetaDataPlans.length).to.equal(0);
			expect(fileDataOnlyPlans.length).to.equal(1);
			expect(folderMetaDataPlans.length).to.equal(0);

			const { dataTxRewardSettings, metaDataBundleIndex, communityTipSettings } = fileDataOnlyPlans[0];

			expect(communityTipSettings).to.not.be.undefined;

			expect(`${communityTipSettings!.communityTipTarget}`).to.equal(
				'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'
			);
			expect(+communityTipSettings!.communityWinstonTip).to.equal(1_234);

			expect(+dataTxRewardSettings.reward!).to.equal(25);
			expect(+dataTxRewardSettings.feeMultiple!).to.equal(1);

			expect(metaDataBundleIndex).to.equal(0);

			// (dataTxReward) + (commTip) = (totalPrice)
			expect(+totalWinstonPrice).to.equal(1_259);
		});

		it('returns the expected calculated upload plan with a boosted calculator', async () => {
			const { calculatedUploadPlan, totalWinstonPrice } = await boostedX10CostCalc.calculateCostsForUploadPlan({
				bundlePlans: [{ uploadStats: [stubUploadStatsWithFile], totalByteCount: new ByteCount(10) }],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileAndMetaDataPlans: [
						{
							uploadStats: stubUploadStatsWithFile,
							metaDataByteCount: new ByteCount(5),
							fileDataByteCount: new ByteCount(20)
						}
					]
				}
			});

			const { bundlePlans, v2TxPlans } = calculatedUploadPlan;

			expect(bundlePlans.length).to.equal(1);

			const { bundleRewardSettings, uploadStats, communityTipSettings: bundleCommTipSettings } = bundlePlans[0];

			expect(uploadStats.length).to.equal(1);

			expect(`${bundleCommTipSettings?.communityTipTarget}`).to.equal(
				'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'
			);
			expect(+bundleCommTipSettings!.communityWinstonTip).to.equal(1_234);

			expect(+bundleRewardSettings.reward!).to.equal(10);
			expect(+bundleRewardSettings.feeMultiple!).to.equal(10);

			const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans } = v2TxPlans;

			expect(fileAndMetaDataPlans.length).to.equal(1);
			expect(fileDataOnlyPlans.length).to.equal(0);
			expect(folderMetaDataPlans.length).to.equal(0);

			const {
				metaDataRewardSettings,
				dataTxRewardSettings,
				communityTipSettings: v2CommTipSettings
			} = fileAndMetaDataPlans[0];

			expect(`${v2CommTipSettings?.communityTipTarget}`).to.equal('abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH');
			expect(+v2CommTipSettings!.communityWinstonTip).to.equal(1_234);

			expect(+dataTxRewardSettings.reward!).to.equal(20);
			expect(+dataTxRewardSettings.feeMultiple!).to.equal(10);

			expect(+metaDataRewardSettings.reward!).to.equal(5);
			expect(+metaDataRewardSettings.feeMultiple!).to.equal(10);

			// ((bundleReward * 10) + (dataReward * 10) + (metaReward * 10) + (v2CommTip) + (bundleCommTip) = (totalPrice)
			// 100 + 200 + 50 + 1234 + 1234 = 2818
			expect(+totalWinstonPrice).to.equal(2_818);
		});
	});

	describe('calculateCostForCreateDrive', () => {
		it('returns the expected calculated create drive plan for a bundle', async () => {
			const { rewardSettings, totalWinstonPrice } = await costCalc.calculateCostForCreateDrive({
				totalBundledByteCount: new ByteCount(100)
			});

			const { bundleRewardSettings } = rewardSettings as BundleRewardSettings;

			expect(+totalWinstonPrice).to.equal(100);
			expect(+bundleRewardSettings.reward!).to.equal(100);
			expect(+bundleRewardSettings.feeMultiple!).to.equal(1);
		});

		it('returns the expected calculated create drive plan for a boosted bundle', async () => {
			const { rewardSettings, totalWinstonPrice } = await boostedX10CostCalc.calculateCostForCreateDrive({
				totalBundledByteCount: new ByteCount(100)
			});

			const { bundleRewardSettings } = rewardSettings as BundleRewardSettings;

			expect(+totalWinstonPrice).to.equal(1000);
			expect(+bundleRewardSettings.reward!).to.equal(100);
			expect(+bundleRewardSettings.feeMultiple!).to.equal(10);
		});

		it('returns the expected calculated create drive plan for a v2 tx', async () => {
			const { rewardSettings, totalWinstonPrice } = await costCalc.calculateCostForCreateDrive({
				driveByteCount: new ByteCount(10),
				rootFolderByteCount: new ByteCount(5)
			});

			const { driveRewardSettings, rootFolderRewardSettings } = rewardSettings as CreateDriveV2TxRewardSettings;

			expect(+totalWinstonPrice).to.equal(15);
			expect(+driveRewardSettings.reward!).to.equal(10);
			expect(+driveRewardSettings.feeMultiple!).to.equal(1);
			expect(+rootFolderRewardSettings.reward!).to.equal(5);
			expect(+rootFolderRewardSettings.feeMultiple!).to.equal(1);
		});

		it('returns the expected calculated create drive plan for a boosted v2 tx', async () => {
			const { rewardSettings, totalWinstonPrice } = await boostedX10CostCalc.calculateCostForCreateDrive({
				driveByteCount: new ByteCount(10),
				rootFolderByteCount: new ByteCount(5)
			});

			const { driveRewardSettings, rootFolderRewardSettings } = rewardSettings as CreateDriveV2TxRewardSettings;

			expect(+totalWinstonPrice).to.equal(150);
			expect(+driveRewardSettings.reward!).to.equal(10);
			expect(+driveRewardSettings.feeMultiple!).to.equal(10);
			expect(+rootFolderRewardSettings.reward!).to.equal(5);
			expect(+rootFolderRewardSettings.feeMultiple!).to.equal(10);
		});
	});

	describe('calculateCostForV2MetaDataUpload method', () => {
		it('returns the expected calculated v2 meta data upload plan', async () => {
			const { metaDataRewardSettings, totalWinstonPrice } = await costCalc.calculateCostForV2MetaDataUpload(
				new ByteCount(20)
			);

			const { reward, feeMultiple } = metaDataRewardSettings;

			expect(+totalWinstonPrice).to.equal(20);
			expect(+reward!).to.equal(20);
			expect(+feeMultiple!).to.equal(1);
		});

		it('returns the expected calculated create drive plan for a boosted bundle', async () => {
			// prettier-ignore
			const { metaDataRewardSettings, totalWinstonPrice } =
				await boostedX10CostCalc.calculateCostForV2MetaDataUpload(new ByteCount(20));

			const { reward, feeMultiple } = metaDataRewardSettings;

			expect(+totalWinstonPrice).to.equal(200);
			expect(+reward!).to.equal(20);
			expect(+feeMultiple!).to.equal(10);
		});
	});
});
