import { CommunityOracle } from '../community/community_oracle';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { FeeMultiple, Winston, RewardSettings, W, CommunityTipSettings, ByteCount } from '../types';
import {
	CalculatedBundlePlan,
	BundlePlan,
	UploadPlan,
	CalculatedUploadPlan,
	CreateDrivePlan,
	CalculatedCreateDrivePlan,
	isBundlePlan,
	CreateDriveV2Plan,
	CreateDriveBundlePlan,
	V2FileAndMetaDataPlan,
	CalculatedFileAndMetaDataPlan,
	CalculatedFileDataOnlyPlan,
	V2FileDataOnlyPlan,
	CalculatedV2TxPlans,
	V2FolderMetaDataPlan,
	CalculatedFolderMetaDataPlan,
	CalculatedV2MetaDataUploadPlan
} from '../types/upload_planner_types';

export interface CostCalculator {
	calculateCostsForUploadPlan({
		bundlePlans,
		v2TxPlans
	}: UploadPlan): Promise<{ calculatedUploadPlan: CalculatedUploadPlan; totalWinstonPrice: Winston }>;
	calculateCostForCreateDrive(createDrivePlan: CreateDrivePlan): Promise<CalculatedCreateDrivePlan>;
	calculateCostForV2MetaDataUpload(
		metaDataByteCount: ByteCount
	): Promise<{ metaDataRewardSettings: RewardSettings; totalWinstonPrice: Winston }>;
}

interface ArFSCostCalculatorConstructorParams {
	priceEstimator: ARDataPriceEstimator;
	communityOracle: CommunityOracle;
	feeMultiple: FeeMultiple;
}

/** A utility class for calculating the cost of an ArFS write action */
export class ArFSCostCalculator implements CostCalculator {
	private readonly priceEstimator: ARDataPriceEstimator;
	private readonly communityOracle: CommunityOracle;
	private readonly feeMultiple: FeeMultiple;

	constructor({ priceEstimator, feeMultiple, communityOracle }: ArFSCostCalculatorConstructorParams) {
		this.priceEstimator = priceEstimator;
		this.feeMultiple = feeMultiple;
		this.communityOracle = communityOracle;
	}

	/** Constructs reward settings with the feeMultiple from the cost calculator */
	private rewardSettingsForWinston(reward: Winston): RewardSettings {
		return { reward, feeMultiple: this.feeMultiple };
	}
	/** Returns a reward boosted by the feeMultiple from the cost calculator */
	private boostedReward(reward: Winston): Winston {
		return this.feeMultiple.boostedWinstonReward(reward);
	}

	/** Calculates bundleRewardSettings and communityTipSettings for a planned bundle */
	private async calculateCostsForBundlePlan({
		totalByteCount,
		uploadStats
	}: BundlePlan): Promise<{ calculatedBundlePlan: CalculatedBundlePlan; totalPriceOfBundle: Winston }> {
		let totalPriceOfBundle: Winston = W(0);

		const winstonPriceOfBundle = await this.priceEstimator.getBaseWinstonPriceForByteCount(totalByteCount);
		totalPriceOfBundle = totalPriceOfBundle.plus(this.boostedReward(winstonPriceOfBundle));

		const bundleRewardSettings = this.rewardSettingsForWinston(winstonPriceOfBundle);
		let communityTipSettings: CommunityTipSettings | undefined = undefined;

		// For now, we only add a community tip if there are files present within the bundle
		const hasFileData = uploadStats.find((u) => u.wrappedEntity.entityType === 'file');
		if (hasFileData) {
			const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(winstonPriceOfBundle);
			let communityTipTarget;
			try {
				communityTipTarget = await this.communityOracle.selectTokenHolder();
				communityTipSettings = { communityTipTarget, communityWinstonTip };
				totalPriceOfBundle = totalPriceOfBundle.plus(communityWinstonTip);
			} catch (error) {
				console.error(`Failed to select token holder: ${error}. Skipping community tip.`);
				// Community tip is not added to total price if token holder selection fails
			}
		} 

		return {
			calculatedBundlePlan: {
				uploadStats,
				bundleRewardSettings,
				communityTipSettings,
				metaDataDataItems: []
			},
			totalPriceOfBundle
		};
	}

