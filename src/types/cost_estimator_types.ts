import { GQLTagInterface, FeeMultiple, Winston, RewardSettings } from '.';
import { ArFSDriveMetaDataPrototype, ArFSFolderMetaDataPrototype } from '../arfs/arfs_prototypes';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';

export interface ArFSCostEstimatorConstructorParams {
	priceEstimator: ARDataPriceEstimator;
	baseTags: GQLTagInterface[];
	feeMultiple?: FeeMultiple;
	bundle?: boolean;
}

export interface EstimateCreateDriveParams {
	rootFolderMetaDataPrototype: ArFSFolderMetaDataPrototype;
	driveMetaDataPrototype: ArFSDriveMetaDataPrototype;
}

export interface EstimateResult<T> {
	totalWinstonPrice: Winston;
	rewardSettings: T;
}

export interface BundleRewardSettings {
	bundleRewardSettings: RewardSettings;
}

export function isBundleRewardSetting(
	rewardSettings: BundleRewardSettings | unknown
): rewardSettings is BundleRewardSettings {
	return Object.keys(rewardSettings as BundleRewardSettings).includes('bundleRewardSettings');
}

export interface CreateDriveV2TxRewardSettings {
	rootFolderRewardSettings: RewardSettings;
	driveRewardSettings: RewardSettings;
}

export type CreateDriveRewardSettings = CreateDriveV2TxRewardSettings | BundleRewardSettings;

export type EstimateCreateDriveResult = EstimateResult<CreateDriveRewardSettings>;
