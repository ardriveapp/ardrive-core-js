import { serializeTags } from 'arbundles/src/parser';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ArFSObjectMetadataPrototype } from '../arfs/arfs_prototypes';
import { ArFSObjectTransactionData } from '../arfs/arfs_tx_data_types';
import {
	ByteCount,
	CommunityTipSettings,
	EID,
	FeeMultiple,
	GQLTagInterface,
	RewardSettings,
	UploadOrder,
	W,
	Winston
} from '../types';
import {
	ArFSUploadPlannerConstructorParams,
	BundlePlan,
	BundleRewardSettings,
	CreateDriveV2TxRewardSettings,
	EstimateCreateDriveParams,
	EstimateCreateDriveResult,
	EstimateUploadFileParams,
	EstimateUploadFileResult,
	PackFileParams,
	PackFolderParams,
	UploadFileV2TxRewardSettings,
	UploadPlan,
	V2TxPlan
} from '../types/upload_planner_types';
import { CommunityOracle } from '../community/community_oracle';
import {
	fakePrivateCipherIVTag,
	MAX_BUNDLE_SIZE,
	privateCipherTag,
	privateOctetContentTypeTag,
	publicJsonContentTypeTag
} from '../utils/constants';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { isFolder } from './arfs_file_wrapper';
import { v4 } from 'uuid';
import { getFileEstimationInfo, getFolderEstimationInfo } from '../pricing/estimation_prototypes';
import { BundlePacker, LowestIndexBundlePacker } from '../utils/bundle_packer';

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

	/** Constructs reward settings with the feeMultiple from the upload planner */
	private rewardSettingsForWinston(reward: Winston): RewardSettings {
		return { reward, feeMultiple: this.feeMultiple };
	}
	/** Returns a reward boosted by the feeMultiple from the upload planner */
	private boostedReward(reward: Winston): Winston {
		return this.feeMultiple.boostedWinstonReward(reward);
	}

	private bundlePacker: BundlePacker = new LowestIndexBundlePacker();
	private v2TxsToUpload: V2TxPlan[] = [];

	private async packFile(packFileParams: PackFileParams): Promise<void> {
		const { wrappedEntity: wrappedFile, isBulkUpload, driveKey } = packFileParams;
		const { fileByteCount, fileMetaDataPrototype } = await getFileEstimationInfo(wrappedFile, driveKey);

		const fileDataItemByteCount = this.byteCountAsDataItem(
			fileByteCount,
			this.arFSTagSettings.baseAppTagsIncluding({
				tags: driveKey
					? [privateOctetContentTypeTag, privateCipherTag, fakePrivateCipherIVTag]
					: [publicJsonContentTypeTag]
			})
		);
		const metaDataByteCountAsDataItem = this.byteCountAsDataItem(
			fileMetaDataPrototype.objectData.sizeOf(),
			this.arFSTagSettings.baseArFSTagsIncluding({ tags: fileMetaDataPrototype.gqlTags })
		);

		const totalByteCountOfFileDataItems = new ByteCount(+fileDataItemByteCount + +metaDataByteCountAsDataItem);

		let rewardSettings;
		if (+totalByteCountOfFileDataItems > MAX_BUNDLE_SIZE) {
			rewardSettings = {
				fileDataRewardSettings: {
					reward: await this.priceEstimator.getBaseWinstonPriceForByteCount(fileByteCount),
					feeMultiple: this.feeMultiple
				}
			};

			// We must preserve this bundle index because the metadata cannot be
			// constructed until ArFSDAO has generated a TxID for the File Data
			let metaDataBundleIndex;
			if (isBulkUpload) {
				// This metadata can be packed with another bundle since other upload orders exist
				metaDataBundleIndex = this.bundlePacker.packIntoBundle({
					byteCountAsDataItem: metaDataByteCountAsDataItem,
					numberOfDataItems: 1
				});
			} else {
				// Otherwise we must send the metadata as a v2 tx because there will be nothing to bundle it with
				// So we also determine and add the reward settings for a v2 meta data transaction here
				const metaDataReward = await this.costOfV2ObjectTx(fileMetaDataPrototype.objectData);
				rewardSettings = {
					...rewardSettings,
					metaDataRewardSettings: this.rewardSettingsForWinston(metaDataReward)
				};
			}
			// Add to the v2TxsToUpload
			this.v2TxsToUpload.push({ uploadOrder: packFileParams, rewardSettings, metaDataBundleIndex });
		} else {
			// Otherwise we will always pack the metadata tx and data tx in the same bundle
			this.bundlePacker.packIntoBundle({
				byteCountAsDataItem: totalByteCountOfFileDataItems,
				numberOfDataItems: 2,
				uploadOrder: packFileParams
			});
		}
	}

	/** Flattens a recursive folder and packs them into bundles */
	private async packFolder(packFolderParams: PackFolderParams): Promise<void> {
		const { wrappedEntity: wrappedFolder, driveKey } = packFolderParams;
		const { folderByteCount } = await getFolderEstimationInfo(wrappedFolder.destinationBaseName, driveKey);

		// We won't create a new folder one already exists
		if (!wrappedFolder.existingId) {
			this.bundlePacker.packIntoBundle({
				uploadOrder: packFolderParams,
				byteCountAsDataItem: folderByteCount,
				numberOfDataItems: 1
			});
		}
		// For new folders, we will generate and preserve the folder ID
		// early to prevent parent folder id information from being lost
		wrappedFolder.existingId ??= EID(v4());

		const partialPackParams = {
			...packFolderParams,
			destFolderId: wrappedFolder.existingId
		};

		for (const file of wrappedFolder.files) {
			await this.packFile({
				...partialPackParams,
				wrappedEntity: file
			});
		}

		// Recurse into each folder, flattening them into bundles
		for (const folder of wrappedFolder.folders) {
			await this.packFolder({
				...partialPackParams,
				wrappedEntity: folder
			});
		}
	}

	/** Estimate the cost of a upload all entities */
	public async estimateUploadEntities(
		uploadOrders: UploadOrder[]
	): Promise<{ uploadPlan: UploadPlan; totalWinstonPrice: Winston }> {
		const isBulkUpload = uploadOrders.length > 1;

		for (const uploadOrder of uploadOrders) {
			const { wrappedEntity } = uploadOrder;

			if (isFolder(wrappedEntity)) {
				await this.packFolder({ ...uploadOrder, wrappedEntity, isBulkUpload });
			} else {
				await this.packFile({ ...uploadOrder, wrappedEntity, isBulkUpload });
			}
		}

		let totalWinstonPrice = W(0);
		const bundlePlans: BundlePlan[] = [];
		for (const { uploadOrders, totalDataItems, totalSize } of this.bundlePacker.bundles) {
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
				const metaDataReward = await this.costOfV2ObjectTx(folderMetaDataPrototype.objectData);

				// Unpack this bundle into the v2TxsToUpload
				this.v2TxsToUpload.push({
					uploadOrder: uploadOrders[0],
					rewardSettings: {
						metaDataRewardSettings: this.rewardSettingsForWinston(metaDataReward)
					}
				});
				continue;
			}

			const bundledByteCount = this.bundledByteCountOfBundleToPack(new ByteCount(totalSize), totalDataItems);
			const winstonPriceOfBundle = await this.priceEstimator.getBaseWinstonPriceForByteCount(bundledByteCount);

			totalWinstonPrice = totalWinstonPrice.plus(this.boostedReward(winstonPriceOfBundle));
			let communityTipSettings: CommunityTipSettings | undefined = undefined;

			const hasFileData = uploadOrders.find((u) => !isFolder(u.wrappedEntity));
			if (hasFileData) {
				// For now, we only add a community tip if there are files present within the bundle
				const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(winstonPriceOfBundle);
				const communityTipTarget = await this.communityOracle.selectTokenHolder();

				totalWinstonPrice = totalWinstonPrice.plus(communityWinstonTip);
				communityTipSettings = { communityTipTarget, communityWinstonTip };
			}

			bundlePlans.push({
				uploadOrders: uploadOrders,
				bundleRewardSettings: this.rewardSettingsForWinston(winstonPriceOfBundle),
				communityTipSettings,
				metaDataDataItems: []
			});
		}

		const v2TxPlans: V2TxPlan[] = [];
		for (const v2Tx of this.v2TxsToUpload) {
			let communityTipSettings: CommunityTipSettings | undefined = undefined;

			if (v2Tx.rewardSettings.dataTxRewardSettings?.reward) {
				const winstonPriceOfDataTx = v2Tx.rewardSettings.dataTxRewardSettings.reward;
				const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(winstonPriceOfDataTx);

				totalWinstonPrice = totalWinstonPrice
					.plus(this.boostedReward(winstonPriceOfDataTx))
					.plus(communityWinstonTip);

				const communityTipTarget = await this.communityOracle.selectTokenHolder();
				communityTipSettings = { communityTipTarget, communityWinstonTip };
			}

			if (v2Tx.rewardSettings.metaDataRewardSettings?.reward) {
				const winstonPriceOfMetaDataTx = v2Tx.rewardSettings.metaDataRewardSettings.reward;

				totalWinstonPrice = totalWinstonPrice.plus(this.boostedReward(winstonPriceOfMetaDataTx));
			}

			v2TxPlans.push({
				...v2Tx,
				communityTipSettings
			});
		}

		return { uploadPlan: { v2TxPlans, bundlePlans }, totalWinstonPrice };
	}

	/** Estimate the cost of uploading a single file*/
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
			dataTxRewardSettings: this.rewardSettingsForWinston(fileDataReward),
			metaDataRewardSettings: this.rewardSettingsForWinston(metaDataReward)
		};

		const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(fileDataReward);

		const totalWinstonPrice = this.boostedReward(fileDataReward)
			.plus(this.boostedReward(metaDataReward))
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
			bundleRewardSettings: this.rewardSettingsForWinston(bundleReward)
		};

		const communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(
			await this.priceEstimator.getBaseWinstonPriceForByteCount(fileDataItemByteCount)
		);

		const totalWinstonPrice = this.boostedReward(bundleReward).plus(communityWinstonTip);

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
		return this.priceEstimator.getBaseWinstonPriceForByteCount(bundledSize);
	}
}
