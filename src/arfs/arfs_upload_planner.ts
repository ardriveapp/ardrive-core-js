import { serializeTags } from 'arbundles/src/parser';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ByteCount, EID, FeeMultiple, GQLTagInterface, UploadStats } from '../types';
import {
	ArFSUploadPlannerConstructorParams,
	BundlePlan,
	EstimateCreateDriveParams,
	CreateDrivePlan,
	PlanFileParams,
	PlanFolderParams,
	UploadPlan,
	V2TxPlan
} from '../types/upload_planner_types';
import { CommunityOracle } from '../community/community_oracle';
import { MAX_BUNDLE_SIZE, MAX_DATA_ITEM_LIMIT } from '../utils/constants';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { v4 } from 'uuid';
import { getFileEstimationInfo, getFolderEstimationInfo } from '../pricing/estimation_prototypes';
import { BundlePacker, LowestIndexBundlePacker } from '../utils/bundle_packer';

export interface UploadPlanner {
	planUploadAllEntities(uploadStats: UploadStats[]): Promise<UploadPlan>;
	planCreateDrive(arFSPrototypes: EstimateCreateDriveParams): CreateDrivePlan;
}

/** Utility class for planning an upload into an UploadPlan */
export class ArFSUploadPlanner implements UploadPlanner {
	private readonly shouldBundle: boolean;
	private readonly arFSTagSettings: ArFSTagSettings;
	private readonly bundlePacker: BundlePacker;

	protected readonly maxDataItemLimit: number;
	protected readonly maxBundleLimit: ByteCount;

	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly feeMultiple?: FeeMultiple;
	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly priceEstimator?: ARDataPriceEstimator;
	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly communityOracle?: CommunityOracle;

