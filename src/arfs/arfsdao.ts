import Arweave from 'arweave';
import { v4 as uuidv4, v4 } from 'uuid';
import { JWKInterface } from 'arweave/node/lib/wallet';
import Transaction from 'arweave/node/lib/transaction';
import { ArFSFileOrFolderBuilder } from './arfs_builders/arfs_builders';
import { ArFSPrivateDriveBuilder, SafeArFSDriveBuilder } from './arfs_builders/arfs_drive_builders';
import { ArFSPrivateFileBuilder, ArFSPublicFileBuilder } from './arfs_builders/arfs_file_builders';
import { ArFSPrivateFolderBuilder, ArFSPublicFolderBuilder } from './arfs_builders/arfs_folder_builders';
import {
	ArFSFileOrFolderEntity,
	ArFSPrivateDrive,
	ArFSPublicFile,
	ArFSPrivateFile,
	ArFSPublicFolder,
	ArFSPrivateFolder,
	ArFSPrivateFileWithPaths,
	ArFSPrivateFolderWithPaths,
	privateEntityWithPathsKeylessFactory
} from './arfs_entities';
import {
	ArFSCreateFolderResult,
	ArFSCreateDriveResult,
	ArFSCreatePrivateDriveResult,
	ArFSMovePublicFileResult,
	ArFSMovePrivateFileResult,
	ArFSMovePublicFolderResult,
	ArFSMovePrivateFolderResult,
	ArFSCreateBundledDriveResult,
	ArFSCreatePrivateBundledDriveResult,
	ArFSCreatePublicDriveResult,
	ArFSCreatePublicBundledDriveResult,
	ArFSUploadEntitiesResult,
	FileResult,
	ArFSRenamePrivateFileResult,
	ArFSRenamePublicFileResult,
	ArFSRenamePublicFolderResult,
	ArFSRenamePrivateFolderResult,
	ArFSRenamePublicDriveResult,
	ArFSRenamePrivateDriveResult,
	ArFSV2PublicRetryResult,
	NewFileMetaDataCreated,
	FolderResult,
	ArFSCreateDriveToTurboResult
} from './arfs_entity_result_factory';
import {
	ArFSFileToUpload,
	ArFSFolderToDownload,
	ArFSManifestToUpload,
	ArFSPrivateFileToDownload
} from './arfs_file_wrapper';
import { getPrepFileParams, getPrepFolderFactoryParams } from './arfs_meta_data_factory';
import {
	ArFSPublicFolderMetaDataPrototype,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPublicFileMetaDataPrototype,
	ArFSPrivateFileMetaDataPrototype,
	ArFSDriveMetaDataPrototype,
	ArFSPublicDriveMetaDataPrototype,
	ArFSFileDataPrototype,
	ArFSEntityMetaDataPrototype
} from './tx/arfs_prototypes';

import { FolderHierarchy } from './folder_hierarchy';

import {
	ArFSAnonymousCache,
	ArFSDAOAnonymous,
	ArFSPublicDriveCacheKey,
	ArFSPublicFolderCacheKey,
	defaultArFSAnonymousCache
} from './arfsdao_anonymous';
import { deriveDriveKey, deriveFileKey, driveDecrypt } from '../utils/crypto';
import {
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION,
	authTagLength,
	defaultMaxConcurrentChunks,
	ENCRYPTED_DATA_PLACEHOLDER,
	turboProdUrl,
	gqlTagNameRecord
} from '../utils/constants';
import { PrivateKeyData } from './private_key_data';
import {
	EID,
	ArweaveAddress,
	TxID,
	W,
	GQLEdgeInterface,
	GQLNodeInterface,
	DriveID,
	DriveKey,
	FolderID,
	RewardSettings,
	FileID,
	FileKey,
	TransactionID,
	CipherIV,
	ADDR,
	UploadStats
} from '../types';
import { latestRevisionFilter, fileFilter, folderFilter } from '../utils/filter_methods';
import {
	entityToNameMap,
	NameConflictInfo,
	fileConflictInfoMap,
	folderToNameAndIdMap
} from '../utils/mapper_functions';
import { buildQuery, ASCENDING_ORDER, DESCENDING_ORDER } from '../utils/query';
import { Wallet } from '../wallet';
import { JWKWallet } from '../jwk_wallet';
import { ArFSEntityCache } from './arfs_entity_cache';

import { DataItem, bundleAndSignData, createData } from 'arbundles';
import {
	ArFSPrepareFolderParams,
	ArFSPrepareFolderResult,
	ArFSPrivateCreateFolderParams,
	ArFSPublicCreateFolderParams,
	ArFSPrepareDriveParams,
	ArFSPrepareDriveResult,
	ArFSCreatePublicDriveParams,
	ArFSCreatePrivateDriveParams,
	ArFSMoveParams,
	ArFSUploadPublicFileParams,
	ArFSUploadPrivateFileParams,
	ArFSAllPrivateFoldersOfDriveParams,
	ArFSGetPrivateChildFolderIdsParams,
	ArFSGetPublicChildFolderIdsParams,
	ArFSListPrivateFolderParams,
	ArFSTxResult,
	ArFSRenamePublicFileParams,
	ArFSRenamePrivateDriveParams,
	ArFSRenamePrivateFolderParams,
	ArFSRenamePublicDriveParams,
	ArFSRenamePublicFolderParams,
	ArFSRenamePrivateFileParams,
	ArFSPrepareFileParams,
	ArFSPrepareFileResult,
	CommunityTipSettings,
	PartialPrepareDriveParams,
	PartialPrepareFileParams,
	ArFSDownloadPrivateFolderParams,
	SeparatedFolderHierarchy,
	ArFSPrepareDataItemsParams,
	ArFSPrepareObjectBundleParams,
	ArFSPrepareObjectTransactionParams,
	ArFSRetryPublicFileUploadParams,
	ArFSFolderPrototypeFactory
} from '../types/arfsdao_types';
import {
	CalculatedUploadPlan,
	CreateDriveRewardSettings,
	CreateDriveV2TxRewardSettings,
	emptyV2TxPlans,
	isBundleRewardSetting
} from '../types/upload_planner_types';
import axios, { AxiosRequestConfig } from 'axios';
import { Readable } from 'stream';
import { join as joinPath } from 'path';
import { StreamDecrypt } from '../utils/stream_decrypt';
import { CipherIVQueryResult } from '../types/cipher_iv_query_result';
import { alphabeticalOrder } from '../utils/sort_functions';
import { gatewayUrlForArweave } from '../utils/common';
import { MultiChunkTxUploader, MultiChunkTxUploaderConstructorParams } from './multi_chunk_tx_uploader';
import { GatewayAPI } from '../utils/gateway_api';
import { ArFSTagSettings } from './arfs_tag_settings';
import { TxPreparer } from './tx/tx_preparer';
import {
	ArFSPublicFolderTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPrivateDriveTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPrivateFileMetadataTransactionData
} from './tx/arfs_tx_data_types';
import { ArFSTagAssembler } from './tags/tag_assembler';
import { assertDataRootsMatch, rePrepareV2Tx } from '../utils/arfsdao_utils';
import { ArFSDataToUpload, ArFSFolderToUpload, DrivePrivacy } from '../exports';
import { Turbo, TurboCachesResponse } from './turbo';
import { ArweaveSigner } from 'arbundles/src/signing';

/** Utility class for holding the driveId and driveKey of a new drive */
export class PrivateDriveKeyData {
	private constructor(readonly driveId: DriveID, readonly driveKey: DriveKey) {}

	static async from(drivePassword: string, privateKey: JWKInterface): Promise<PrivateDriveKeyData> {
		const driveId = uuidv4();
		const driveKey = await deriveDriveKey(drivePassword, driveId, JSON.stringify(privateKey));
		return new PrivateDriveKeyData(EID(driveId), driveKey);
	}
}

export interface ArFSPrivateDriveCacheKey extends ArFSPublicDriveCacheKey {
	driveKey: DriveKey;
}

export interface ArFSPrivateFolderCacheKey {
	folderId: FolderID;
	owner: ArweaveAddress;
	driveKey: DriveKey;
}

export interface ArFSPrivateFileCacheKey {
	fileId: FileID;
	owner: ArweaveAddress;
	fileKey: FileKey;
}

export interface ArFSCache extends ArFSAnonymousCache {
	privateDriveCache: ArFSEntityCache<ArFSPrivateDriveCacheKey, ArFSPrivateDrive>;
	privateFolderCache: ArFSEntityCache<ArFSPrivateFolderCacheKey, ArFSPrivateFolder>;
	privateFileCache: ArFSEntityCache<ArFSPrivateFileCacheKey, ArFSPrivateFile>;
	publicConflictCache: ArFSEntityCache<ArFSPublicFolderCacheKey, NameConflictInfo>;
	privateConflictCache: ArFSEntityCache<ArFSPrivateFolderCacheKey, NameConflictInfo>;
}

export class ArFSDAO extends ArFSDAOAnonymous {
	// TODO: Can we abstract Arweave type(s)?
	constructor(
		private readonly wallet: Wallet,
		arweave: Arweave,
		private readonly dryRun = false,
		/** @deprecated App Name should be provided with ArFSTagSettings  */
		protected appName = DEFAULT_APP_NAME,
		/** @deprecated App Version should be provided with ArFSTagSettings  */
		protected appVersion = DEFAULT_APP_VERSION,
		protected readonly arFSTagSettings: ArFSTagSettings = new ArFSTagSettings({ appName, appVersion }),
		protected caches: ArFSCache = {
			...defaultArFSAnonymousCache,
			privateDriveCache: new ArFSEntityCache<ArFSPrivateDriveCacheKey, ArFSPrivateDrive>(10),
			privateFolderCache: new ArFSEntityCache<ArFSPrivateFolderCacheKey, ArFSPrivateFolder>(10),
			privateFileCache: new ArFSEntityCache<ArFSPrivateFileCacheKey, ArFSPrivateFile>(10),
			publicConflictCache: new ArFSEntityCache<ArFSPublicFolderCacheKey, NameConflictInfo>(10),
			privateConflictCache: new ArFSEntityCache<ArFSPrivateFolderCacheKey, NameConflictInfo>(10)
		},
		protected gatewayApi = new GatewayAPI({ gatewayUrl: gatewayUrlForArweave(arweave) }),
		protected txPreparer = new TxPreparer({
			arweave: arweave,
			wallet: wallet as JWKWallet,
			arFSTagAssembler: new ArFSTagAssembler(arFSTagSettings)
		}),
		protected turbo = new Turbo({ turboUrl: turboProdUrl, isDryRun: dryRun })
	) {
		super(arweave, undefined, undefined, caches);
	}