	/** Calculates fileDataRewardSettings, metaDataRewardSettings, and communityTipSettings for a planned file and meta data v2 tx */
	private async calculateCostsForV2FileAndMetaData({
		fileDataByteCount,
		metaDataByteCount,
		uploadStats
	}: V2FileAndMetaDataPlan): Promise<{
		calculatedFileAndMetaDataPlan: CalculatedFileAndMetaDataPlan;
		totalPriceOfV2Tx: Winston;
	}> {
		const winstonPriceOfDataTx = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileDataByteCount);
		const winstonPriceOfMetaDataTx = await this.priceEstimator.getBaseWinstonPriceForByteCount(metaDataByteCount);

		let communityTipSettings: CommunityTipSettings | undefined;
		let totalPriceOfV2Tx: Winston;

		try {
			const communityTipTarget = await this.communityOracle.selectTokenHolder();
			const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(winstonPriceOfDataTx);
			communityTipSettings = { communityTipTarget, communityWinstonTip };

			totalPriceOfV2Tx = this.boostedReward(winstonPriceOfDataTx)
				.plus(this.boostedReward(winstonPriceOfMetaDataTx))
				.plus(communityWinstonTip);
		} catch (error) {
			console.error(`Failed to select token holder: ${error}. Skipping community tip.`);
			totalPriceOfV2Tx = this.boostedReward(winstonPriceOfDataTx)
				.plus(this.boostedReward(winstonPriceOfMetaDataTx));
		}

