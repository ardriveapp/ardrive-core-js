import { FeeMultiple, Winston, RewardSettings } from '.';
import { ArFSDriveMetaDataPrototype, ArFSFolderMetaDataPrototype } from '../arfs/arfs_prototypes';
import { ArFSTagSettings } from '../arfs/arfs_tag_builder';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';

export interface ArFSCostEstimatorConstructorParams {
	priceEstimator: ARDataPriceEstimator;
	arFSTagBuilder: ArFSTagSettings;
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
	// TODO: Add Bundle Plan { numOfBundles: number , ... }
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
