import { CommunityOracle } from '../community/community_oracle';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { FeeMultiple, Winston, RewardSettings, W, CommunityTipSettings } from '../types';
import {
	CalculatedBundlePlan,
	CalculatedV2TxPlan,
	BundlePlan,
	V2TxPlan,
	UploadFileV2TxRewardSettings,
	UploadPlan,
	CalculatedUploadPlan,
	CreateDrivePlan,
	CalculatedCreateDrivePlan,
	isBundlePlan,
	CreateDriveV2Plan,
	CreateDriveBundlePlan
} from '../types/upload_planner_types';

export interface CostCalculator {
	calculateCostsForUploadPlan({
		bundlePlans,
		v2TxPlans
	}: UploadPlan): Promise<{ calculatedUploadPlan: CalculatedUploadPlan; totalWinstonPrice: Winston }>;
	calculateCostForCreateDrive(createDrivePlan: CreateDrivePlan): Promise<CalculatedCreateDrivePlan>;
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
			const communityTipTarget = await this.communityOracle.selectTokenHolder();

			totalPriceOfBundle = totalPriceOfBundle.plus(communityWinstonTip);
			communityTipSettings = { communityTipTarget, communityWinstonTip };
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

	/** Calculates fileDataRewardSettings, metaDataRewardSettings, and communityTipSettings for a planned v2 tx */
	private async calculateCostsForV2TxPlan({
		fileDataByteCount,
		metaDataByteCount,
		uploadStats,
		metaDataBundleIndex
	}: V2TxPlan): Promise<{ calculatedV2TxPlan: CalculatedV2TxPlan; totalPriceOfV2Tx: Winston }> {
		let totalPriceOfV2Tx: Winston = W(0);
		const rewardSettings: Partial<UploadFileV2TxRewardSettings> = {};
		let communityTipSettings: CommunityTipSettings | undefined = undefined;

		if (fileDataByteCount) {
			const winstonPriceOfDataTx = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileDataByteCount);
			totalPriceOfV2Tx = totalPriceOfV2Tx.plus(this.boostedReward(winstonPriceOfDataTx));

			rewardSettings.dataTxRewardSettings = this.rewardSettingsForWinston(winstonPriceOfDataTx);

			const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(winstonPriceOfDataTx);
			const communityTipTarget = await this.communityOracle.selectTokenHolder();

			totalPriceOfV2Tx = totalPriceOfV2Tx.plus(communityWinstonTip);
			communityTipSettings = { communityTipTarget, communityWinstonTip };
		}

		if (metaDataByteCount) {
			const winstonPriceOfMetaDataTx = await this.priceEstimator.getBaseWinstonPriceForByteCount(
				metaDataByteCount
			);
			totalPriceOfV2Tx = totalPriceOfV2Tx.plus(this.boostedReward(winstonPriceOfMetaDataTx));

			rewardSettings.metaDataRewardSettings = this.rewardSettingsForWinston(winstonPriceOfMetaDataTx);
		}

		return {
			calculatedV2TxPlan: {
				uploadStats,
				rewardSettings,
				communityTipSettings,
				metaDataBundleIndex
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
		const calculatedV2TxPlans: CalculatedV2TxPlan[] = [];

		for (const plan of bundlePlans) {
			const { calculatedBundlePlan, totalPriceOfBundle } = await this.calculateCostsForBundlePlan(plan);

			totalWinstonPrice = totalWinstonPrice.plus(totalPriceOfBundle);
			calculatedBundlePlans.push(calculatedBundlePlan);
		}

		for (const plan of v2TxPlans) {
			const { calculatedV2TxPlan, totalPriceOfV2Tx } = await this.calculateCostsForV2TxPlan(plan);

			totalWinstonPrice = totalWinstonPrice.plus(totalPriceOfV2Tx);
			calculatedV2TxPlans.push(calculatedV2TxPlan);
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
}
