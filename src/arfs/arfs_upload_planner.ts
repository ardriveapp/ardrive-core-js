import { ByteCount, EID, FeeMultiple, GQLTagInterface, UploadStats } from '../types';
import {
	ArFSUploadPlannerConstructorParams,
	BundlePlan,
	EstimateCreateDriveParams,
	CreateDrivePlan,
	PlanFileParams,
	PlanFolderParams,
	UploadPlan,
	BundlePackerFactory
} from '../types/upload_planner_types';
import { CommunityOracle } from '../community/community_oracle';
import { MAX_BUNDLE_SIZE, MAX_DATA_ITEM_LIMIT } from '../utils/constants';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { v4 } from 'uuid';
import { getFileEstimationInfo, getFolderEstimationInfo } from '../pricing/estimation_prototypes';
import { BundlePacker, LowestIndexBundlePacker } from '../utils/bundle_packer';
import { ArFSTagSettings } from './arfs_tag_settings';
import { ArFSTagAssembler } from './tags/tag_assembler';
import { serializeTags } from '@dha-team/arbundles';

export interface UploadPlanner {
	planUploadAllEntities(uploadStats: UploadStats[]): Promise<UploadPlan>;
	planCreateDrive(arFSPrototypes: EstimateCreateDriveParams): CreateDrivePlan;
	isTurboUpload(): boolean;
}

/** Utility class for planning an upload into an UploadPlan */
export class ArFSUploadPlanner implements UploadPlanner {
	private readonly shouldBundle: boolean;
	private readonly useTurbo: boolean;
	private readonly arFSTagSettings: ArFSTagSettings;
	private readonly bundlePacker: BundlePackerFactory;
	private readonly tagAssembler: ArFSTagAssembler;

	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly feeMultiple?: FeeMultiple;
	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly priceEstimator?: ARDataPriceEstimator;
	/** @deprecated No longer used in the Planner, moved to ArFSCostCalculator */
	protected readonly communityOracle?: CommunityOracle;

	constructor({
		shouldBundle = true,
		useTurbo = true,
		arFSTagSettings,
		bundlePacker = () => new LowestIndexBundlePacker(MAX_BUNDLE_SIZE, MAX_DATA_ITEM_LIMIT)
	}: ArFSUploadPlannerConstructorParams) {
		this.shouldBundle = shouldBundle;
		this.useTurbo = useTurbo;
		this.arFSTagSettings = arFSTagSettings;
		this.bundlePacker = bundlePacker;
		this.tagAssembler = new ArFSTagAssembler(arFSTagSettings);
	}

