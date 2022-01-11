import { serializeTags } from 'arbundles/src/parser';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ArFSObjectMetadataPrototype } from '../arfs/arfs_prototypes';
import { ArFSObjectTransactionData } from '../arfs/arfs_tx_data_types';
import { ByteCount, EID, FeeMultiple, GQLTagInterface, RewardSettings, UploadOrder, Winston } from '../types';
import {
	ArFSUploadPlannerConstructorParams,
	BundlePlan,
	BundleRewardSettings,
	CreateDriveV2TxRewardSettings,
	EstimateCreateDriveParams,
	EstimateCreateDriveResult,
	PlanFileParams,
	PlanFolderParams,
	UploadPlan,
	V2TxPlan
} from '../types/upload_planner_types';
import { CommunityOracle } from '../community/community_oracle';
import { MAX_BUNDLE_SIZE, MAX_DATA_ITEM_LIMIT } from '../utils/constants';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { isFolder } from './arfs_file_wrapper';
import { v4 } from 'uuid';
import { getFileEstimationInfo, getFolderEstimationInfo } from '../pricing/estimation_prototypes';
import { BundlePacker, LowestIndexBundlePacker } from '../utils/bundle_packer';

/** Utility class for planning an upload into an UploadPlan */
export class ArFSUploadPlanner {
	private readonly shouldBundle: boolean;
	private readonly arFSTagSettings: ArFSTagSettings;
	private readonly bundlePacker: BundlePacker;

	protected readonly maxDataItemLimit: number;
	protected readonly maxBundleLimit: ByteCount;

	// These class settings have been moved to the ArFSCostCalculator class
	/** @deprecated */
	protected readonly feeMultiple?: FeeMultiple;
	/** @deprecated */
	protected readonly priceEstimator?: ARDataPriceEstimator;
	/** @deprecated */
	protected readonly communityOracle?: CommunityOracle;

	constructor({
		shouldBundle = true,
		priceEstimator,
		feeMultiple = new FeeMultiple(1),
		arFSTagSettings,
		communityOracle,
		maxBundleLimit = MAX_BUNDLE_SIZE,
		maxDataItemLimit = MAX_DATA_ITEM_LIMIT,
		bundlePacker = new LowestIndexBundlePacker(maxBundleLimit, maxDataItemLimit)
	}: ArFSUploadPlannerConstructorParams) {
		this.shouldBundle = shouldBundle;
		this.arFSTagSettings = arFSTagSettings;
		this.maxBundleLimit = maxBundleLimit;
		this.bundlePacker = bundlePacker;

		if (!Number.isFinite(maxDataItemLimit) || !Number.isInteger(maxDataItemLimit) || maxDataItemLimit < 2) {
			throw new Error('Maximum data item limit must be an integer value of 2 or more!');
		}
		this.maxDataItemLimit = maxDataItemLimit;

		// TODO: Fully decouple and deprecate these
		this.feeMultiple = feeMultiple;
		this.priceEstimator = priceEstimator;
		this.communityOracle = communityOracle;
	}

	/** Constructs reward settings with the feeMultiple from the cost calculator */
	private rewardSettingsForWinston(reward: Winston): RewardSettings {
		return { reward, feeMultiple: this.feeMultiple };
	}
	/** Returns a reward boosted by the feeMultiple from the cost calculator */
	private boostedReward(reward: Winston): Winston {
		return this.feeMultiple!.boostedWinstonReward(reward);
	}

	private v2TxsToUpload: V2TxPlan[] = [];