		return {
			calculatedFileAndMetaDataPlan: {
				uploadStats,
				communityTipSettings,
				dataTxRewardSettings: this.rewardSettingsForWinston(winstonPriceOfDataTx),
				metaDataRewardSettings: this.rewardSettingsForWinston(winstonPriceOfMetaDataTx)
			},
			totalPriceOfV2Tx
		};
	}

	/** Calculates fileDataRewardSettings and communityTipSettings for a planned file data only v2 tx */
	private async calculateCostsForV2FileDataOnly({
		fileDataByteCount,
		metaDataBundleIndex,
		uploadStats
	}: V2FileDataOnlyPlan): Promise<{
		calculatedFileDataOnlyPlan: CalculatedFileDataOnlyPlan;
		totalPriceOfV2Tx: Winston;
	}> {
		const winstonPriceOfDataTx = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileDataByteCount);

		let communityTipSettings: CommunityTipSettings | undefined;
		let totalPriceOfV2Tx: Winston;

		try {
			const communityTipTarget = await this.communityOracle.selectTokenHolder();
			const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(winstonPriceOfDataTx);
			communityTipSettings = { communityTipTarget, communityWinstonTip };

			totalPriceOfV2Tx = this.boostedReward(winstonPriceOfDataTx).plus(communityWinstonTip);
		} catch (error) {
			console.error(`Failed to select token holder: ${error}. Skipping community tip.`);
			totalPriceOfV2Tx = this.boostedReward(winstonPriceOfDataTx);
		}

		return {
			calculatedFileDataOnlyPlan: {
				uploadStats,
				communityTipSettings,
				dataTxRewardSettings: this.rewardSettingsForWinston(winstonPriceOfDataTx),
				metaDataBundleIndex
			},
			totalPriceOfV2Tx
		};
	}

	/** Calculates fileDataRewardSettings and communityTipSettings for a planned folder metadata v2 tx */
	// prettier-ignore
	private async calculateCostsForV2FolderMetaData({ metaDataByteCount, uploadStats }: V2FolderMetaDataPlan): Promise<{
		calculatedFolderMetaDataPlan: CalculatedFolderMetaDataPlan;
		totalPriceOfV2Tx: Winston;
	}> {
		const winstonPriceOfMetaDataTx = await this.priceEstimator.getBaseWinstonPriceForByteCount(metaDataByteCount);

		const totalPriceOfV2Tx = this.boostedReward(winstonPriceOfMetaDataTx);

		return {
			calculatedFolderMetaDataPlan: {
				uploadStats,
				metaDataRewardSettings: this.rewardSettingsForWinston(winstonPriceOfMetaDataTx)
			},
			totalPriceOfV2Tx
		};
	}

	public async calculateCostsForUploadPlan({
		bundlePlans,
		v2TxPlans
	}: UploadPlan): Promise<{ calculatedUploadPlan: CalculatedUploadPlan; totalWinstonPrice: Winston }> {
		let totalWinstonPrice: Winston = W(0);
		const calculatedBundlePlans: CalculatedBundlePlan[] = [];
		const calculatedV2TxPlans: CalculatedV2TxPlans = {
			fileAndMetaDataPlans: [],
			fileDataOnlyPlans: [],
			folderMetaDataPlans: []
		};

		for (const plan of bundlePlans) {
			const { calculatedBundlePlan, totalPriceOfBundle } = await this.calculateCostsForBundlePlan(plan);

			totalWinstonPrice = totalWinstonPrice.plus(totalPriceOfBundle);
			calculatedBundlePlans.push(calculatedBundlePlan);
		}

		for (const plan of v2TxPlans.fileAndMetaDataPlans) {
			const { calculatedFileAndMetaDataPlan, totalPriceOfV2Tx } = await this.calculateCostsForV2FileAndMetaData(
				plan
			);
			totalWinstonPrice = totalWinstonPrice.plus(totalPriceOfV2Tx);
			calculatedV2TxPlans.fileAndMetaDataPlans.push(calculatedFileAndMetaDataPlan);
		}

		for (const plan of v2TxPlans.fileDataOnlyPlans) {
			const { calculatedFileDataOnlyPlan, totalPriceOfV2Tx } = await this.calculateCostsForV2FileDataOnly(plan);
			totalWinstonPrice = totalWinstonPrice.plus(totalPriceOfV2Tx);
			calculatedV2TxPlans.fileDataOnlyPlans.push(calculatedFileDataOnlyPlan);
		}

		for (const plan of v2TxPlans.folderMetaDataPlans) {
			const { calculatedFolderMetaDataPlan, totalPriceOfV2Tx } = await this.calculateCostsForV2FolderMetaData(
				plan
			);
			totalWinstonPrice = totalWinstonPrice.plus(totalPriceOfV2Tx);
			calculatedV2TxPlans.folderMetaDataPlans.push(calculatedFolderMetaDataPlan);
		}

		return {
			calculatedUploadPlan: { bundlePlans: calculatedBundlePlans, v2TxPlans: calculatedV2TxPlans },
			totalWinstonPrice
		};
	}

	private async calculateV2CreateDriveCost({
		driveByteCount,
		rootFolderByteCount
	}: CreateDriveV2Plan): Promise<CalculatedCreateDrivePlan> {
		const driveReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(driveByteCount);
		const rootFolderReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(rootFolderByteCount);

		const totalWinstonPrice = this.boostedReward(driveReward).plus(this.boostedReward(rootFolderReward));

		const rewardSettings = {
			driveRewardSettings: this.rewardSettingsForWinston(driveReward),
			rootFolderRewardSettings: this.rewardSettingsForWinston(rootFolderReward)
		};

		return { rewardSettings, totalWinstonPrice };
	}

	private async calculateBundledCreateDriveCost({
		totalBundledByteCount
	}: CreateDriveBundlePlan): Promise<CalculatedCreateDrivePlan> {
		const bundleReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(totalBundledByteCount);
		const totalWinstonPrice = this.boostedReward(bundleReward);

		const rewardSettings = {
			bundleRewardSettings: this.rewardSettingsForWinston(bundleReward)
		};

		return { rewardSettings, totalWinstonPrice };
	}

	public async calculateCostForCreateDrive(createDrivePlan: CreateDrivePlan): Promise<CalculatedCreateDrivePlan> {
		if (isBundlePlan(createDrivePlan)) {
			return this.calculateBundledCreateDriveCost(createDrivePlan);
		}

		return this.calculateV2CreateDriveCost(createDrivePlan);
	}

	public async calculateCostForV2MetaDataUpload(
		metaDataByteCount: ByteCount
	): Promise<CalculatedV2MetaDataUploadPlan> {
		const metaDataReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(metaDataByteCount);

		return {
			metaDataRewardSettings: this.rewardSettingsForWinston(metaDataReward),
			totalWinstonPrice: this.boostedReward(metaDataReward)
		};
	}
}
