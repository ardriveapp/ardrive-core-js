import { serializeTags } from 'arbundles/src/parser';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ArFSObjectMetadataPrototype } from '../arfs/arfs_prototypes';
import { ArFSObjectTransactionData } from '../arfs/arfs_tx_data_types';
import { ByteCount, FeeMultiple, GQLTagInterface, Winston } from '../types';
import {
	ArFSUploadPlannerConstructorParams,
	BundleRewardSettings,
	CreateDriveV2TxRewardSettings,
	EstimateCreateDriveParams,
	EstimateCreateDriveResult,
	EstimateUploadFileParams,
	EstimateUploadFileResult,
	UploadFileV2TxRewardSettings
} from '../types/upload_planner_types';
import { CommunityOracle } from '../community/community_oracle';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';

/** This limit is being chosen as a precaution due to potential gateway limitations */
export const MAX_BUNDLE_SIZE = 524_288_000; // 500 MiB

/** A utility class for calculating the cost of an ArFS write action */
export class ArFSUploadPlanner {
	private readonly priceEstimator: ARDataPriceEstimator;
	private readonly shouldBundle: boolean;
	private readonly feeMultiple: FeeMultiple;
	private readonly arFSTagSettings: ArFSTagSettings;
	private readonly communityOracle: CommunityOracle;

	constructor({
		shouldBundle = true,
		priceEstimator,
		feeMultiple = new FeeMultiple(1),
		arFSTagSettings,
		communityOracle
	}: ArFSUploadPlannerConstructorParams) {
		this.priceEstimator = priceEstimator;
		this.shouldBundle = shouldBundle;
		this.feeMultiple = feeMultiple;
		this.arFSTagSettings = arFSTagSettings;
		this.communityOracle = communityOracle;
	}

	/** Estimate the cost of a uploading a single file*/
	public async estimateUploadFile(estUploadFileParams: EstimateUploadFileParams): Promise<EstimateUploadFileResult> {
		const { contentTypeTag, fileDataSize, fileMetaDataPrototype } = estUploadFileParams;

		if (this.shouldBundle) {
			const metaDataItemByteCount = this.byteCountAsDataItem(
				fileMetaDataPrototype.objectData.sizeOf(),
				this.arFSTagSettings.baseArFSTagsIncluding({ tags: fileMetaDataPrototype.gqlTags })
			);
			const fileDataItemByteCount = this.byteCountAsDataItem(
				fileDataSize,
				this.arFSTagSettings.baseAppTagsIncluding({ tags: [contentTypeTag] })
			);

			const totalByteCount = new ByteCount(+metaDataItemByteCount + +fileDataItemByteCount);

			// Do not bundle if total byte count of data and meta data would exceed max bundle size limit
			if (+totalByteCount <= MAX_BUNDLE_SIZE) {
				return this.costOfUploadBundledFile({ metaDataItemByteCount, fileDataItemByteCount });
			}
		}

		return this.costOfUploadFileV2Tx(estUploadFileParams);
	}

	/** Calculate the cost of uploading a file data tx and its metadata tx as v2 transactions */
	private async costOfUploadFileV2Tx({
		fileDataSize,
		fileMetaDataPrototype
	}: EstimateUploadFileParams): Promise<EstimateUploadFileResult> {
		const fileDataReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileDataSize);
		const metaDataReward = await this.costOfV2ObjectTx(fileMetaDataPrototype.objectData);

		const rewardSettings: UploadFileV2TxRewardSettings = {
			dataTxRewardSettings: { reward: fileDataReward, feeMultiple: this.feeMultiple },
			metaDataRewardSettings: { reward: metaDataReward, feeMultiple: this.feeMultiple }
		};

		const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(fileDataReward);

		const totalWinstonPrice = this.feeMultiple
			.boostedWinstonReward(fileDataReward)
			.plus(this.feeMultiple.boostedWinstonReward(metaDataReward))
			.plus(communityWinstonTip);

