import { ByteCount, UploadStats } from '../types';
import {
	V2FileAndMetaDataPlan,
	V2FileDataOnlyPlan,
	V2FolderMetaDataPlan,
	V2TxPlans
} from '../types/upload_planner_types';

export type BundleIndex = number;

interface DataItemPlan {
	// Upload stats can be undefined when a metaData for an over-sized file is packed
	uploadStats?: UploadStats;
	byteCountAsDataItems: ByteCount;
	numberOfDataItems: number;
}

export abstract class BundlePacker {
	constructor(protected readonly maxBundleSize: ByteCount, protected readonly maxDataItemLimit: number) {
		if (!Number.isFinite(maxDataItemLimit) || !Number.isInteger(maxDataItemLimit) || maxDataItemLimit < 2) {
			throw new Error('Maximum data item limit must be an integer value of 2 or more!');
		}
	}

	public abstract readonly v2TxPlans: V2TxPlans;
	public abstract readonly bundles: PlannedBundle[];

	public abstract packIntoBundle(bundlePackParams: DataItemPlan): BundleIndex;
	public abstract canPackDataItemsWithByteCounts(byteCounts: ByteCount[]): boolean;

	public abstract addV2FileAndMetaDataPlan(fileAndMetaDataPlan: V2FileAndMetaDataPlan): void;
	public abstract addV2FileDataOnlyPlan(fileDataOnlyPlan: V2FileDataOnlyPlan): void;
	public abstract addV2FolderMetaDataPlan(folderMetaDataPlan: V2FolderMetaDataPlan): void;
}

/**
 * Pack into lowest index bundle with available size and remaining data items
 *
 * Returns the BundleIndex for use in edge case where FileData is above MAX_BUNDLE_SIZE
 * but the fileMetaData will still be sent up with a bundle
 */
export class LowestIndexBundlePacker extends BundlePacker {
	protected plannedBundles: PlannedBundle[] = [];
	protected plannedV2Txs: V2TxPlans = { fileAndMetaDataPlans: [], fileDataOnlyPlans: [], folderMetaDataPlans: [] };

	public get bundles(): PlannedBundle[] {
		return this.plannedBundles;
	}
	public get v2TxPlans(): V2TxPlans {
		return this.plannedV2Txs;
	}

	public packIntoBundle(dataItemPlan: DataItemPlan): BundleIndex {
		const { byteCountAsDataItems: byteCountAsDataItem, numberOfDataItems } = dataItemPlan;

		for (let index = 0; index < this.bundles.length; index++) {
			const bundle = this.bundles[index];
			// Pack into lowest index bundle that has enough remaining size and data items
			if (+byteCountAsDataItem <= bundle.remainingSize && numberOfDataItems <= bundle.remainingDataItems) {
				bundle.addToBundle(dataItemPlan);
				return index;
			}
		}

		// Otherwise we pack into a new bundle
		this.bundles.push(new PlannedBundle(dataItemPlan, this.maxBundleSize, this.maxDataItemLimit));
		return this.bundles.length - 1;
	}

	public canPackDataItemsWithByteCounts(byteCounts: ByteCount[]): boolean {
		if (byteCounts.reduce((a, b) => a.plus(b)).isGreaterThan(this.maxBundleSize)) {
			return false;
		}

		if (byteCounts.length > this.maxDataItemLimit) {
			return false;
		}

		return true;
	}

	public addV2FileAndMetaDataPlan(fileAndMetaDataPlan: V2FileAndMetaDataPlan): void {
		this.v2TxPlans.fileAndMetaDataPlans.push(fileAndMetaDataPlan);
	}
	public addV2FileDataOnlyPlan(fileDataOnlyPlan: V2FileDataOnlyPlan): void {
		this.v2TxPlans.fileDataOnlyPlans.push(fileDataOnlyPlan);
	}
	public addV2FolderMetaDataPlan(folderMetaDataPlan: V2FolderMetaDataPlan): void {
		this.v2TxPlans.folderMetaDataPlans.push(folderMetaDataPlan);
	}
}

class PlannedBundle {
	protected uploadStatsInBundle: UploadStats[] = [];

	protected totalSizeOfBundle = 0;
	protected totalDataItemsInBundle = 0;

	get remainingSize() {
		return +this.maxBundleSize - this.totalSizeOfBundle;
	}
	get remainingDataItems() {
		return this.maxDataItemLimit - this.totalDataItemsInBundle;
	}

	get uploadStats() {
		return this.uploadStatsInBundle;
	}
	get totalSize() {
		return this.totalSizeOfBundle;
	}
	get totalDataItems() {
		return this.totalDataItemsInBundle;
	}

	constructor(
		initialDataItemPlan: DataItemPlan,
		private readonly maxBundleSize: ByteCount,
		private readonly maxDataItemLimit: number
	) {
		this.addToBundle(initialDataItemPlan);
	}

	addToBundle({ uploadStats, byteCountAsDataItems, numberOfDataItems }: DataItemPlan) {
		this.totalSizeOfBundle += +byteCountAsDataItems;
		this.totalDataItemsInBundle += numberOfDataItems;

		// Metadata of over-sized file uploads can be added without an uploadStats
		if (uploadStats) {
			this.uploadStatsInBundle.push(uploadStats);
		}
	}
}