	/**
	 * Plans a file as a bundle to upload or v2 transaction to upload
	 *
	 * @remarks Uses the presence of a driveKey to determine privacy
	 * @remarks Uses the `shouldBundle` class setting to determine whether to bundle
	 * @remarks Files over the max bundle size limit will not be bundled, but their
	 * 	meta data will be bundled if there will be multiple entities uploaded
	 */
	private async planFile(planFileParams: PlanFileParams): Promise<void> {
		const { wrappedEntity: wrappedFile, isBulkUpload, driveKey } = planFileParams;
		const isPrivate = driveKey !== undefined;
		const { fileDataByteCount, fileMetaDataPrototype } = await getFileEstimationInfo(wrappedFile, isPrivate);

		const fileDataItemByteCount = this.byteCountAsDataItem(
			fileDataByteCount,
			this.arFSTagSettings.getFileDataTags(isPrivate)
		);
		const metaDataByteCountAsDataItem = this.byteCountAsDataItem(
			fileMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: fileMetaDataPrototype.gqlTags })
		);
		const totalByteCountOfFileDataItems = new ByteCount(+fileDataItemByteCount + +metaDataByteCountAsDataItem);

		if (!this.shouldBundle || +totalByteCountOfFileDataItems > +this.maxBundleLimit) {
			// If the file data is too large it must be sent as a v2 tx
			let v2TxToUpload: V2TxPlan = { uploadOrder: planFileParams, fileDataByteCount };

			// We will preserve this bundle index because the metadata cannot be separated
			// from the file data until ArFSDAO has generated a TxID from signing
			if (isBulkUpload && this.shouldBundle) {
				// This metadata can be packed with another bundle since other upload orders do exist
				const metaDataBundleIndex = this.bundlePacker.packIntoBundle({
					byteCountAsDataItem: metaDataByteCountAsDataItem,
					numberOfDataItems: 1
				});

				v2TxToUpload = {
					...v2TxToUpload,
					metaDataBundleIndex
				};
			} else {
				// Otherwise we must send the metadata as a v2 tx because there will be nothing to bundle it with
				const metaDataByteCount = fileMetaDataPrototype.objectData.sizeOf();

				v2TxToUpload = {
					...v2TxToUpload,
					metaDataByteCount
				};
			}
			// Add to the v2TxsToUpload
			this.v2TxsToUpload.push(v2TxToUpload);
		} else {
			// Otherwise we will always pack the metadata tx and data tx in the same bundle
			this.bundlePacker.packIntoBundle({
				byteCountAsDataItem: totalByteCountOfFileDataItems,
				numberOfDataItems: 2,
				uploadOrder: planFileParams
			});
		}
	}

	/**
	 * Flattens a recursive folder and packs all entities within the
	 * folder them into bundles to upload or v2 transactions to upload
	 *
	 * @remarks Uses the presence of a driveKey to determine privacy
	 * @remarks Uses the `shouldBundle` class setting to determine whether to bundle
	 */
	private async planFolder(planFolderParams: PlanFolderParams): Promise<void> {
		const { wrappedEntity: wrappedFolder, driveKey } = planFolderParams;
		const isPrivate = driveKey !== undefined;

		const { folderByteCount, folderMetaDataPrototype } = await getFolderEstimationInfo(
			wrappedFolder.destinationBaseName,
			isPrivate
		);

		if (!wrappedFolder.existingId) {
			// We won't create a new folder if one already exists
			if (this.shouldBundle) {
				this.bundlePacker.packIntoBundle({
					uploadOrder: planFolderParams,
					byteCountAsDataItem: folderByteCount,
					numberOfDataItems: 1
				});
			} else {
				this.v2TxsToUpload.push({
					uploadOrder: planFolderParams,
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
			}
		}
		// For new folders, we will generate and preserve the folder ID
		// early to prevent parent folder id information from being lost
		wrappedFolder.existingId ??= EID(v4());

		const partialPlanParams = {
			...planFolderParams,
			destFolderId: wrappedFolder.existingId
		};

		for await (const file of wrappedFolder.files) {
			await this.planFile({
				...partialPlanParams,
				wrappedEntity: file
			});
		}

		// Recurse into each folder, flattening them into bundles
		for await (const folder of wrappedFolder.folders) {
			await this.planFolder({
				...partialPlanParams,
				wrappedEntity: folder
			});
		}
	}

	/**
	 *  Plans an upload using the `uploadAllEntities` ArDrive method
	 *  into bundles or v2 transactions and estimates the total winston cost
	 */
	public async planUploadAllEntities(uploadOrders: UploadOrder[]): Promise<UploadPlan> {
		const isBulkUpload = uploadOrders.length > 1;

		for await (const uploadOrder of uploadOrders) {
			const { wrappedEntity } = uploadOrder;

			if (isFolder(wrappedEntity)) {
				await this.planFolder({ ...uploadOrder, wrappedEntity, isBulkUpload });
			} else {
				await this.planFile({ ...uploadOrder, wrappedEntity, isBulkUpload });
			}
		}

		const bundlePlans: BundlePlan[] = [];
		for await (const { uploadOrders, totalDataItems, totalSize } of this.bundlePacker.bundles) {
			if (totalDataItems === 1) {
				// Edge case: Do not send up a bundle with a single folder data item
				const { wrappedEntity, driveKey } = uploadOrders[0];
				if (!isFolder(wrappedEntity)) {
					throw new Error('Error: A file cannot be bundled alone without its metadata!');
				}

				const { folderMetaDataPrototype } = await getFolderEstimationInfo(
					wrappedEntity.destinationBaseName,
					driveKey !== undefined
				);

				// Unpack this bundle into the v2TxsToUpload
				this.v2TxsToUpload.push({
					uploadOrder: uploadOrders[0],
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
				continue;
			}

			const bundledByteCount = this.bundledByteCountOfBundleToPack(new ByteCount(totalSize), totalDataItems);

			bundlePlans.push({
				uploadOrders: uploadOrders,
				totalByteCount: bundledByteCount
			});
		}

		return { v2TxPlans: this.v2TxsToUpload, bundlePlans };
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

		const totalWinstonPrice = this.boostedReward(driveReward).plus(this.boostedReward(rootFolderReward));

		const rewardSettings: CreateDriveV2TxRewardSettings = {
			driveRewardSettings: this.rewardSettingsForWinston(driveReward),
			rootFolderRewardSettings: this.rewardSettingsForWinston(rootFolderReward)
		};

		return { totalWinstonPrice, rewardSettings };
	}

	/** Calculate the cost of creating a drive and root folder together as a bundle */
	private async costOfCreateBundledDrive(
		arFSPrototypes: EstimateCreateDriveParams
	): Promise<EstimateCreateDriveResult> {
		const bundleReward = await this.winstonCostOfBundledPrototypes(Object.values(arFSPrototypes));
		const totalWinstonPrice = this.boostedReward(bundleReward);

		const rewardSettings: BundleRewardSettings = {
			bundleRewardSettings: this.rewardSettingsForWinston(bundleReward)
		};

		return { totalWinstonPrice, rewardSettings };
	}

	/** Calculate the cost uploading transaction data as a v2 transaction */
	private async costOfV2ObjectTx(objectTransactionData: ArFSObjectTransactionData): Promise<Winston> {
		const metaDataSize = objectTransactionData.sizeOf();
		return this.priceEstimator!.getBaseWinstonPriceForByteCount(metaDataSize);
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
	private bundledByteCountOfBundleToPack(totalDataItemByteCount: ByteCount, numberOfDataItems: number): ByteCount {
		// 32 byte array for representing the number of data items in the bundle
		const byteArraySize = 32;

		// Each data item gets a 64 byte header added to the bundle
		const headersSize = numberOfDataItems * 64;

		return new ByteCount(byteArraySize + +totalDataItemByteCount + headersSize);
	}

	/** Calculate the bundled size from an array of data item byte counts  */
	private bundledByteCountOfDataItems(dataItemByteCounts: ByteCount[]): ByteCount {
		// Get total byte length of combined binaries
		let totalDataItemsSize = 0;
		for (const dataItemByteCount of dataItemByteCounts) {
			totalDataItemsSize += +dataItemByteCount;
		}

		return this.bundledByteCountOfBundleToPack(new ByteCount(totalDataItemsSize), dataItemByteCounts.length);
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
		return this.priceEstimator!.getBaseWinstonPriceForByteCount(bundledSize);
	}
}
