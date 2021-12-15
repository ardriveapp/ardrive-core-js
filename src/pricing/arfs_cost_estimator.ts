import { serializeTags } from 'arbundles/src/parser';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ArFSObjectMetadataPrototype } from '../arfs/arfs_prototypes';
import { ArFSObjectTransactionData } from '../arfs/arfs_tx_data_types';
import { ByteCount, FeeMultiple, Winston } from '../types';
import {
	ArFSCostEstimatorConstructorParams,
	BundleRewardSettings,
	CreateDriveV2TxRewardSettings,
	EstimateCreateDriveParams,
	EstimateCreateDriveResult
} from '../types/cost_estimator_types';
import { ARDataPriceEstimator } from './ar_data_price_estimator';

/** A utility class for calculating the cost of an ArFS write action */
export class ArFSCostEstimator {
	private readonly priceEstimator: ARDataPriceEstimator;
	private readonly shouldBundle: boolean;
	private readonly feeMultiple: FeeMultiple;
	private readonly arFSTagBuilder: ArFSTagSettings;

	constructor({
		shouldBundle = true,
		priceEstimator,
		feeMultiple = new FeeMultiple(1),
		arFSTagBuilder
	}: ArFSCostEstimatorConstructorParams) {
		this.priceEstimator = priceEstimator;
		this.shouldBundle = shouldBundle;
		this.feeMultiple = feeMultiple;
		this.arFSTagBuilder = arFSTagBuilder;
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
		const bundleReward = await this.bundledCostOfPrototypes(Object.values(arFSPrototypes));
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
	private sizeAsDataItem(objectPrototype: ArFSObjectMetadataPrototype): ByteCount {
		// referenced from https://github.com/Bundlr-Network/arbundles/blob/master/src/ar-data-create.ts

		// We're not using the optional target and anchor fields, they will always be 1 byte
		const targetLength = 1;
		const anchorLength = 1;

		// Get byte length of tags after being serialized for avro schema
		const serializedTags = serializeTags(
			this.arFSTagBuilder.assembleBaseArFSTags({ tags: objectPrototype.gqlTags })
		);
		const tagsLength = 16 + serializedTags.byteLength;

		const arweaveSignerLength = 512;
		const ownerLength = 512;

		const signatureTypeLength = 2;

		const dataLength = +objectPrototype.objectData.sizeOf();

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
	private bundledSizeOfDataItems(dataItemSizes: ByteCount[]): ByteCount {
		// 32 byte array for representing the number of data items in the bundle
		const byteArray = 32;

		// Get total byte length of combined binaries
		let totalDataItemsSize = 0;
		for (const dataItemSize of dataItemSizes) {
			totalDataItemsSize = totalDataItemsSize + +dataItemSize;
		}

		// Each data item gets a 64 byte header added to the bundle
		const headersSize = dataItemSizes.length * 64;

		return new ByteCount(byteArray + totalDataItemsSize + headersSize);
	}

	/** Calculate the cost of uploading an array of ArFS Prototypes together as a bundle */
	private async bundledCostOfPrototypes(arFSPrototypes: ArFSObjectMetadataPrototype[]): Promise<Winston> {
		const dataItemSizes = arFSPrototypes.map((p) => this.sizeAsDataItem(p));
		const bundledSize = this.bundledSizeOfDataItems(dataItemSizes);
		return this.priceEstimator.getBaseWinstonPriceForByteCount(bundledSize);
	}
}
