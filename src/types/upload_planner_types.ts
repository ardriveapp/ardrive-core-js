import { DataItem } from 'arbundles';
import { FeeMultiple, Winston, RewardSettings, CommunityTipSettings } from '.';
import { ArFSDataToUpload, ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';
import {
	ArFSDriveMetaDataPrototype,
	ArFSFileMetaDataPrototype,
	ArFSFolderMetaDataPrototype
} from '../arfs/arfs_prototypes';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { CommunityOracle } from '../community/community_oracle';
import { FileUploadStats, FolderUploadStats, UploadStats } from '../exports';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { BundleIndex, BundlePacker } from '../utils/bundle_packer';
import { ByteCount } from './byte_count';
import { GQLTagInterface } from './gql_Types';

export type BundlePackerFactory = () => BundlePacker;

export interface ArFSUploadPlannerConstructorParams {
	priceEstimator?: ARDataPriceEstimator;
	arFSTagSettings: ArFSTagSettings;
	communityOracle?: CommunityOracle;
	bundlePacker?: BundlePackerFactory;
	feeMultiple?: FeeMultiple;
	shouldBundle?: boolean;
}

export interface EstimateCreateDriveParams {
	rootFolderMetaDataPrototype: ArFSFolderMetaDataPrototype;
	driveMetaDataPrototype: ArFSDriveMetaDataPrototype;
}

export interface EstimateUploadFileParams {
	fileMetaDataPrototype: ArFSFileMetaDataPrototype;
	fileDataSize: ByteCount;
	contentTypeTag: GQLTagInterface;
}

export interface CreateDriveV2Plan {
	rootFolderByteCount: ByteCount;
	driveByteCount: ByteCount;
}
export interface CreateDriveBundlePlan {
	totalBundledByteCount: ByteCount;
}
export type CreateDrivePlan = CreateDriveV2Plan | CreateDriveBundlePlan;

export function isBundlePlan(plan: CreateDrivePlan): plan is CreateDriveBundlePlan {
	return Object.keys(plan).includes('totalBundledByteCount');
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

export interface CalculatedCreateDrivePlan {
	totalWinstonPrice: Winston;
	rewardSettings: CreateDriveRewardSettings;
}

export interface UploadFileV2TxRewardSettings {
	dataTxRewardSettings: RewardSettings;
	metaDataRewardSettings: RewardSettings;
}
export type UploadFileRewardSettings = UploadFileV2TxRewardSettings | BundleRewardSettings;

export interface UploadPlan {
	bundlePlans: BundlePlan[];
	v2TxPlans: V2TxPlans;
}

export interface CalculatedUploadPlan {
	bundlePlans: CalculatedBundlePlan[];
	v2TxPlans: CalculatedV2TxPlans;
}

/** Bundle plan from ArFSUploadPlanner with totalByteCount determined */
export interface BundlePlan {
	uploadStats: UploadStats[];
	totalByteCount: ByteCount;
}

/** Bundle plan from ArFSCostCalculator with reward/tip settings determined */
export interface CalculatedBundlePlan extends Omit<BundlePlan, 'totalByteCount'> {
	bundleRewardSettings: RewardSettings;
	/** Bundles with no file data will not have a community tip settings */
	communityTipSettings?: CommunityTipSettings;
	/** Meta data for over-sized files will be added to their bundle plan in the ArFSDAO layer */
	metaDataDataItems: DataItem[];
}

/** V2 tx plans from ArFSUploadPlanner with byteCounts for any file data or metadata transactions determined */
export interface V2TxPlans {
	fileAndMetaDataPlans: V2FileAndMetaDataPlan[];
	fileDataOnlyPlans: V2FileDataOnlyPlan[];
	folderMetaDataPlans: V2FolderMetaDataPlan[];
}

export const emptyV2TxPlans = { fileAndMetaDataPlans: [], fileDataOnlyPlans: [], folderMetaDataPlans: [] };

/** V2 tx plans from ArFSCostCalculator with reward/tip settings determined */
export interface CalculatedV2TxPlans {
	fileAndMetaDataPlans: CalculatedFileAndMetaDataPlan[];
	fileDataOnlyPlans: CalculatedFileDataOnlyPlan[];
	folderMetaDataPlans: CalculatedFolderMetaDataPlan[];
}

export interface V2FileAndMetaDataPlan {
	uploadStats: UploadStats<ArFSDataToUpload>;
	fileDataByteCount: ByteCount;
	metaDataByteCount: ByteCount;
}
export interface V2FileDataOnlyPlan {
	uploadStats: UploadStats<ArFSDataToUpload>;
	fileDataByteCount: ByteCount;
	metaDataBundleIndex: BundleIndex;
}
export interface V2FolderMetaDataPlan {
	uploadStats: UploadStats<ArFSFolderToUpload>;
	metaDataByteCount: ByteCount;
}

export interface CalculatedFileAndMetaDataPlan
	extends Omit<V2FileAndMetaDataPlan, 'fileDataByteCount' | 'metaDataByteCount'> {
	dataTxRewardSettings: RewardSettings;
	metaDataRewardSettings: RewardSettings;
	communityTipSettings: CommunityTipSettings;
}
export interface CalculatedFileDataOnlyPlan extends Omit<V2FileDataOnlyPlan, 'fileDataByteCount'> {
	dataTxRewardSettings: RewardSettings;
	communityTipSettings: CommunityTipSettings;
}
export interface CalculatedFolderMetaDataPlan extends Omit<V2FolderMetaDataPlan, 'metaDataByteCount'> {
	metaDataRewardSettings: RewardSettings;
}

export interface PlanEntityParams {
	isBulkUpload: boolean;
}
export type PlanFileParams = FileUploadStats & PlanEntityParams;
export type PlanFolderParams = FolderUploadStats & PlanEntityParams;