	/**
	 * Plans a file as a bundle to upload or v2 transaction to upload
	 *
	 * @remarks Uses the presence of a driveKey to determine privacy
	 * @remarks Uses the `shouldBundle` class setting to determine whether to bundle
	 * @remarks Files over the max bundle size limit will not be bundled, but their
	 * 	meta data will be bundled if there will be multiple entities uploaded
	 */
	private async planFile(uploadStats: PlanFileParams, bundlePacker: BundlePacker): Promise<void> {
		const { wrappedEntity: wrappedFile, isBulkUpload, driveKey } = uploadStats;
		const isPrivate = driveKey !== undefined;
		const { fileDataByteCount, fileMetaDataPrototype } = await getFileEstimationInfo(wrappedFile, isPrivate);

		const fileDataItemByteCount = byteCountAsDataItem(
			fileDataByteCount,
			this.arFSTagSettings.getFileDataItemTags(isPrivate, wrappedFile.contentType)
		);
		const metaDataByteCountAsDataItem = byteCountAsDataItem(
			fileMetaDataPrototype.objectData.sizeOf(),
			this.tagAssembler.assembleArFSMetaDataGqlTags({ arFSPrototype: fileMetaDataPrototype })
		);
		const totalByteCountOfFileDataItems = fileDataItemByteCount.plus(metaDataByteCountAsDataItem);

		if (
			!this.shouldBundle ||
			!bundlePacker.canPackDataItemsWithByteCounts([fileDataItemByteCount, metaDataByteCountAsDataItem])
		) {
			if (isBulkUpload && this.shouldBundle) {
				// This metadata can be packed with another bundle since other entities will be uploaded

				// We will preserve the bundle index in this case because the metadata cannot be separated
				// from the file data until ArFSDAO has generated a TxID from signing the transaction
				const metaDataBundleIndex = bundlePacker.packIntoBundle({
					byteCountAsDataItems: metaDataByteCountAsDataItem,
					numberOfDataItems: 1
				});

				bundlePacker.addV2FileDataOnlyPlan({ fileDataByteCount, metaDataBundleIndex, uploadStats });
			} else {
				// Otherwise we must send the metadata as a v2 tx because there will be nothing to bundle it with
				bundlePacker.addV2FileAndMetaDataPlan({
					fileDataByteCount,
					metaDataByteCount: fileMetaDataPrototype.objectData.sizeOf(),
					uploadStats
				});
			}
		} else {
			// Otherwise we will always pack the metadata tx and data tx in the same bundle
			bundlePacker.packIntoBundle({
				byteCountAsDataItems: totalByteCountOfFileDataItems,
				numberOfDataItems: 2,
				uploadStats
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
	private async planFolder(uploadStats: PlanFolderParams, bundlePacker: BundlePacker): Promise<void> {
		const { wrappedEntity: wrappedFolder, driveKey } = uploadStats;
		const isPrivate = driveKey !== undefined;

		const { folderMetaDataPrototype } = await getFolderEstimationInfo(wrappedFolder, isPrivate);

		if (!wrappedFolder.existingId) {
			// We will only create a new folder here if there is no existing folder on chain
			if (this.shouldBundle) {
				const folderByteCountAsDataItem = byteCountAsDataItem(
					folderMetaDataPrototype.objectData.sizeOf(),
					this.tagAssembler.assembleArFSMetaDataGqlTags({ arFSPrototype: folderMetaDataPrototype })
				);

				bundlePacker.packIntoBundle({
					uploadStats,
					byteCountAsDataItems: folderByteCountAsDataItem,
					numberOfDataItems: 1
				});
			} else {
				bundlePacker.addV2FolderMetaDataPlan({
					uploadStats,
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});
			}

			// Folder IDs must be established at this point so generate new ones for any folders
			// that don't appear to exist on chain yet. This is to prevent the parent to child
			// folder relationship from being lost during this flattening of the folder tree
			wrappedFolder.existingId = EID(v4());
		}

		const partialPlanParams = {
			...uploadStats,
			destFolderId: wrappedFolder.existingId
		};

		// Plan each file within the folder
		for (const file of wrappedFolder.files) {
			await this.planFile(
				{
					...partialPlanParams,
					wrappedEntity: file
				},
				bundlePacker
			);
		}

		// Recurse into each folder, flattening each folder into plans
		for (const folder of wrappedFolder.folders) {
			await this.planFolder(
				{
					...partialPlanParams,
					wrappedEntity: folder
				},
				bundlePacker
			);
		}
	}

	/**
	 * Determines whether to send data items to Turbo
	 */
	public isTurboUpload(): boolean {
		return this.useTurbo;
	}

	/**
	 *  Plans an upload using the `uploadAllEntities` ArDrive method
	 *  into bundles or v2 transactions and estimates the total winston cost
	 */
	public async planUploadAllEntities(uploadStats: UploadStats[]): Promise<UploadPlan> {
		if (uploadStats.length === 0) {
			return {
				bundlePlans: [],
				v2TxPlans: { fileAndMetaDataPlans: [], fileDataOnlyPlans: [], folderMetaDataPlans: [] }
			};
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

		for (const uploadStat of uploadStats) {
			const { wrappedEntity } = uploadStat;

			if (wrappedEntity.entityType === 'folder') {
				await this.planFolder({ ...uploadStat, wrappedEntity, isBulkUpload }, bundlePacker);
			} else {
				await this.planFile({ ...uploadStat, wrappedEntity, isBulkUpload }, bundlePacker);
			}
		}

		const bundlePlans: BundlePlan[] = [];
		for (const { uploadStats, totalDataItems, totalSize } of bundlePacker.bundles) {
			if (totalDataItems === 1) {
				// Edge case: Do not send up a bundle containing a single data item
				const { wrappedEntity, driveKey } = uploadStats[0];

				if (wrappedEntity.entityType === 'file') {
					throw new Error('Invalid bundle plan, files cannot be separated from their metadata!');
				}

				const { folderMetaDataPrototype } = await getFolderEstimationInfo(
					wrappedEntity,
					driveKey !== undefined
				);

				// Unpack this bundle into the v2TxsToUpload
				bundlePacker.addV2FolderMetaDataPlan({
					uploadStats: { ...uploadStats[0], wrappedEntity },
					metaDataByteCount: folderMetaDataPrototype.objectData.sizeOf()
				});

				continue;
			}

			const bundledByteCount = bundledByteCountOfBundleToPack(totalSize, totalDataItems);

			bundlePlans.push({
				uploadStats: uploadStats,
				totalByteCount: bundledByteCount
			});
		}

		return { v2TxPlans: bundlePacker.v2TxPlans, bundlePlans };
	}

	private planBundledCreateDrive({
		driveMetaDataPrototype,
		rootFolderMetaDataPrototype
	}: EstimateCreateDriveParams): CreateDrivePlan {
		const driveDataItemByteCount = byteCountAsDataItem(
			driveMetaDataPrototype.objectData.sizeOf(),
			this.tagAssembler.assembleArFSMetaDataGqlTags({ arFSPrototype: driveMetaDataPrototype })
		);
		const rootFolderDataItemByteCount = byteCountAsDataItem(
			rootFolderMetaDataPrototype.objectData.sizeOf(),
			this.tagAssembler.assembleArFSMetaDataGqlTags({ arFSPrototype: rootFolderMetaDataPrototype })
		);
		const totalDataItemByteCount = driveDataItemByteCount.plus(rootFolderDataItemByteCount);

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