		return { totalWinstonPrice, rewardSettings, communityWinstonTip };
	}

	/** Calculate the cost of uploading a file data tx and its metadata tx together as a bundle */
	private async costOfUploadBundledFile({
		fileDataItemByteCount,
		metaDataItemByteCount
	}: {
		fileDataItemByteCount: ByteCount;
		metaDataItemByteCount: ByteCount;
	}): Promise<EstimateUploadFileResult> {
		const bundleSize = this.bundledByteCountOfDataItems([fileDataItemByteCount, metaDataItemByteCount]);
		const bundleReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(bundleSize);

		const rewardSettings: BundleRewardSettings = {
			bundleRewardSettings: { reward: bundleReward, feeMultiple: this.feeMultiple }
		};

		const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(
			await this.priceEstimator.getBaseWinstonPriceForByteCount(fileDataItemByteCount)
		);

		const totalWinstonPrice = this.feeMultiple.boostedWinstonReward(bundleReward).plus(communityWinstonTip);

		return { totalWinstonPrice, rewardSettings, communityWinstonTip };
	}

	/** Estimate the cost of a create drive */
	public async estimateCreateDrive(arFSPrototypes: EstimateCreateDriveParams): Promise<EstimateCreateDriveResult> {
		if (this.shouldBundle) {
			return this.costOfCreateBundledDrive(arFSPrototypes);
		}

		return this.costOfCreateDriveV2Tx(arFSPrototypes);
	}

	/** Calculate the cost of creating a drive and root folder as v2 transactions */
	private async costOfCreateDriveV2Tx({
		rootFolderMetaDataPrototype,
		driveMetaDataPrototype
	}: EstimateCreateDriveParams): Promise<EstimateCreateDriveResult> {
		const driveReward = await this.costOfV2ObjectTx(driveMetaDataPrototype.objectData);
		const rootFolderReward = await this.costOfV2ObjectTx(rootFolderMetaDataPrototype.objectData);

		const totalWinstonPrice = this.feeMultiple
			.boostedWinstonReward(driveReward)
			.plus(this.feeMultiple.boostedWinstonReward(rootFolderReward));

		const rewardSettings: CreateDriveV2TxRewardSettings = {
			driveRewardSettings: { reward: driveReward, feeMultiple: this.feeMultiple },
			rootFolderRewardSettings: { reward: rootFolderReward, feeMultiple: this.feeMultiple }
		};

		return { totalWinstonPrice, rewardSettings };
	}

	/** Calculate the cost of creating a drive and root folder together as a bundle */
	private async costOfCreateBundledDrive(
		arFSPrototypes: EstimateCreateDriveParams
	): Promise<EstimateCreateDriveResult> {
		const bundleReward = await this.winstonCostOfBundledPrototypes(Object.values(arFSPrototypes));
		const totalWinstonPrice = this.feeMultiple.boostedWinstonReward(bundleReward);

		const rewardSettings: BundleRewardSettings = {
			bundleRewardSettings: { reward: bundleReward, feeMultiple: this.feeMultiple }
		};

		return { totalWinstonPrice, rewardSettings };
	}

	/** Calculate the cost uploading transaction data as a v2 transaction */
	private async costOfV2ObjectTx(objectTransactionData: ArFSObjectTransactionData): Promise<Winston> {
		const metaDataSize = objectTransactionData.sizeOf();
		return this.priceEstimator.getBaseWinstonPriceForByteCount(metaDataSize);
	}

	/** Calculate the size of an ArFS Prototype as a DataItem */
	private byteCountAsDataItem(dataSize: ByteCount, gqlTags: GQLTagInterface[]): ByteCount {
		// referenced from https://github.com/Bundlr-Network/arbundles/blob/master/src/ar-data-create.ts

		// We're not using the optional target and anchor fields, they will always be 1 byte
		const targetLength = 1;
		const anchorLength = 1;

		// Get byte length of tags after being serialized for avro schema
		const serializedTags = serializeTags(gqlTags);
		const tagsLength = 16 + serializedTags.byteLength;

		const arweaveSignerLength = 512;
		const ownerLength = 512;

		const signatureTypeLength = 2;

		const dataLength = +dataSize;

		const totalByteLength =
			arweaveSignerLength +
			ownerLength +
			signatureTypeLength +
			targetLength +
			anchorLength +
			tagsLength +
			dataLength;

		return new ByteCount(totalByteLength);
	}

	/** Calculate the bundled size from an array of data item byte counts  */
	private bundledByteCountOfDataItems(dataItemByteCounts: ByteCount[]): ByteCount {
		// 32 byte array for representing the number of data items in the bundle
		const byteArraySize = 32;

		// Get total byte length of combined binaries
		let totalDataItemsSize = 0;
		for (const dataItemByteCount of dataItemByteCounts) {
			totalDataItemsSize += +dataItemByteCount;
		}

		// Each data item gets a 64 byte header added to the bundle
		const headersSize = dataItemByteCounts.length * 64;

		return new ByteCount(byteArraySize + totalDataItemsSize + headersSize);
	}

	/** Calculate the cost of uploading an array of ArFS Prototypes together as a bundle */
	private async winstonCostOfBundledPrototypes(arFSPrototypes: ArFSObjectMetadataPrototype[]): Promise<Winston> {
		const dataItemSizes = arFSPrototypes.map((p) =>
			this.byteCountAsDataItem(
				p.objectData.sizeOf(),
				this.arFSTagSettings.baseArFSTagsIncluding({ tags: p.gqlTags })
			)
		);
		const bundledSize = this.bundledByteCountOfDataItems(dataItemSizes);
		return this.priceEstimator.getBaseWinstonPriceForByteCount(bundledSize);
	}
}
