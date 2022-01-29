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
	V2TxPlan,
	BundlePackerFactory
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
	private readonly bundlePacker: BundlePackerFactory;

	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly feeMultiple?: FeeMultiple;
	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly priceEstimator?: ARDataPriceEstimator;
	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly communityOracle?: CommunityOracle;

	constructor({
		shouldBundle = true,
		arFSTagSettings,
		bundlePacker = () => new LowestIndexBundlePacker(MAX_BUNDLE_SIZE, MAX_DATA_ITEM_LIMIT)
	}: ArFSUploadPlannerConstructorParams) {
		this.shouldBundle = shouldBundle;
		this.arFSTagSettings = arFSTagSettings;
		this.bundlePacker = bundlePacker;
	}

	/**
	 * Plans a file as a bundle to upload or v2 transaction to upload
	 *
	 * @remarks Uses the presence of a driveKey to determine privacy
	 * @remarks Uses the `shouldBundle` class setting to determine whether to bundle
	 * @remarks Files over the max bundle size limit will not be bundled, but their
	 * 	meta data will be bundled if there will be multiple entities uploaded
	 */
	private async planFile(planFileParams: PlanFileParams, bundlePacker: BundlePacker): Promise<V2TxPlan | void> {
		const { wrappedEntity: wrappedFile, isBulkUpload, driveKey } = planFileParams;
		const isPrivate = driveKey !== undefined;
		const { fileDataByteCount, fileMetaDataPrototype } = await getFileEstimationInfo(wrappedFile, isPrivate);

		const fileDataItemByteCount = byteCountAsDataItem(
			fileDataByteCount,
			this.arFSTagSettings.getFileDataTags(isPrivate, wrappedFile.contentType)
		);
		const metaDataByteCountAsDataItem = byteCountAsDataItem(
			fileMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: fileMetaDataPrototype.gqlTags })
		);
		const totalByteCountOfFileDataItems = new ByteCount(+fileDataItemByteCount + +metaDataByteCountAsDataItem);

		if (
			!this.shouldBundle ||
			!bundlePacker.canPackDataItemsWithByteCounts([fileDataItemByteCount, metaDataByteCountAsDataItem])
		) {
			// If the file data is too large it must be sent as a v2 tx
			const v2TxToUpload: V2TxPlan = { uploadStats: planFileParams, fileDataByteCount };

			if (isBulkUpload && this.shouldBundle) {
				// This metadata can be packed with another bundle since other entities will be uploaded

				// We will preserve the bundle index in this case because the metadata cannot be separated
				// from the file data until ArFSDAO has generated a TxID from signing the transaction
				v2TxToUpload.metaDataBundleIndex = bundlePacker.packIntoBundle({
					byteCountAsDataItem: metaDataByteCountAsDataItem,
					numberOfDataItems: 1
				});
			} else {
				// Otherwise we must send the metadata as a v2 tx because there will be nothing to bundle it with
				v2TxToUpload.metaDataByteCount = fileMetaDataPrototype.objectData.sizeOf();
			}
			// Add to the v2TxsToUpload
			return v2TxToUpload;
		} else {
			// Otherwise we will always pack the metadata tx and data tx in the same bundle
			bundlePacker.packIntoBundle({
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
	private async planFolder(planFolderParams: PlanFolderParams, bundlePacker: BundlePacker): Promise<V2TxPlan[]> {
		const { wrappedEntity: wrappedFolder, driveKey } = planFolderParams;
		const isPrivate = driveKey !== undefined;

		const { folderMetaDataPrototype } = await getFolderEstimationInfo(wrappedFolder.destinationBaseName, isPrivate);
		const v2TxsToUpload: V2TxPlan[] = [];

		if (!wrappedFolder.existingId) {
			// We will only create a new folder here if there is no existing folder on chain
			if (this.shouldBundle) {
				const folderByteCountAsDataItem = byteCountAsDataItem(
					folderMetaDataPrototype.objectData.sizeOf(),
					this.arFSTagSettings.baseArFSTagsIncluding({ tags: folderMetaDataPrototype.gqlTags })
				);

				bundlePacker.packIntoBundle({
					uploadStats: planFolderParams,
					byteCountAsDataItem: folderByteCountAsDataItem,
					numberOfDataItems: 1
				});
			} else {
				v2TxsToUpload.push({
					uploadStats: planFolderParams,
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
			}

			// Folder IDs must be established at this point so generate new ones for any folders
			// that don't appear to exist on chain yet. This is to prevent the parent to child
			// folder relationship from being lost during this flattening of the folder tree
			wrappedFolder.existingId = EID(v4());
		}

		const partialPlanParams = {
			...planFolderParams,
			destFolderId: wrappedFolder.existingId
		};

		// Plan each file within the folder
		for (const file of wrappedFolder.files) {
			const v2TxFromFile = await this.planFile(
				{
					...partialPlanParams,
					wrappedEntity: file
				},
				bundlePacker
			);
			if (v2TxFromFile) {
				v2TxsToUpload.push(v2TxFromFile);
			}
		}

		// Recurse into each folder, flattening each folder into plans
		for (const folder of wrappedFolder.folders) {
			const v2TxsFromFolder = await this.planFolder(
				{
					...partialPlanParams,
					wrappedEntity: folder
				},
				bundlePacker
			);
			v2TxsToUpload.push(...v2TxsFromFolder);
		}

		return v2TxsToUpload;
	}

	/**
	 *  Plans an upload using the `uploadAllEntities` ArDrive method
	 *  into bundles or v2 transactions and estimates the total winston cost
	 */
	public async planUploadAllEntities(uploadStats: UploadStats[]): Promise<UploadPlan> {
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

		const bundlePacker = this.bundlePacker();
		const v2TxsToUpload: V2TxPlan[] = [];

		for (const uploadStat of uploadStats) {
			const { wrappedEntity } = uploadStat;

			if (wrappedEntity.entityType === 'folder') {
				const v2TxsFromFolder = await this.planFolder(
					{ ...uploadStat, wrappedEntity, isBulkUpload },
					bundlePacker
				);
				v2TxsToUpload.push(...v2TxsFromFolder);
			} else {
				const v2TxFromFile = await this.planFile({ ...uploadStat, wrappedEntity, isBulkUpload }, bundlePacker);
				if (v2TxFromFile) {
					v2TxsToUpload.push(v2TxFromFile);
				}
			}
		}

		const bundlePlans: BundlePlan[] = [];
		for (const { uploadStats, totalDataItems, totalSize } of bundlePacker.bundles) {
			if (totalDataItems === 1) {
				// Edge case: Do not send up a bundle with a data item
				const { wrappedEntity, driveKey } = uploadStats[0];

				// We know this will be a folder in this case because file meta data will
				// not be separated from the file data, and over-sized file meta data will not
				// be packed into a bundle unless it already is determined to be a bulk upload
				const { folderMetaDataPrototype } = await getFolderEstimationInfo(
					wrappedEntity.destinationBaseName,
					driveKey !== undefined
				);

				// Unpack this bundle into the v2TxsToUpload
				v2TxsToUpload.push({
					uploadStats: uploadStats[0],
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
				continue;
			}

			const bundledByteCount = bundledByteCountOfBundleToPack(new ByteCount(totalSize), totalDataItems);

			bundlePlans.push({
				uploadStats: uploadStats,
				totalByteCount: bundledByteCount
			});
		}

		return { v2TxPlans: v2TxsToUpload, bundlePlans };
	}

	private planBundledCreateDrive({
		driveMetaDataPrototype,
		rootFolderMetaDataPrototype
	}: EstimateCreateDriveParams): CreateDrivePlan {
		const driveDataItemByteCount = byteCountAsDataItem(
			driveMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: driveMetaDataPrototype.gqlTags })
		);
		const rootFolderDataItemByteCount = byteCountAsDataItem(
			rootFolderMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: rootFolderMetaDataPrototype.gqlTags })
		);
		const totalDataItemByteCount = new ByteCount(+driveDataItemByteCount + +rootFolderDataItemByteCount);

		const totalBundledByteCount = bundledByteCountOfBundleToPack(totalDataItemByteCount, 2);

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
}

/** Calculate the total size  of provided ByteCount and GQL Tags as a DataItem */
function byteCountAsDataItem(dataSize: ByteCount, gqlTags: GQLTagInterface[]): ByteCount {
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
		arweaveSignerLength + ownerLength + signatureTypeLength + targetLength + anchorLength + tagsLength + dataLength;

	return new ByteCount(totalByteLength);
}

/** Calculate the bundled size from the total dataItem byteCount and the number of dataItems */
function bundledByteCountOfBundleToPack(totalDataItemByteCount: ByteCount, numberOfDataItems: number): ByteCount {
	// 32 byte array for representing the number of data items in the bundle
	const byteArraySize = 32;

	// Each data item gets a 64 byte header added to the bundle
	const headersSize = numberOfDataItems * 64;

	return new ByteCount(byteArraySize + +totalDataItemByteCount + headersSize);
}