	private shouldProgressLog = process.env['ARDRIVE_PROGRESS_LOG'] === '1';

	/** Prepare an ArFS folder entity for upload */
	private async prepareFolder<T>({
		folderPrototypeFactory,
		prepareArFSObject
	}: ArFSPrepareFolderParams<T>): Promise<ArFSPrepareFolderResult<T>> {
		// Generate a new folder ID
		const folderId = EID(uuidv4());

		// Create a folder metadata transaction
		const folderMetadata = folderPrototypeFactory(folderId);

		// Prepare the ArFS folder transaction or dataItem
		const arFSObjects = [await prepareArFSObject(folderMetadata)];

		return { arFSObjects, folderId: folderMetadata.folderId };
	}

	/** Create a single folder as a V2 transaction */
	private async createAndUploadFolderAsV2Tx(
		folderPrototypeFactory: ArFSFolderPrototypeFactory,
		rewardSettings: RewardSettings
	): Promise<ArFSCreateFolderResult> {
		const { arFSObjects, folderId } = await this.prepareFolder({
			folderPrototypeFactory,
			prepareArFSObject: (folderMetaData) =>
				this.txPreparer.prepareMetaDataTx({ objectMetaData: folderMetaData, rewardSettings })
		});
		const folderTx = arFSObjects[0];

		await this.sendTransactionsAsChunks([folderTx]);

		return { metaDataTxId: TxID(folderTx.id), metaDataTxReward: W(folderTx.reward), folderId };
	}

	/** Create a single private folder */
	public async createPrivateFolder({
		driveId,
		rewardSettings,
		parentFolderId,
		folderData
	}: ArFSPrivateCreateFolderParams): Promise<ArFSCreateFolderResult> {
		const folderId = EID(v4());
		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFolderMetaDataPrototype(driveId, folderId, folderData, parentFolderId),
			rewardSettings
		);