	constructor({
		shouldBundle = true,
		arFSTagSettings,
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
	}

	private v2TxsToUpload: V2TxPlan[] = [];

	/**
	 * Empties the bundlesToUpload from the bundlePacker and v2TxsToUpload
	 *
	 * @remarks To be used internally before every bulk upload plan
	 */
	private resetPlannedUploads(): void {
		this.v2TxsToUpload = [];
		this.bundlePacker.bundles = [];
	}

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
			this.arFSTagSettings.getFileDataTags(isPrivate, wrappedFile.contentType)
		);
		const metaDataByteCountAsDataItem = this.byteCountAsDataItem(
			fileMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: fileMetaDataPrototype.gqlTags })
		);
		const totalByteCountOfFileDataItems = new ByteCount(+fileDataItemByteCount + +metaDataByteCountAsDataItem);

		if (!this.shouldBundle || +totalByteCountOfFileDataItems > +this.maxBundleLimit) {
			// If the file data is too large it must be sent as a v2 tx
			const v2TxToUpload: V2TxPlan = { uploadStats: planFileParams, fileDataByteCount };

			if (isBulkUpload && this.shouldBundle) {
				// This metadata can be packed with another bundle since other entities will be uploaded

				// We will preserve the bundle index in this case because the metadata cannot be separated
				// from the file data until ArFSDAO has generated a TxID from signing the transaction
				v2TxToUpload.metaDataBundleIndex = this.bundlePacker.packIntoBundle({
					byteCountAsDataItem: metaDataByteCountAsDataItem,
					numberOfDataItems: 1
				});
			} else {
				// Otherwise we must send the metadata as a v2 tx because there will be nothing to bundle it with
				v2TxToUpload.metaDataByteCount = fileMetaDataPrototype.objectData.sizeOf();
			}
			// Add to the v2TxsToUpload
			this.v2TxsToUpload.push(v2TxToUpload);
		} else {
			// Otherwise we will always pack the metadata tx and data tx in the same bundle
			this.bundlePacker.packIntoBundle({
				byteCountAsDataItem: totalByteCountOfFileDataItems,
				numberOfDataItems: 2,
				uploadStats: planFileParams
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
			// We only create a new folder here if there is no existing folder on chain
			if (this.shouldBundle) {
				this.bundlePacker.packIntoBundle({
					uploadStats: planFolderParams,
					byteCountAsDataItem: folderByteCount,
					numberOfDataItems: 1
				});
			} else {
				this.v2TxsToUpload.push({
					uploadStats: planFolderParams,
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
			}
		}
		// For new folder creations, we will generate and preserve the folder ID early here to prevent
		// the parent to child folder relationship from being lost during the flattening of the folder tree
		wrappedFolder.existingId ??= EID(v4());

		const partialPlanParams = {
			...planFolderParams,
			destFolderId: wrappedFolder.existingId
		};

		// Plan each file within the folder
		for (const file of wrappedFolder.files) {
			await this.planFile({
				...partialPlanParams,
				wrappedEntity: file
			});
		}

		// Recurse into each folder, flattening each folder into plans
		for (const folder of wrappedFolder.folders) {
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
	public async planUploadAllEntities(uploadStats: UploadStats[]): Promise<UploadPlan> {
		this.resetPlannedUploads();

		if (uploadStats.length === 0) {
			return { bundlePlans: [], v2TxPlans: [] };
		}

		const isBulkUpload = (() => {
			if (uploadStats.length > 1) {
				return true;
			}

			const { wrappedEntity } = uploadStats[0];
			if (wrappedEntity.entityType === 'folder') {
				if (wrappedEntity.files.length > 0) {
					return true;
				}
				if (wrappedEntity.folders.length > 0) {
					return true;
				}
			}

			return false;
		})();

		for (const uploadStat of uploadStats) {
			const { wrappedEntity } = uploadStat;

			if (wrappedEntity.entityType === 'folder') {
				await this.planFolder({ ...uploadStat, wrappedEntity, isBulkUpload });
			} else {
				await this.planFile({ ...uploadStat, wrappedEntity, isBulkUpload });
			}
		}

		const bundlePlans: BundlePlan[] = [];
		for (const { uploadStats, totalDataItems, totalSize } of this.bundlePacker.bundles) {
			if (totalDataItems === 1) {
				// Edge case: Do not send up a bundle with a single folder data item
				const { wrappedEntity, driveKey } = uploadStats[0];

				const { folderMetaDataPrototype } = await getFolderEstimationInfo(
					wrappedEntity.destinationBaseName,
					driveKey !== undefined
				);

				// Unpack this bundle into the v2TxsToUpload
				this.v2TxsToUpload.push({
					uploadStats: uploadStats[0],
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
				continue;
			}

			const bundledByteCount = this.bundledByteCountOfBundleToPack(new ByteCount(totalSize), totalDataItems);

			bundlePlans.push({
				uploadStats: uploadStats,
				totalByteCount: bundledByteCount
			});
		}

		return { v2TxPlans: this.v2TxsToUpload, bundlePlans };
	}

	private planBundledCreateDrive({
		driveMetaDataPrototype,
		rootFolderMetaDataPrototype
	}: EstimateCreateDriveParams): CreateDrivePlan {
		const driveDataItemByteCount = this.byteCountAsDataItem(
			driveMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: driveMetaDataPrototype.gqlTags })
		);
		const rootFolderDataItemByteCount = this.byteCountAsDataItem(
			rootFolderMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: rootFolderMetaDataPrototype.gqlTags })
		);
		const totalDataItemByteCount = new ByteCount(+driveDataItemByteCount + +rootFolderDataItemByteCount);

		const totalBundledByteCount = this.bundledByteCountOfBundleToPack(totalDataItemByteCount, 2);

		return { totalBundledByteCount };
	}

	private planV2CreateDrive({
		driveMetaDataPrototype,
		rootFolderMetaDataPrototype
	}: EstimateCreateDriveParams): CreateDrivePlan {
		const driveByteCount = driveMetaDataPrototype.objectData.sizeOf();
		const rootFolderByteCount = rootFolderMetaDataPrototype.objectData.sizeOf();

		return { driveByteCount, rootFolderByteCount };
	}

	/** Plan the strategy and determine byteCounts of a create drive */
	public planCreateDrive(arFSPrototypes: EstimateCreateDriveParams): CreateDrivePlan {
		if (this.shouldBundle) {
			return this.planBundledCreateDrive(arFSPrototypes);
		}

		return this.planV2CreateDrive(arFSPrototypes);
	}

	/** Calculate the total size  of provided ByteCount and GQL Tags as a DataItem */
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

	/** Calculate the bundled size from the total dataItem byteCount and the number of dataItems */
	private bundledByteCountOfBundleToPack(totalDataItemByteCount: ByteCount, numberOfDataItems: number): ByteCount {
		// 32 byte array for representing the number of data items in the bundle
		const byteArraySize = 32;

		// Each data item gets a 64 byte header added to the bundle
		const headersSize = numberOfDataItems * 64;

		return new ByteCount(byteArraySize + +totalDataItemByteCount + headersSize);
	}
}
