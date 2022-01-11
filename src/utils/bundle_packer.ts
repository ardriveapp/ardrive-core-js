import { ByteCount, UploadStats } from '../types';

export type BundleIndex = number;

interface BundlePackParams {
	// Upload stats can be undefined when a metaData for an over-sized file is packed
	uploadStats?: UploadStats;
	byteCountAsDataItem: ByteCount;
	numberOfDataItems: number;
}

export abstract class BundlePacker {
	public bundles: BundleToPack[] = [];

	abstract packIntoBundle(bundlePackParams: BundlePackParams): BundleIndex;
}

/**
 * Pack into lowest index bundle with available size and remaining data items
 *
 * Preserve the BundleIndex for use in edge case where FileData is above MAX_BUNDLE_SIZE
 * but the fileMetaData will still be sent up with a bundle
 */
export class LowestIndexBundlePacker extends BundlePacker {
	constructor(private readonly maxBundleSize: ByteCount, private readonly maxDataItemLimit: number) {
		super();
	}

	packIntoBundle(bundlePackParams: BundlePackParams): BundleIndex {
		const { byteCountAsDataItem, numberOfDataItems } = bundlePackParams;

		if (+byteCountAsDataItem > +this.maxBundleSize) {
			throw new Error('Data item is too large to be packed into a bundle!');
		}

		if (numberOfDataItems > this.maxDataItemLimit) {
			throw new Error('Data item count is too high to be packed into a bundle!');
		}

		for (let index = 0; index < this.bundles.length; index++) {
			const bundle = this.bundles[index];
			// Pack into lowest index bundle that has enough remaining size and data items
			if (+byteCountAsDataItem <= bundle.remainingSize && numberOfDataItems <= bundle.remainingDataItems) {
				bundle.addToBundle(bundlePackParams);
				return index;
			}
		}

		// Otherwise we pack into a new bundle
		this.bundles.push(new BundleToPack(bundlePackParams, this.maxBundleSize, this.maxDataItemLimit));
		return this.bundles.length - 1;
	}
}

class BundleToPack {
	public uploadStats: UploadStats[] = [];

	public totalSize = 0;
	public totalDataItems = 0;

	get remainingSize() {
		return +this.maxBundleSize - this.totalSize;
	}
	get remainingDataItems() {
		return this.maxDataItemLimit - this.totalDataItems;
	}

	constructor(
		initialBundlePackParams: BundlePackParams,
		private readonly maxBundleSize: ByteCount,
		private readonly maxDataItemLimit: number
	) {
		this.addToBundle(initialBundlePackParams);
	}

	addToBundle({ uploadStats, byteCountAsDataItem, numberOfDataItems }: BundlePackParams) {
		this.totalSize += +byteCountAsDataItem;
		this.totalDataItems += numberOfDataItems;

		// Metadata of over-sized file uploads can be added without an uploadStats
		if (uploadStats) {
			this.uploadStats.push(uploadStats);
		}
	}
}