		return {
			folderId,
			metaDataTxId: id,
			metaDataTxReward: rewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	/** Create a single public folder */
	public async createPublicFolder({
		driveId,
		rewardSettings,
		parentFolderId,
		folderData
	}: ArFSPublicCreateFolderParams): Promise<ArFSCreateFolderResult> {
		const folderId = EID(v4());
		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFolderMetaDataPrototype(folderData, driveId, folderId, parentFolderId),
			rewardSettings
		);

		return {
			folderId,
			metaDataTxId: id,
			metaDataTxReward: rewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	/** Prepare an ArFS drive entity for upload */
	private async prepareDrive<T>({
		drivePrototypeFactory,
		prepareArFSObject,
		rootFolderPrototypeFactory,
		generateDriveIdFn
	}: ArFSPrepareDriveParams<T>): Promise<ArFSPrepareDriveResult<T>> {
		// Generate a new drive ID for the new drive
		const driveId = generateDriveIdFn();

		// Create ArFS root folder object
		const { arFSObjects, folderId: rootFolderId } = await this.prepareFolder({
			folderPrototypeFactory: (folderId) => rootFolderPrototypeFactory(folderId, driveId),
			prepareArFSObject
		});
		const rootFolderArFSObject = arFSObjects[0];

		// Create ArFS drive object
		const driveMetaData = await drivePrototypeFactory(driveId, rootFolderId);
		const driveArFSObject = await prepareArFSObject(driveMetaData);

		return { arFSObjects: [rootFolderArFSObject, driveArFSObject], driveId, rootFolderId };
	}

	/** Create drive and root folder together as bundled transaction */
	private async createBundledDrive(
		sharedPrepDriveParams: PartialPrepareDriveParams,
		rewardSettings: RewardSettings
	): Promise<ArFSTxResult<ArFSCreateBundledDriveResult>> {
		const { arFSObjects, driveId, rootFolderId } = await this.prepareDrive({
			...sharedPrepDriveParams,
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataDataItem({
					objectMetaData
				})
		});

		// Pack data items into a bundle
		const bundledTx = await this.txPreparer.prepareBundleTx({ dataItems: arFSObjects, rewardSettings });

		const [rootFolderDataItem, driveDataItem] = arFSObjects;
		return {
			transactions: [bundledTx],
			result: {
				bundleTxId: TxID(bundledTx.id),
				bundleTxReward: W(bundledTx.reward),
				driveId,
				metaDataTxId: TxID(driveDataItem.id),
				rootFolderId,
				rootFolderTxId: TxID(rootFolderDataItem.id)
			}
		};
	}

	/** Create drive and root folder as separate V2 transactions */
	private async createV2TxDrive(
		sharedPrepDriveParams: PartialPrepareDriveParams,
		{ driveRewardSettings, rootFolderRewardSettings }: CreateDriveV2TxRewardSettings
	): Promise<ArFSTxResult<ArFSCreateDriveResult>> {
		const { arFSObjects, driveId, rootFolderId } = await this.prepareDrive({
			...sharedPrepDriveParams,
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataTx({
					objectMetaData,
					rewardSettings:
						// Type-check the metadata to conditionally pass correct reward setting
						objectMetaData instanceof ArFSDriveMetaDataPrototype
							? driveRewardSettings
							: rootFolderRewardSettings
				})
		});

		const [rootFolderTx, driveTx] = arFSObjects;
		return {
			transactions: arFSObjects,
			result: {
				metaDataTxId: TxID(driveTx.id),
				metaDataTxReward: W(driveTx.reward),
				driveId,
				rootFolderId,
				rootFolderTxId: TxID(rootFolderTx.id),
				rootFolderTxReward: W(rootFolderTx.reward)
			}
		};
	}

	private async makeBdi(dataItems: DataItem[]): Promise<DataItem> {
		const signer = new ArweaveSigner((this.wallet as JWKWallet).getPrivateKey());
		const bundle = await bundleAndSignData(dataItems, signer);
		const bdi = createData(bundle.getRaw(), signer, {
			// baseBundleTags includes:  Bundle Format/Version, App Name/Version
			tags: this.arFSTagSettings.baseBundleTags
		});
		await bdi.sign(signer);
		return bdi;
	}

	/** Create drive and root folder together as bundled transaction */
	private async createDriveToTurbo(
		sharedPrepDriveParams: PartialPrepareDriveParams
	): Promise<ArFSCreateDriveToTurboResult> {
		const { arFSObjects, driveId, rootFolderId } = await this.prepareDrive({
			...sharedPrepDriveParams,
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataDataItem({
					objectMetaData
				})
		});

		const bdi = await this.makeBdi(arFSObjects);

		const { dataCaches, fastFinalityIndexes } = await this.turbo.sendDataItem(bdi);

		const [rootFolderDataItem, driveDataItem] = arFSObjects;

		return {
			driveId,
			metaDataTxId: TxID(driveDataItem.id),
			rootFolderId,
			rootFolderTxId: TxID(rootFolderDataItem.id),
			dataCaches,
			fastFinalityIndexes,
			bundleTxId: TxID(bdi.id)
		};
	}
	/**
	 * Create drive and root folder as a V2 transaction
	 * OR a direct to network bundled transaction
	 * OR upload data items to Turbo
	 *
	 * @remarks To bundle or to go to turbo is determined during cost estimation,
	 * and the provided rewardSettings will be type checked here to
	 * determine the result type
	 */
	private async createDrive(
		sharedPrepDriveParams: PartialPrepareDriveParams,
		rewardSettings: CreateDriveRewardSettings
	): Promise<ArFSCreateDriveResult | ArFSCreateBundledDriveResult> {
		if (rewardSettings === undefined) {
			return this.createDriveToTurbo(sharedPrepDriveParams);
		}

		const { transactions, result } = isBundleRewardSetting(rewardSettings)
			? await this.createBundledDrive(sharedPrepDriveParams, rewardSettings.bundleRewardSettings)
			: await this.createV2TxDrive(sharedPrepDriveParams, rewardSettings);

		// Upload all v2 transactions or direct to network bundles
		await this.sendTransactionsAsChunks(transactions);
		return result;
	}

	/** Create an ArFS public drive */
	public async createPublicDrive({
		driveName,
		rewardSettings
	}: ArFSCreatePublicDriveParams): Promise<ArFSCreatePublicDriveResult | ArFSCreatePublicBundledDriveResult> {
		const folderData = new ArFSPublicFolderTransactionData(driveName);

		const prepPublicDriveParams: PartialPrepareDriveParams = {
			rootFolderPrototypeFactory: (folderId: FolderID, driveId: DriveID) =>
				new ArFSPublicFolderMetaDataPrototype(folderData, driveId, folderId),
			generateDriveIdFn: () => EID(uuidv4()),
			drivePrototypeFactory: async (driveId: DriveID, rootFolderId: FolderID) =>
				Promise.resolve(
					new ArFSPublicDriveMetaDataPrototype(
						new ArFSPublicDriveTransactionData(driveName, rootFolderId),
						driveId
					)
				)
		};

		return this.createDrive(prepPublicDriveParams, rewardSettings);
	}

	/** Create an ArFS private drive */
	public async createPrivateDrive({
		driveName,
		rewardSettings,
		newDriveData
	}: ArFSCreatePrivateDriveParams): Promise<ArFSCreatePrivateDriveResult | ArFSCreatePrivateBundledDriveResult> {
		const folderData = await ArFSPrivateFolderTransactionData.from(driveName, newDriveData.driveKey);

		const prepPrivateDriveParams: PartialPrepareDriveParams = {
			rootFolderPrototypeFactory: (folderId: FolderID, driveId: DriveID) =>
				new ArFSPrivateFolderMetaDataPrototype(driveId, folderId, folderData),
			generateDriveIdFn: () => newDriveData.driveId,
			drivePrototypeFactory: async (driveId: DriveID, rootFolderId: FolderID) =>
				Promise.resolve(
					new ArFSPrivateDriveMetaDataPrototype(
						driveId,
						await ArFSPrivateDriveTransactionData.from(driveName, rootFolderId, newDriveData.driveKey)
					)
				)
		};

		return {
			...(await this.createDrive(prepPrivateDriveParams, rewardSettings)),
			driveKey: folderData.driveKey
		};
	}

	/**
	 * Uploads a single metadata prototype as a layer one tx or sends to turbo as a data item
	 *
	 * @remarks Uses an optional rewardSettings to determine whether to upload as layer one v2 or send as a data item to turbo
	 */
	private async uploadMetaData<P extends ArFSEntityMetaDataPrototype>(
		objectMetaData: P,
		rewardSettings?: RewardSettings
	): Promise<{ id: TransactionID } & TurboCachesResponse> {
		if (rewardSettings) {
			const metaDataTx = await this.txPreparer.prepareMetaDataTx({
				objectMetaData,
				rewardSettings
			});
			await this.sendTransactionsAsChunks([metaDataTx]);

			return { id: TxID(metaDataTx.id) };
		}

		// Absence of the rewardSettings implies we will send to turbo
		const metaDataDataItem = await this.txPreparer.prepareMetaDataDataItem({
			objectMetaData
		});
		const { dataCaches, fastFinalityIndexes } = await this.turbo.sendDataItem(metaDataDataItem);

		return { id: TxID(metaDataDataItem.id), dataCaches, fastFinalityIndexes };
	}

	async movePublicFile({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPublicFile, ArFSPublicFileMetadataTransactionData>): Promise<ArFSMovePublicFileResult> {
		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFileMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				originalMetaData.fileId,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			metaDataBaseReward
		);
		const owner = await this.getDriveOwnerForFolderId(originalMetaData.entityId);
		this.caches.publicFileCache.remove({ fileId: originalMetaData.entityId, owner });

		return {
			dataTxId: originalMetaData.dataTxId,
			metaDataTxId: id,
			metaDataTxReward: metaDataBaseReward?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	async movePrivateFile({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPrivateFile, ArFSPrivateFileMetadataTransactionData>): Promise<ArFSMovePrivateFileResult> {
		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFileMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				originalMetaData.fileId,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			metaDataBaseReward
		);
		const owner = await this.getDriveOwnerForFolderId(originalMetaData.entityId);
		this.caches.privateFileCache.remove({
			fileId: originalMetaData.entityId,
			owner,
			fileKey: transactionData.fileKey
		});

		return {
			dataTxId: originalMetaData.dataTxId,
			metaDataTxId: id,
			metaDataTxReward: metaDataBaseReward?.reward,
			fileKey: transactionData.fileKey,
			dataCaches,
			fastFinalityIndexes
		};
	}

	async movePublicFolder({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPublicFolder, ArFSPublicFolderTransactionData>): Promise<ArFSMovePublicFolderResult> {
		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFolderMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				originalMetaData.entityId,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			metaDataBaseReward
		);
		const owner = await this.getDriveOwnerForFolderId(originalMetaData.entityId);
		this.caches.publicFolderCache.remove({ folderId: originalMetaData.entityId, owner });

		return { metaDataTxId: id, metaDataTxReward: metaDataBaseReward?.reward, dataCaches, fastFinalityIndexes };
	}

	async movePrivateFolder({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPrivateFolder, ArFSPrivateFolderTransactionData>): Promise<ArFSMovePrivateFolderResult> {
		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFolderMetaDataPrototype(
				originalMetaData.driveId,
				originalMetaData.entityId,
				transactionData,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			metaDataBaseReward
		);
		const owner = await this.getDriveOwnerForFolderId(originalMetaData.entityId);
		this.caches.privateFolderCache.remove({
			folderId: originalMetaData.entityId,
			owner,
			driveKey: transactionData.driveKey
		});

		return {
			metaDataTxId: id,
			metaDataTxReward: metaDataBaseReward?.reward,
			driveKey: transactionData.driveKey,
			dataCaches,
			fastFinalityIndexes
		};
	}

	async prepareFile<T extends DataItem | Transaction, U extends DataItem | Transaction>({
		wrappedFile,
		dataPrototypeFactoryFn,
		metadataTxDataFactoryFn,
		prepareArFSObject,
		prepareMetaDataArFSObject
	}: ArFSPrepareFileParams<T, U>): Promise<ArFSPrepareFileResult<T, U>> {
		// Use existing file ID (create a revision) or generate new file ID
		const fileId = wrappedFile.existingId ?? EID(uuidv4());

		// Read file data into memory
		const fileData = wrappedFile.getFileDataBuffer();

		// Build file data transaction or dataItem
		const fileDataPrototype = await dataPrototypeFactoryFn(fileData, fileId);
		const dataArFSObject = await prepareArFSObject(fileDataPrototype);

		const metaDataPrototype = await metadataTxDataFactoryFn(fileId, TxID(dataArFSObject.id));
		const metaDataArFSObject = await prepareMetaDataArFSObject(metaDataPrototype);

		// Always preserve file key here for private files
		let fileKey: FileKey | undefined = undefined;
		if (metaDataPrototype instanceof ArFSPrivateFileMetaDataPrototype) {
			fileKey = metaDataPrototype.objectData.fileKey;
		}

		return { arFSObjects: [dataArFSObject, metaDataArFSObject], fileId, fileKey };
	}

	/** @deprecated -- Now uses the uploadAllEntities method internally. Will be removed in a future major release */
	async uploadPublicFile({
		parentFolderId: destFolderId,
		wrappedFile: wrappedEntity,
		driveId: destDriveId,
		rewardSettings,
		communityTipSettings
	}: ArFSUploadPublicFileParams): Promise<ArFSUploadEntitiesResult> {
		const owner = await this.getDriveOwnerForFolderId(destDriveId);

		const uploadPlan: CalculatedUploadPlan = ((): CalculatedUploadPlan => {
			if (isBundleRewardSetting(rewardSettings)) {
				return {
					bundlePlans: [
						{
							bundleRewardSettings: rewardSettings.bundleRewardSettings,
							uploadStats: [
								{
									wrappedEntity,
									destDriveId,
									destFolderId,
									owner
								}
							],
							communityTipSettings,
							metaDataDataItems: []
						}
					],
					v2TxPlans: emptyV2TxPlans
				};
			}

			return {
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileAndMetaDataPlans: [
						{
							uploadStats: { destDriveId, destFolderId, wrappedEntity, owner },
							dataTxRewardSettings: rewardSettings.dataTxRewardSettings,
							metaDataRewardSettings: rewardSettings.metaDataRewardSettings,
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							communityTipSettings: communityTipSettings!
						}
					]
				}
			};
		})();

		return this.uploadAllEntities(uploadPlan);
	}

	/** @deprecated -- Now uses the uploadAllEntities method internally. Will be removed in a future major release */
	async uploadPrivateFile({
		parentFolderId: destFolderId,
		wrappedFile: wrappedEntity,
		driveId: destDriveId,
		driveKey,
		rewardSettings,
		communityTipSettings
	}: ArFSUploadPrivateFileParams): Promise<ArFSUploadEntitiesResult> {
		const owner = await this.getDriveOwnerForFolderId(destDriveId);

		const uploadPlan: CalculatedUploadPlan = ((): CalculatedUploadPlan => {
			if (isBundleRewardSetting(rewardSettings)) {
				return {
					bundlePlans: [
						{
							bundleRewardSettings: rewardSettings.bundleRewardSettings,
							uploadStats: [
								{
									wrappedEntity,
									destDriveId,
									destFolderId,
									driveKey,
									owner
								}
							],
							communityTipSettings,
							metaDataDataItems: []
						}
					],
					v2TxPlans: emptyV2TxPlans
				};
			}

			return {
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileAndMetaDataPlans: [
						{
							uploadStats: { destDriveId, destFolderId, wrappedEntity, owner, driveKey },
							dataTxRewardSettings: rewardSettings.dataTxRewardSettings,
							metaDataRewardSettings: rewardSettings.metaDataRewardSettings,
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							communityTipSettings: communityTipSettings!
						}
					]
				}
			};
		})();

		return this.uploadAllEntities(uploadPlan);
	}

	private async uploadFileAndMetaDataAsV2(
		prepFileParams: PartialPrepareFileParams,
		dataTxRewardSettings: RewardSettings,
		metaDataRewardSettings: RewardSettings,
		communityTipSettings?: CommunityTipSettings
	): Promise<FileResult> {
		const { arFSObjects, fileId, fileKey } = await this.prepareFile({
			...prepFileParams,
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareFileDataTx({
					objectMetaData,
					rewardSettings: dataTxRewardSettings,
					communityTipSettings
				}),
			prepareMetaDataArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataTx({
					objectMetaData,
					rewardSettings: metaDataRewardSettings
				})
		});

		// Send both v2 transactions
		await this.sendTransactionsAsChunks(arFSObjects);

		const [dataTx, metaDataTx] = arFSObjects;
		const { sourceUri, destinationBaseName } = prepFileParams.wrappedFile;
		return {
			sourceUri,
			entityName: destinationBaseName,
			fileDataTxId: TxID(dataTx.id),
			fileDataReward: W(dataTx.reward),
			entityId: fileId,
			metaDataTxId: TxID(metaDataTx.id),
			fileMetaDataReward: W(metaDataTx.reward),
			fileKey,
			communityTipSettings
		};
	}

	private async uploadOnlyFileAsV2(
		prepFileParams: PartialPrepareFileParams,
		dataTxRewardSettings: RewardSettings,
		communityTipSettings?: CommunityTipSettings
	): Promise<{ fileResult: FileResult; metaDataDataItem: DataItem }> {
		const { arFSObjects, fileId, fileKey } = await this.prepareFile({
			...prepFileParams,
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareFileDataTx({
					objectMetaData,
					rewardSettings: dataTxRewardSettings,
					communityTipSettings
				}),
			prepareMetaDataArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataDataItem({
					objectMetaData
				})
		});

		const [dataTx, metaDataDataItem] = arFSObjects;

		// Send only file data as v2 transaction
		await this.sendTransactionsAsChunks([dataTx]);

		const { sourceUri, destinationBaseName } = prepFileParams.wrappedFile;
		return {
			fileResult: {
				sourceUri,
				entityName: destinationBaseName,
				fileDataTxId: TxID(dataTx.id),
				fileDataReward: W(dataTx.reward),
				entityId: fileId,
				metaDataTxId: TxID(metaDataDataItem.id),
				fileKey,
				communityTipSettings
			},
			// Return the meta data data item
			metaDataDataItem
		};
	}

	/**
	 * Uploads each file and recursive folder within the upload stats up to Turbo
	 *
	 * @remarks when one of the uploads fail, this method will continue to upload the rest of the files and folders
	 */
	public async uploadAllEntitiesToTurbo(uploadStats: UploadStats[]): Promise<ArFSUploadEntitiesResult> {
		const results: ArFSUploadEntitiesResult = { fileResults: [], folderResults: [], bundleResults: [] };

		const totalContentCountsToUpload: { numFiles: number; numFolders: number } = uploadStats.reduce(
			({ numFiles, numFolders }, { wrappedEntity }) => {
				if (wrappedEntity.entityType === 'file') {
					return { numFiles: numFiles + 1, numFolders };
				}
				const { numFiles: subFiles, numFolders: subFolders } = wrappedEntity.getContentToUploadCounts();
				return {
					numFiles: numFiles + subFiles,
					numFolders: numFolders + subFolders
				};
			},
			{ numFiles: 0, numFolders: 0 }
		);
		const { numFiles: totalNumFiles, numFolders: totalNumFolders } = totalContentCountsToUpload;
		const contentCountUploaded = { numFiles: 0, numFolders: 0 };

		if (this.shouldProgressLog) {
			console.error(`\nUploading to Turbo at ${this.turbo.turboUrl}...\n`);
		}

		const logProgress = (entityType?: 'file' | 'folder') => {
			if (entityType === 'file') {
				contentCountUploaded.numFiles++;
			} else if (entityType === 'folder') {
				contentCountUploaded.numFolders++;
			}

			if (this.shouldProgressLog && totalNumFiles + totalNumFolders > 1) {
				console.error(
					`Upload Progress: ${contentCountUploaded.numFiles}/${totalNumFiles} Files${
						totalNumFolders > 0 ? `, ${contentCountUploaded.numFolders}/${totalNumFolders} Folders...` : ``
					}`
				);
			}
		};
		logProgress();

		for (const { wrappedEntity, destDriveId, owner, destFolderId, driveKey } of uploadStats) {
			if (wrappedEntity.entityType === 'folder') {
				const recursiveFolderResults = await this.recursivelyUploadFolderToTurbo(
					{
						wrappedEntity,
						destDriveId,
						destFolderId,
						owner,
						driveKey
					},
					logProgress
				);
				results.fileResults.push(...recursiveFolderResults.fileResults);
				results.folderResults.push(...recursiveFolderResults.folderResults);
				results.bundleResults.push(...recursiveFolderResults.bundleResults);
			} else {
				try {
					const fileResult = await this.uploadFileToTurbo({
						destDriveId,
						destFolderId,
						wrappedEntity,
						owner,
						driveKey
					});

					results.fileResults.push(fileResult);
					if (fileResult.bundledIn) {
						results.bundleResults.push({ bundleTxId: fileResult.bundledIn });
					}
				} catch (error) {
					console.error(`Error uploading file ${wrappedEntity.sourceUri}: ${error}`);
					console.error(`Skipping and continuing...`);
				}
				contentCountUploaded.numFiles++;
			}
			logProgress('file');
		}

		return results;
	}

	private async recursivelyUploadFolderToTurbo(
		{ wrappedEntity, destDriveId, owner, destFolderId, driveKey }: UploadStats<ArFSFolderToUpload>,
		progressCallback?: (entityType: 'file' | 'folder') => void
	): Promise<ArFSUploadEntitiesResult> {
		const results: ArFSUploadEntitiesResult = {
			folderResults: [],
			fileResults: [],
			bundleResults: []
		};

		if (!wrappedEntity.existingId) {
			// Create the folder data item if it does not exist
			wrappedEntity.existingId = EID(v4());
			try {
				const folderResult = await this.uploadFolderToTurbo({
					destDriveId,
					owner,
					destFolderId,
					driveKey,
					wrappedEntity
				});
				results.folderResults.push(folderResult);
				progressCallback?.('folder');
			} catch (error) {
				console.error(`Error uploading folder ${wrappedEntity.sourceUri}: ${error}`);
				console.error(`Skipping its contents and continuing...`);
				return results;
			}
		}

		const fileDestFolderId = wrappedEntity.existingId;

		for (const file of wrappedEntity.files) {
			try {
				const fileResult = await this.uploadFileToTurbo({
					destDriveId,
					destFolderId: fileDestFolderId,
					wrappedEntity: file,
					owner,
					driveKey
				});

				results.fileResults.push(fileResult);
				progressCallback?.('file');
				if (fileResult.bundledIn) {
					results.bundleResults.push({ bundleTxId: fileResult.bundledIn });
				}
			} catch (error) {
				console.error(`Error uploading file ${file.sourceUri}: ${error}`);
				console.error(`Skipping and continuing...`);
			}
		}

		for (const folder of wrappedEntity.folders) {
			const recursiveFolderResults = await this.recursivelyUploadFolderToTurbo(
				{
					destDriveId,
					destFolderId: fileDestFolderId,
					wrappedEntity: folder,
					owner,
					driveKey
				},
				progressCallback
			);

			results.fileResults.push(...recursiveFolderResults.fileResults);
			results.folderResults.push(...recursiveFolderResults.folderResults);
			results.bundleResults.push(...recursiveFolderResults.bundleResults);
		}

		return results;
	}

	private async uploadFolderToTurbo(uploadStats: UploadStats<ArFSFolderToUpload>): Promise<FolderResult> {
		const { arFSObjects, folderId } = await this.prepareFolder({
			folderPrototypeFactory: await getPrepFolderFactoryParams({
				...uploadStats,
				wrappedEntity: uploadStats.wrappedEntity
			}),
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataDataItem({
					objectMetaData
				})
		});
		const folderDataItem = arFSObjects[0];
		const { dataCaches, fastFinalityIndexes } = await this.turbo.sendDataItem(folderDataItem);
		return {
			entityId: folderId,
			folderTxId: TxID(folderDataItem.id),
			driveKey: uploadStats.driveKey,
			entityName: uploadStats.wrappedEntity.destinationBaseName,
			sourceUri: uploadStats.wrappedEntity.sourceUri,
			dataCaches,
			fastFinalityIndexes
		};
	}

	private async uploadFileToTurbo({
		wrappedEntity,
		destDriveId,
		destFolderId,
		owner,
		driveKey
	}: UploadStats<ArFSDataToUpload>): Promise<FileResult> {
		// eslint-disable-next-line prettier/prettier
		const { arFSObjects: dataItems, fileId, fileKey } = await this.prepareFile({
			...getPrepFileParams({
				wrappedEntity,
				destFolderId,
				destDriveId,
				owner,
				driveKey
			}),
			prepareArFSObject: (objectMetaData) =>
				this.txPreparer.prepareFileDataDataItem({
					objectMetaData
				}),
			prepareMetaDataArFSObject: (objectMetaData) =>
				this.txPreparer.prepareMetaDataDataItem({
					objectMetaData
				})
		});

		const bdi = await this.makeBdi(dataItems);
		const { dataCaches, fastFinalityIndexes } = await this.turbo.sendDataItem(bdi);

		const [fileDataDataItem, metaDataDataItem] = dataItems;

		return {
			sourceUri: wrappedEntity.sourceUri,
			entityName: wrappedEntity.destinationBaseName,
			fileDataTxId: TxID(fileDataDataItem.id),
			entityId: fileId,
			metaDataTxId: TxID(metaDataDataItem.id),
			fileKey,
			dataCaches,
			fastFinalityIndexes,
			bundledIn: TxID(bdi.id)
		};
	}

	public async uploadAllEntities({
		bundlePlans,
		v2TxPlans
	}: CalculatedUploadPlan): Promise<ArFSUploadEntitiesResult> {
		const results: ArFSUploadEntitiesResult = { fileResults: [], folderResults: [], bundleResults: [] };
		const { fileAndMetaDataPlans, fileDataOnlyPlans, folderMetaDataPlans: folderMetaDataPlan } = v2TxPlans;

		const totalFileAndBundleUploads = fileAndMetaDataPlans.length + fileDataOnlyPlans.length + bundlePlans.length;
		let uploadsCompleted = 0;

		const logProgress = () => {
			if (this.shouldProgressLog && totalFileAndBundleUploads > 1) {
				console.error(
					`Uploading file transaction ${
						uploadsCompleted + 1
					} of total ${totalFileAndBundleUploads} transactions...`
				);
			}
		};

		// First, we must upload all planned v2 transactions so we can preserve any file metaData data items
		for (const {
			dataTxRewardSettings,
			uploadStats,
			communityTipSettings,
			metaDataBundleIndex
		} of fileDataOnlyPlans) {
			logProgress();

			const { fileResult, metaDataDataItem } = await this.uploadOnlyFileAsV2(
				getPrepFileParams(uploadStats),
				dataTxRewardSettings,
				communityTipSettings
			);

			uploadsCompleted++;
			results.fileResults.push(fileResult);

			// Add data item to its intended bundle plan
			bundlePlans[metaDataBundleIndex].metaDataDataItems.push(metaDataDataItem);
		}
		v2TxPlans.fileDataOnlyPlans = [];

		for (const {
			dataTxRewardSettings,
			metaDataRewardSettings,
			uploadStats,
			communityTipSettings
		} of fileAndMetaDataPlans) {
			logProgress();

			const fileResult = await this.uploadFileAndMetaDataAsV2(
				getPrepFileParams({
					...uploadStats
				}),
				dataTxRewardSettings,
				metaDataRewardSettings,
				communityTipSettings
			);

			uploadsCompleted++;
			results.fileResults.push(fileResult);
		}
		v2TxPlans.fileAndMetaDataPlans = [];

		for (const { metaDataRewardSettings, uploadStats } of folderMetaDataPlan) {
			// Send this folder metadata up as a v2 tx
			const { folderId, metaDataTxId, metaDataTxReward } = await this.createAndUploadFolderAsV2Tx(
				await getPrepFolderFactoryParams(uploadStats),
				metaDataRewardSettings
			);

			results.folderResults.push({
				entityId: folderId,
				entityName: uploadStats.wrappedEntity.destinationBaseName,
				folderTxId: metaDataTxId,
				folderMetaDataReward: metaDataTxReward,
				driveKey: uploadStats.driveKey,
				sourceUri: uploadStats.wrappedEntity.sourceUri
			});
		}
		v2TxPlans.folderMetaDataPlans = [];

		for (const { uploadStats, bundleRewardSettings, metaDataDataItems, communityTipSettings } of bundlePlans) {
			// The upload planner has planned to upload bundles, proceed with bundling
			let dataItems: DataItem[] = [];

			// We accumulate results from the current bundle in order to add on the
			// bundledIn field after we have the bundleTxId from signing bundle
			const currentBundleResults: { folderResults: FolderResult[]; fileResults: FileResult[] } = {
				folderResults: [],
				fileResults: []
			};

			logProgress();

			for (const uploadStat of uploadStats) {
				const { wrappedEntity, driveKey } = uploadStat;

				if (wrappedEntity.entityType === 'folder') {
					if (uploadStats.length === 1 && metaDataDataItems.length < 1) {
						throw new Error('Invalid bundle plan, a single metadata transaction can not be bundled alone!');
					}

					// Prepare folder data item and results
					const { arFSObjects, folderId } = await this.prepareFolder({
						folderPrototypeFactory: await getPrepFolderFactoryParams({
							...uploadStat,
							wrappedEntity
						}),
						prepareArFSObject: (objectMetaData) =>
							this.txPreparer.prepareMetaDataDataItem({
								objectMetaData
							})
					});
					const folderDataItem = arFSObjects[0];

					dataItems.push(folderDataItem);
					currentBundleResults.folderResults.push({
						entityId: folderId,
						folderTxId: TxID(folderDataItem.id),
						driveKey,
						entityName: wrappedEntity.destinationBaseName,
						sourceUri: wrappedEntity.sourceUri
					});
				} else {
					if (!communityTipSettings) {
						throw new Error('Invalid bundle plan, file uploads must include communityTipSettings!');
					}

					// Prepare file data item and results
					const prepFileParams = getPrepFileParams({
						...uploadStat,
						wrappedEntity
					});

					const { arFSObjects, fileId, fileKey } = await this.prepareFile({
						...prepFileParams,
						prepareArFSObject: (objectMetaData) =>
							this.txPreparer.prepareFileDataDataItem({
								objectMetaData
							}),
						prepareMetaDataArFSObject: (objectMetaData) =>
							this.txPreparer.prepareMetaDataDataItem({
								objectMetaData
							})
					});

					const [fileDataItem, metaDataItem] = arFSObjects;

					dataItems.push(...arFSObjects);
					currentBundleResults.fileResults.push({
						entityId: fileId,
						fileDataTxId: TxID(fileDataItem.id),
						metaDataTxId: TxID(metaDataItem.id),
						fileKey,
						entityName: wrappedEntity.destinationBaseName,
						sourceUri: wrappedEntity.sourceUri
					});
				}
			}

			// Add any metaData data items from over-sized files sent as v2
			dataItems.push(...metaDataDataItems);

			const bundleTx = await this.prepareArFSObjectBundle({
				dataItems,
				rewardSettings: bundleRewardSettings,
				communityTipSettings
			});

			// Drop data items from memory immediately after the bundle has been assembled
			dataItems = [];

			// This bundle is now complete, send it off before starting a new one
			await this.sendTransactionsAsChunks([bundleTx]);

			uploadsCompleted++;

			for (const res of currentBundleResults.fileResults) {
				res.bundledIn = TxID(bundleTx.id);
				results.fileResults.push(res);
			}
			for (const res of currentBundleResults.folderResults) {
				res.bundledIn = TxID(bundleTx.id);
				results.folderResults.push(res);
			}
			results.bundleResults.push({
				bundleTxId: TxID(bundleTx.id),
				communityTipSettings,
				bundleReward: W(bundleTx.reward)
			});
		}

		return results;
	}

	/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead */
	async prepareArFSDataItem({
		objectMetaData,
		excludedTagNames = []
	}: ArFSPrepareDataItemsParams): Promise<DataItem> {
		return excludedTagNames.includes('ArFS')
			? this.txPreparer.prepareFileDataDataItem({
					objectMetaData: objectMetaData as ArFSFileDataPrototype
			  })
			: this.txPreparer.prepareMetaDataDataItem({
					objectMetaData: objectMetaData as ArFSEntityMetaDataPrototype
			  });
	}

	/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead */
	async prepareArFSObjectBundle({
		dataItems,
		rewardSettings = {},
		communityTipSettings
	}: ArFSPrepareObjectBundleParams): Promise<Transaction> {
		return this.txPreparer.prepareBundleTx({ dataItems, communityTipSettings, rewardSettings });
	}

	/** @deprecated -- Logic has been moved from ArFSDAO, use TxPreparer methods instead */
	async prepareArFSObjectTransaction({
		objectMetaData,
		rewardSettings = {},
		communityTipSettings,
		excludedTagNames = []
	}: ArFSPrepareObjectTransactionParams): Promise<Transaction> {
		return excludedTagNames.includes('ArFS')
			? this.txPreparer.prepareFileDataTx({
					objectMetaData: objectMetaData as ArFSFileDataPrototype,
					rewardSettings,
					communityTipSettings
			  })
			: this.txPreparer.prepareMetaDataTx({
					objectMetaData: objectMetaData as ArFSEntityMetaDataPrototype,
					rewardSettings
			  });
	}

	async sendTransactionsAsChunks(transactions: Transaction[], resumeChunkUpload = false): Promise<void> {
		// Execute the uploads
		if (!this.dryRun) {
			for (const transaction of transactions) {
				if (!resumeChunkUpload) {
					// Resumed uploads will already have their chunks prepared in order to assert that the data_root is consistent
					await transaction.prepareChunks(transaction.data);
				}

				// Only log progress if total chunks of transaction is greater than the max concurrent chunks setting
				const shouldProgressLog =
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this.shouldProgressLog && transaction.chunks!.chunks.length > defaultMaxConcurrentChunks;

				const uploaderParams: MultiChunkTxUploaderConstructorParams = {
					transaction,
					gatewayApi: this.gatewayApi,
					progressCallback: shouldProgressLog
						? (pct: number) => {
								// TODO: Test if this is still progress logging, otherwise lift this var into above scope 👍
								let progressLogDebounce = false;

								if (!progressLogDebounce || pct === 100) {
									console.error(`Transaction ${transaction.id} Upload Progress: ${pct}%`);
									progressLogDebounce = true;

									setTimeout(() => {
										progressLogDebounce = false;
									}, 500); // .5 sec debounce
								}
						  }
						: undefined
				};

				const transactionUploader = resumeChunkUpload
					? MultiChunkTxUploader.resumeChunkUpload(uploaderParams)
					: new MultiChunkTxUploader(uploaderParams);

				await transactionUploader.batchUploadChunks();
			}
		}
	}

	public async retryV2ArFSPublicFileTransaction({
		wrappedFile,
		arFSDataTxId,
		createMetaDataPlan
	}: ArFSRetryPublicFileUploadParams): Promise<ArFSV2PublicRetryResult> {
		const arFSDataTx = await this.gatewayApi.getTransaction(arFSDataTxId);

		const newMetaDataInfo = createMetaDataPlan
			? await this.createV2PublicFileMetaData({
					wrappedFile,
					arFSDataTxId,
					createMetaDataPlan
			  })
			: undefined;

		await this.reSeedV2FileTransaction(wrappedFile, arFSDataTx);

		return {
			communityTipSettings: {
				communityTipTarget: ADDR(arFSDataTx.target),
				communityWinstonTip: W(arFSDataTx.quantity)
			},
			fileDataReward: W(arFSDataTx.reward),
			newMetaDataInfo
		};
	}

	private async createV2PublicFileMetaData({
		createMetaDataPlan,
		wrappedFile,
		arFSDataTxId
	}: Required<ArFSRetryPublicFileUploadParams>): Promise<NewFileMetaDataCreated> {
		const { destinationFolderId, rewardSettings } = createMetaDataPlan;
		const fileId = createMetaDataPlan.fileId ?? EID(v4());

		const fileMetaDataPrototype = ArFSPublicFileMetaDataPrototype.fromFile({
			wrappedFile,
			parentFolderId: destinationFolderId,
			fileId,
			driveId: await this.getDriveIdForFolderId(destinationFolderId),
			dataTxId: arFSDataTxId
		});

		const fileMetaDataTransaction = await this.prepareArFSObjectTransaction({
			objectMetaData: fileMetaDataPrototype,
			rewardSettings
		});

		await this.sendTransactionsAsChunks([fileMetaDataTransaction]);

		return {
			fileId,
			fileMetaDataReward: W(fileMetaDataTransaction.reward),
			metaDataTxId: TxID(fileMetaDataTransaction.id)
		};
	}

	// Retry a single public file transaction
	private async reSeedV2FileTransaction(wrappedFile: ArFSFileToUpload, transaction: Transaction): Promise<void> {
		const dataRootFromGateway = transaction.data_root;

		transaction = await rePrepareV2Tx(transaction, wrappedFile.getFileDataBuffer());
		assertDataRootsMatch(transaction, dataRootFromGateway);

		await this.sendTransactionsAsChunks([transaction], true);
	}

	// Convenience function for known-private use cases
	async getPrivateDrive(driveId: DriveID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateDrive> {
		const cacheKey = { driveId, driveKey, owner };
		const cachedDrive = this.caches.privateDriveCache.get(cacheKey);
		if (cachedDrive) {
			return cachedDrive;
		}
		return this.caches.privateDriveCache.put(
			cacheKey,
			new ArFSPrivateDriveBuilder({
				entityId: driveId,
				key: driveKey,
				owner,
				gatewayApi: this.gatewayApi
			}).build()
		);
	}

	// Convenience function for known-private use cases
	async getPrivateFolder(folderId: FolderID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFolder> {
		const cacheKey = { folderId, driveKey, owner };
		const cachedFolder = this.caches.privateFolderCache.get(cacheKey);
		if (cachedFolder) {
			return cachedFolder;
		}
		return this.caches.privateFolderCache.put(
			cacheKey,
			new ArFSPrivateFolderBuilder(folderId, this.gatewayApi, driveKey, owner).build()
		);
	}

	async getPrivateFile(fileId: FileID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFile> {
		const fileKey = await deriveFileKey(`${fileId}`, driveKey);
		const cacheKey = { fileId, owner, fileKey };
		const cachedFile = this.caches.privateFileCache.get(cacheKey);
		if (cachedFile) {
			return cachedFile;
		}
		return this.caches.privateFileCache.put(
			cacheKey,
			new ArFSPrivateFileBuilder(fileId, this.gatewayApi, driveKey, owner).build()
		);
	}

	async getAllFoldersOfPrivateDrive({
		driveId,
		driveKey,
		owner,
		latestRevisionsOnly = false
	}: ArFSAllPrivateFoldersOfDriveParams): Promise<ArFSPrivateFolder[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFolders: ArFSPrivateFolder[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Entity-Type', value: 'folder' }
				],
				cursor,
				owner
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;

			const folders: Promise<ArFSPrivateFolder>[] = edges.map(async (edge: GQLEdgeInterface) => {
				cursor = edge.cursor;
				const { node } = edge;
				const folderBuilder = ArFSPrivateFolderBuilder.fromArweaveNode(node, this.gatewayApi, driveKey);
				// Build the folder so that we don't add something invalid to the cache
				const folder = await folderBuilder.build(node);
				const cacheKey = { folderId: folder.entityId, owner, driveKey };
				return this.caches.privateFolderCache.put(cacheKey, Promise.resolve(folder));
			});
			allFolders.push(...(await Promise.all(folders)));
		}

		return latestRevisionsOnly ? allFolders.filter(latestRevisionFilter) : allFolders;
	}

	async getPrivateFilesWithParentFolderIds(
		folderIDs: FolderID[],
		driveKey: DriveKey,
		owner: ArweaveAddress,
		driveId: DriveID,
		latestRevisionsOnly = false
	): Promise<ArFSPrivateFile[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: ArFSPrivateFile[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Parent-Folder-Id', value: folderIDs.map((fid) => fid.toString()) },
					{ name: 'Entity-Type', value: 'file' }
				],
				cursor,
				owner
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			const files: Promise<ArFSPrivateFile>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				const fileBuilder = ArFSPrivateFileBuilder.fromArweaveNode(node, this.gatewayApi, driveKey);
				// Build the file so that we don't add something invalid to the cache
				const file = await fileBuilder.build(node);
				const fileKey: FileKey = await deriveFileKey(`${file.fileId}`, driveKey);
				const cacheKey = {
					fileId: file.fileId,
					owner,
					fileKey
				};
				return this.caches.privateFileCache.put(cacheKey, Promise.resolve(file));
			});
			allFiles.push(...(await Promise.all(files)));
		}
		return latestRevisionsOnly ? allFiles.filter(latestRevisionFilter) : allFiles;
	}

	async getEntitiesInFolder<T extends ArFSFileOrFolderEntity<'file'> | ArFSFileOrFolderEntity<'folder'>>(
		parentFolderId: FolderID,
		owner: ArweaveAddress,
		builder: (
			node: GQLNodeInterface,
			entityType: 'file' | 'folder'
		) =>
			| ArFSFileOrFolderBuilder<'file', ArFSFileOrFolderEntity<'file'>>
			| ArFSFileOrFolderBuilder<'folder', ArFSFileOrFolderEntity<'folder'>>,
		driveId: DriveID,
		latestRevisionsOnly = true,
		filterOnOwner = true
	): Promise<T[]> {
		let cursor = '';
		let hasNextPage = true;
		const allEntities: T[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Parent-Folder-Id', value: `${parentFolderId}` },
					{ name: 'Entity-Type', value: ['file', 'folder'] }
				],
				cursor,
				owner: filterOnOwner ? owner : undefined
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const folders: Promise<T>[] = (edges as any).map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				const { tags } = node;

				// Check entityType to determine which builder to use
				const entityType = tags.find((t) => t.name === 'Entity-Type')?.value;
				if (!entityType || (entityType !== 'file' && entityType !== 'folder')) {
					throw new Error('Entity-Type tag is missing or invalid!');
				}

				return builder(node, entityType).build(node);
			});

			allEntities.push(...(await Promise.all(folders)));
		}
		return latestRevisionsOnly ? allEntities.filter(latestRevisionFilter) : allEntities;
	}

	async getPrivateEntitiesInFolder(
		parentFolderId: FolderID,
		owner: ArweaveAddress,
		driveKey: DriveKey,
		driveId: DriveID,
		latestRevisionsOnly = true
	): Promise<(ArFSPrivateFile | ArFSPrivateFolder)[]> {
		return this.getEntitiesInFolder(
			parentFolderId,
			owner,
			(node, entityType) =>
				entityType === 'folder'
					? ArFSPrivateFolderBuilder.fromArweaveNode(node, this.gatewayApi, driveKey)
					: ArFSPrivateFileBuilder.fromArweaveNode(node, this.gatewayApi, driveKey),
			driveId,
			latestRevisionsOnly
		);
	}

	async getPublicEntitiesInFolder(
		parentFolderId: FolderID,
		owner: ArweaveAddress,
		driveId: DriveID,
		latestRevisionsOnly = true
	): Promise<(ArFSPublicFile | ArFSPublicFolder)[]> {
		return this.getEntitiesInFolder(
			parentFolderId,
			owner,
			(node, entityType) =>
				entityType === 'folder'
					? ArFSPublicFolderBuilder.fromArweaveNode(node, this.gatewayApi)
					: ArFSPublicFileBuilder.fromArweaveNode(node, this.gatewayApi),
			driveId,
			latestRevisionsOnly
		);
	}

	async getChildrenFolderIds(
		folderId: FolderID,
		allFolderEntitiesOfDrive: ArFSFileOrFolderEntity<'folder'>[]
	): Promise<FolderID[]> {
		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		return hierarchy.folderIdSubtreeFromFolderId(folderId, Number.MAX_SAFE_INTEGER);
	}

	async getPrivateEntityNamesInFolder(
		folderId: FolderID,
		owner: ArweaveAddress,
		driveKey: DriveKey,
		driveId: DriveID
	): Promise<string[]> {
		const childrenOfFolder = await this.getPrivateEntitiesInFolder(folderId, owner, driveKey, driveId, true);
		return childrenOfFolder.map(entityToNameMap);
	}

	async getPublicEntityNamesInFolder(folderId: FolderID, owner: ArweaveAddress, driveId: DriveID): Promise<string[]> {
		const childrenOfFolder = await this.getPublicEntitiesInFolder(folderId, owner, driveId, true);
		return childrenOfFolder.map(entityToNameMap);
	}

	async getPublicNameConflictInfoInFolder(
		folderId: FolderID,
		owner: ArweaveAddress,
		driveId: DriveID
	): Promise<NameConflictInfo> {
		const cacheKey = { folderId, owner };
		const cachedConflictInfo = this.caches.publicConflictCache.get(cacheKey);
		if (cachedConflictInfo) {
			return cachedConflictInfo;
		}

		return this.caches.publicConflictCache.put(
			cacheKey,
			(async () => {
				const childrenOfFolder = await this.getPublicEntitiesInFolder(folderId, owner, driveId, true);
				return {
					files: childrenOfFolder.filter(fileFilter).map(fileConflictInfoMap),
					folders: childrenOfFolder.filter(folderFilter).map(folderToNameAndIdMap)
				};
			})()
		);
	}

	async getPrivateNameConflictInfoInFolder(
		folderId: FolderID,
		owner: ArweaveAddress,
		driveKey: DriveKey,
		driveId: DriveID
	): Promise<NameConflictInfo> {
		const cacheKey = { folderId, owner, driveKey };
		const cachedConflictInfo = this.caches.privateConflictCache.get(cacheKey);
		if (cachedConflictInfo) {
			return cachedConflictInfo;
		}

		return this.caches.privateConflictCache.put(
			cacheKey,
			(async () => {
				const childrenOfFolder = await this.getPrivateEntitiesInFolder(
					folderId,
					owner,
					driveKey,
					driveId,
					true
				);
				// Hack to deal with potential typescript bug
				const files = childrenOfFolder.filter(fileFilter) as ArFSPrivateFile[];
				const folders = childrenOfFolder.filter(folderFilter) as ArFSPrivateFolder[];
				return {
					files: files.map(fileConflictInfoMap),
					folders: folders.map(folderToNameAndIdMap)
				};
			})()
		);
	}

	async getPrivateChildrenFolderIds({
		folderId,
		driveId,
		driveKey,
		owner
	}: ArFSGetPrivateChildFolderIdsParams): Promise<FolderID[]> {
		return this.getChildrenFolderIds(
			folderId,
			await this.getAllFoldersOfPrivateDrive({ driveId, driveKey, owner, latestRevisionsOnly: true })
		);
	}

	async getPublicChildrenFolderIds({
		folderId,
		owner,
		driveId
	}: ArFSGetPublicChildFolderIdsParams): Promise<FolderID[]> {
		return this.getChildrenFolderIds(
			folderId,
			await this.getAllFoldersOfPublicDrive({ driveId, owner, latestRevisionsOnly: true })
		);
	}

	public async isPublicDrive(driveId: DriveID, address: ArweaveAddress): Promise<boolean> {
		const gqlQuery = buildQuery({
			tags: [
				{ name: 'Entity-Type', value: 'drive' },
				{ name: 'Drive-Id', value: `${driveId}` }
			],
			owner: address,
			sort: DESCENDING_ORDER
		});

		const transactions = await this.gatewayApi.gqlRequest(gqlQuery);

		const drivePrivacyFromTag = transactions.edges[0].node.tags.find(
			(t) => t.name === gqlTagNameRecord.drivePrivacy
		);

		return drivePrivacyFromTag?.value === 'public';
	}

	public async assertDrivePrivacy(driveId: DriveID, address: ArweaveAddress, driveKey?: DriveKey): Promise<void> {
		const _isPublicDrive = await this.isPublicDrive(driveId, address);

		// Private drive uploads require a drive key
		if (!_isPublicDrive && !driveKey) {
			throw new Error('Private drive requires a drive key to upload');
		}

		if (_isPublicDrive && driveKey) {
			throw new Error('Public drive does not require a drive key to upload');
		}
	}

	public async getOwnerAndAssertDrive(driveId: DriveID, driveKey?: DriveKey): Promise<ArweaveAddress> {
		const cachedOwner = this.caches.ownerCache.get(driveId);
		if (cachedOwner) {
			return cachedOwner;
		}

		return this.caches.ownerCache.put(
			driveId,
			(async () => {
				const gqlQuery = buildQuery({
					tags: [
						{ name: 'Entity-Type', value: 'drive' },
						{ name: 'Drive-Id', value: `${driveId}` }
					],
					sort: ASCENDING_ORDER
				});
				const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
				const edges: GQLEdgeInterface[] = transactions.edges;

				if (!edges.length) {
					throw new Error(`Could not find a transaction with "Drive-Id": ${driveId}`);
				}

				const edgeOfFirstDrive = edges[0];
				const driveOwnerAddress = edgeOfFirstDrive.node.owner.address;
				const driveOwner = new ArweaveAddress(driveOwnerAddress);

				const drivePrivacy: DrivePrivacy = driveKey ? 'private' : 'public';
				const drivePrivacyFromTag = edgeOfFirstDrive.node.tags.find((t) => t.name === 'Drive-Privacy');

				if (!drivePrivacyFromTag) {
					throw new Error('Target drive has no "Drive-Privacy" tag!');
				}

				if (drivePrivacyFromTag.value !== drivePrivacy) {
					throw new Error(`Target drive is not a ${drivePrivacy} drive!`);
				}

				if (driveKey) {
					const cipherIVFromTag = edgeOfFirstDrive.node.tags.find((t) => t.name === 'Cipher-IV');
					if (!cipherIVFromTag) {
						throw new Error('Target private drive has no "Cipher-IV" tag!');
					}

					const driveDataBuffer = await this.gatewayApi.getTxData(TxID(edgeOfFirstDrive.node.id));
					try {
						// Attempt to decrypt drive to assert drive key is correct
						await driveDecrypt(cipherIVFromTag.value, driveKey, driveDataBuffer);
					} catch {
						throw new Error('Provided drive key or password could not decrypt target private drive!');
					}
				}

				return driveOwner;
			})()
		);
	}

	/**
	 * Lists the children of certain private folder
	 * @param {FolderID} folderId the folder ID to list children of
	 * @param {DriveKey} driveKey the drive key used for drive and folder data decryption and file key derivation
	 * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
	 * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
	 * @param {ArweaveAddress} owner the arweave address of the wallet which owns the drive
	 * @param withPathsFactory a factory function used to map the returned entities into
	 * @returns {Promise<(ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths)[]>} an array representation of the children and parent folder
	 */
	async listPrivateFolder({
		folderId,
		driveKey,
		maxDepth,
		includeRoot,
		owner,
		withPathsFactory = privateEntityWithPathsKeylessFactory
	}: ArFSListPrivateFolderParams): Promise<(ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths)[]> {
		if (!Number.isInteger(maxDepth) || maxDepth < 0) {
			throw new Error('maxDepth should be a non-negative integer!');
		}

		const folder = await this.getPrivateFolder(folderId, driveKey, owner);

		// Fetch all of the folder entities within the drive
		const { hierarchy, childFiles, childFolders } = await this.separatedHierarchyOfFolder(
			folder,
			owner,
			driveKey,
			maxDepth
		);

		if (includeRoot) {
			childFolders.unshift(folder);
		}

		const children: (ArFSPrivateFolder | ArFSPrivateFile)[] = [];
		for (const en of childFolders) {
			children.push(en);
		}
		for (const en of childFiles) {
			children.push(en);
		}

		const entitiesWithPath = children.map((entity) => withPathsFactory(entity, hierarchy, driveKey));
		return entitiesWithPath;
	}

	async assertValidPassword(password: string): Promise<void> {
		const wallet = this.wallet;
		const walletAddress = await wallet.getAddress();
		const query = buildQuery({
			tags: [
				{ name: 'Entity-Type', value: 'drive' },
				{ name: 'Drive-Privacy', value: 'private' }
			],
			owner: walletAddress,
			sort: ASCENDING_ORDER
		});
		const transactions = await this.gatewayApi.gqlRequest(query);
		const { edges } = transactions;
		if (!edges.length) {
			// No drive has been created for this wallet
			return;
		}
		const { node }: { node: GQLNodeInterface } = edges[0];
		const safeDriveBuilder = SafeArFSDriveBuilder.fromArweaveNode(
			node,
			this.gatewayApi,
			new PrivateKeyData({ password, wallet: this.wallet as JWKWallet })
		);
		const safelyBuiltDrive = await safeDriveBuilder.build();
		if (
			safelyBuiltDrive.name === ENCRYPTED_DATA_PLACEHOLDER ||
			`${safelyBuiltDrive.rootFolderId}` === ENCRYPTED_DATA_PLACEHOLDER
		) {
			throw new Error(`Invalid password! Please type the same as your other private drives!`);
		}
	}

	async getPrivateTransactionCipherIV(txId: TransactionID): Promise<CipherIV> {
		const results = await this.getCipherIVOfPrivateTransactionIDs([txId]);
		if (results.length !== 1) {
			throw new Error(`Could not fetch the CipherIV for transaction with id: ${txId}`);
		}
		const [fileCipherIvResult] = results;
		return fileCipherIvResult.cipherIV;
	}

	async getCipherIVOfPrivateTransactionIDs(txIDs: TransactionID[]): Promise<CipherIVQueryResult[]> {
		const result: CipherIVQueryResult[] = [];
		const wallet = this.wallet;
		const walletAddress = await wallet.getAddress();
		let cursor = '';
		let hasNextPage = true;
		while (hasNextPage) {
			const query = buildQuery({
				tags: [],
				owner: walletAddress,
				ids: txIDs,
				cursor
			});
			const transactions = await this.gatewayApi.gqlRequest(query);
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			if (!edges.length) {
				throw new Error(`No such private transactions with IDs: "${txIDs}"`);
			}
			edges.forEach((edge) => {
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				const txId = TxID(node.id);
				const cipherIVTag = tags.find((tag) => tag.name === 'Cipher-IV');
				if (!cipherIVTag) {
					throw new Error("The private file doesn't have a valid Cipher-IV");
				}
				const cipherIV = cipherIVTag.value;
				result.push({ txId, cipherIV });
			});
		}
		return result;
	}

	/**
	 * Returns the data stream of a private file
	 * @param privateFile - the entity of the data to be download
	 * @returns {Promise<Readable>}
	 */
	async getPrivateDataStream(privateFile: ArFSPrivateFile): Promise<Readable> {
		const dataLength = privateFile.encryptedDataSize;
		const authTagIndex = +dataLength - authTagLength;
		const dataTxUrl = `${gatewayUrlForArweave(this.arweave).href}${privateFile.dataTxId}`;
		const requestConfig: AxiosRequestConfig = {
			method: 'get',
			url: dataTxUrl,
			responseType: 'stream',
			headers: {
				Range: `bytes=0-${+authTagIndex - 1}`
			}
		};
		const response = await axios(requestConfig);
		return response.data;
	}

	async getAuthTagForPrivateFile(privateFile: ArFSPrivateFile): Promise<Buffer> {
		const dataLength = privateFile.encryptedDataSize;
		const authTagIndex = +dataLength - authTagLength;
		const response = await axios({
			method: 'GET',
			url: `${gatewayUrlForArweave(this.arweave).href}${privateFile.dataTxId}`,
			headers: {
				Range: `bytes=${authTagIndex}-${+dataLength - 1}`
			},
			responseType: 'arraybuffer'
		});
		const { data }: { data: Buffer } = response;
		if (data.length === authTagLength) {
			return data;
		}
		throw new Error(
			`The retrieved auth tag does not have the length of ${authTagLength} bytes, but instead: ${data.length}`
		);
	}

	public async renamePublicFile({
		file,
		newName,
		metadataRewardSettings
	}: ArFSRenamePublicFileParams): Promise<ArFSRenamePublicFileResult> {
		const entityId = file.fileId;
		const objectMetaData = new ArFSPublicFileMetaDataPrototype(
			new ArFSPublicFileMetadataTransactionData(
				newName,
				file.size,
				file.lastModifiedDate,
				file.dataTxId,
				file.dataContentType,
				file.customMetaDataJson
			),
			file.driveId,
			entityId,
			file.parentFolderId,
			file.customMetaDataGqlTags
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			objectMetaData,
			metadataRewardSettings
		);

		// Invalidate any cached entry
		const owner = await this.getDriveOwnerForFileId(entityId);
		this.caches.publicFileCache.remove({ fileId: entityId, owner });

		return {
			entityId,
			metaDataTxId: id,
			metaDataTxReward: metadataRewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	public async renamePrivateFile({
		file,
		newName,
		metadataRewardSettings,
		driveKey
	}: ArFSRenamePrivateFileParams): Promise<ArFSRenamePrivateFileResult> {
		const entityId = file.fileId;
		const objectMetaData = new ArFSPrivateFileMetaDataPrototype(
			await ArFSPrivateFileMetadataTransactionData.from(
				newName,
				file.size,
				file.lastModifiedDate,
				file.dataTxId,
				file.dataContentType,
				entityId,
				driveKey,
				file.customMetaDataJson
			),
			file.driveId,
			entityId,
			file.parentFolderId,
			file.customMetaDataGqlTags
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			objectMetaData,
			metadataRewardSettings
		);

		// Invalidate any cached entry
		const owner = await this.getDriveOwnerForFileId(entityId);
		this.caches.privateFileCache.remove({ fileId: entityId, fileKey: file.fileKey, owner });

		return {
			entityId,
			metaDataTxId: id,
			metaDataTxReward: metadataRewardSettings?.reward,
			fileKey: file.fileKey,
			dataCaches,
			fastFinalityIndexes
		};
	}

	public async renamePublicFolder({
		folder,
		newName,
		metadataRewardSettings
	}: ArFSRenamePublicFolderParams): Promise<ArFSRenamePublicFolderResult> {
		const objectMetaData = new ArFSPublicFolderMetaDataPrototype(
			new ArFSPublicFolderTransactionData(newName, folder.customMetaDataJson),
			folder.driveId,
			folder.entityId,
			folder.parentFolderId,
			folder.customMetaDataGqlTags
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			objectMetaData,
			metadataRewardSettings
		);

		// Invalidate any cached entry
		const owner = await this.getDriveOwnerForFolderId(folder.entityId);
		this.caches.publicFolderCache.remove({ folderId: folder.entityId, owner });

		return {
			entityId: folder.folderId,
			metaDataTxId: id,
			metaDataTxReward: metadataRewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	public async renamePrivateFolder({
		folder,
		newName,
		metadataRewardSettings,
		driveKey
	}: ArFSRenamePrivateFolderParams): Promise<ArFSRenamePrivateFolderResult> {
		const objectMetaData = new ArFSPrivateFolderMetaDataPrototype(
			folder.driveId,
			folder.entityId,
			await ArFSPrivateFolderTransactionData.from(newName, driveKey, folder.customMetaDataJson),
			folder.parentFolderId,
			folder.customMetaDataGqlTags
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			objectMetaData,
			metadataRewardSettings
		);

		// Invalidate any cached entry
		const owner = await this.getDriveOwnerForFolderId(folder.entityId);
		this.caches.privateFolderCache.remove({ folderId: folder.entityId, owner, driveKey });

		return {
			entityId: folder.folderId,
			metaDataTxId: id,
			metaDataTxReward: metadataRewardSettings?.reward,
			driveKey,
			dataCaches,
			fastFinalityIndexes
		};
	}

	public async renamePublicDrive({
		drive,
		newName,
		metadataRewardSettings
	}: ArFSRenamePublicDriveParams): Promise<ArFSRenamePublicDriveResult> {
		const objectMetaData = new ArFSPublicDriveMetaDataPrototype(
			new ArFSPublicDriveTransactionData(newName, drive.rootFolderId, drive.customMetaDataJson),
			drive.driveId,
			drive.customMetaDataGqlTags
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			objectMetaData,
			metadataRewardSettings
		);

		// Invalidate any cached entry
		const owner = await this.getOwnerForDriveId(drive.driveId);
		this.caches.publicDriveCache.remove({ driveId: drive.driveId, owner });

		return {
			entityId: drive.driveId,
			metaDataTxId: id,
			metaDataTxReward: metadataRewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	public async renamePrivateDrive({
		drive,
		newName,
		metadataRewardSettings,
		driveKey
	}: ArFSRenamePrivateDriveParams): Promise<ArFSRenamePrivateDriveResult> {
		const objectMetaData = new ArFSPrivateDriveMetaDataPrototype(
			drive.driveId,
			await ArFSPrivateDriveTransactionData.from(newName, drive.rootFolderId, driveKey, drive.customMetaDataJson),
			drive.customMetaDataGqlTags
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			objectMetaData,
			metadataRewardSettings
		);

		// Invalidate any cached entry
		const owner = await this.getOwnerForDriveId(drive.driveId);
		this.caches.privateDriveCache.remove({ driveId: drive.driveId, owner, driveKey });

		return {
			entityId: drive.driveId,
			metaDataTxId: id,
			metaDataTxReward: metadataRewardSettings?.reward,
			driveKey,
			dataCaches,
			fastFinalityIndexes
		};
	}

	async downloadPrivateFolder({
		folderId,
		destFolderPath,
		customFolderName,
		maxDepth,
		driveKey,
		owner
	}: ArFSDownloadPrivateFolderParams): Promise<void> {
		const privateFolder = await this.getPrivateFolder(folderId, driveKey, owner);

		// Fetch all file and folder entities within all Folders of the drive
		const { hierarchy, childFiles, childFolders } = await this.separatedHierarchyOfFolder(
			privateFolder,
			owner,
			driveKey,
			maxDepth
		);
		const folderWrapper = new ArFSFolderToDownload(
			privateEntityWithPathsKeylessFactory(privateFolder, hierarchy),
			customFolderName
		);

		// Fetch the file CipherIVs
		const fileDataTxIDs = childFiles.map((file) => file.dataTxId);
		const fileCipherIVResults = await this.getCipherIVOfPrivateTransactionIDs(fileDataTxIDs);
		const cipherIVMap: Record<string, CipherIVQueryResult> = fileCipherIVResults.reduce((accumulator, ivResult) => {
			return Object.assign(accumulator, { [`${ivResult.txId}`]: ivResult });
		}, {});

		const foldersWithPath = [privateFolder, ...childFolders]
			.map((folder) => privateEntityWithPathsKeylessFactory(folder, hierarchy))
			.sort((a, b) => alphabeticalOrder(a.path, b.path));

		// Iteratively download all child files in the hierarchy
		for (const folder of foldersWithPath) {
			// assert the existence of the folder on disk
			const relativeFolderPath = folderWrapper.getRelativePathOf(folder.path);
			const absoluteLocalFolderPath = joinPath(destFolderPath, relativeFolderPath);
			folderWrapper.ensureFolderExistence(absoluteLocalFolderPath);

			// download child files into the folder
			const childrenFiles = childFiles.filter(
				(file) => `${file.parentFolderId}` === `${folder.entityId}` /* FIXME: use the `equals` method */
			);
			for (const file of childrenFiles) {
				const relativeFilePath = folderWrapper.getRelativePathOf(
					privateEntityWithPathsKeylessFactory(file, hierarchy).path
				);
				const absoluteLocalFilePath = joinPath(destFolderPath, relativeFilePath);

				/*
				 * FIXME: Downloading all files at once consumes a lot of resources.
				 * TODO: Implement a download manager for downloading in parallel
				 * Doing it sequentially for now
				 */
				const dataStream = await this.getPrivateDataStream(file);
				const fileKey = await deriveFileKey(`${file.fileId}`, driveKey);
				const fileCipherIVResult = cipherIVMap[`${file.dataTxId}`];
				if (!fileCipherIVResult) {
					throw new Error(`Could not find the CipherIV for the private file with ID ${file.fileId}`);
				}
				const authTag = await this.getAuthTagForPrivateFile(file);
				const decryptingStream = new StreamDecrypt(fileCipherIVResult.cipherIV, fileKey, authTag);
				const fileWrapper = new ArFSPrivateFileToDownload(
					file,
					dataStream,
					absoluteLocalFilePath,
					decryptingStream
				);
				await fileWrapper.write();
			}
		}
	}

	async separatedHierarchyOfFolder(
		folder: ArFSPrivateFolder,
		owner: ArweaveAddress,
		driveKey: DriveKey,
		maxDepth: number
	): Promise<SeparatedFolderHierarchy<ArFSPrivateFile, ArFSPrivateFolder>> {
		// Fetch all of the folder entities within the drive
		const driveIdOfFolder = folder.driveId;
		const allFolderEntitiesOfDrive = await this.getAllFoldersOfPrivateDrive({
			driveId: driveIdOfFolder,
			owner,
			latestRevisionsOnly: true,
			driveKey
		});

		// Feed entities to FolderHierarchy
		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(folder.entityId, maxDepth);

		// Fetch all file entities within all Folders of the drive
		const childFiles: ArFSPrivateFile[] = [];
		for (const id of searchFolderIDs) {
			(await this.getPrivateFilesWithParentFolderIds([id], driveKey, owner, driveIdOfFolder, true)).forEach(
				(e) => {
					childFiles.push(e);
				}
			);
		}

		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(folder.entityId, maxDepth + 1);
		const childFolders = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.some((folderId) => `${folderId}` === `${folder.entityId}` /* FIXME: use the `equals` method */)
		);

		return { hierarchy, childFiles, childFolders };
	}

	getManifestLinks(dataTxId: TransactionID, manifest: ArFSManifestToUpload): string[] {
		return manifest.getLinksOutput(dataTxId, gatewayUrlForArweave(this.arweave));
	}
}
