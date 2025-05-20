import { ArDriveAnonymous } from './ardrive_anonymous';
import {
	ArFSPrivateDrive,
	ArFSPrivateFolder,
	ArFSPrivateFile,
	ArFSPrivateFolderKeyless,
	ArFSPrivateFileKeyless,
	ArFSPrivateFolderWithPaths,
	ArFSPrivateFileWithPaths,
	privateEntityWithPathsFactory,
	privateEntityWithPathsKeylessFactory,
	ArFSPrivateDriveKeyless,
	ArFSPublicFile
} from './arfs/arfs_entities';
import { ArFSPrivateFileToDownload, ArFSManifestToUpload, ArFSFileToUpload } from './arfs/arfs_file_wrapper';
import {
	ArFSPublicFileMetadataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSFileMetadataTransactionData,
	ArFSObjectTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPrivateDriveTransactionData
} from './arfs/tx/arfs_tx_data_types';
import { ArFSDAO } from './arfs/arfsdao';
import { CommunityOracle } from './community/community_oracle';
import { deriveFileKey } from './utils/crypto';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import {
	FeeMultiple,
	ArweaveAddress,
	ByteCount,
	AR,
	FolderID,
	Winston,
	FileID,
	DriveID,
	UploadPublicFileParams,
	UploadPrivateFileParams,
	ArFSManifestResult,
	UploadPublicManifestParams,
	DownloadPrivateFileParameters,
	DownloadPrivateFolderParameters,
	DownloadPrivateDriveParameters,
	errorOnConflict,
	upsertOnConflicts,
	UploadAllEntitiesParams,
	FolderConflictPrompts,
	emptyManifestResult,
	UploadStats,
	ArFSDownloadPrivateFolderParams,
	ResolveBulkConflictsParams,
	skipOnConflicts,
	RenamePublicFileParams,
	RenamePrivateFileParams,
	RenamePublicFolderParams,
	RenamePrivateFolderParams,
	CommunityTipParams,
	TipResult,
	MovePublicFileParams,
	ArFSResult,
	MovePrivateFileParams,
	MovePublicFolderParams,
	MovePrivateFolderParams,
	BulkPublicUploadParams,
	BulkPrivateUploadParams,
	CreatePublicFolderParams,
	CreatePrivateFolderParams,
	CreatePublicDriveParams,
	CreatePrivateDriveParams,
	GetPrivateDriveParams,
	GetPrivateFolderParams,
	GetPrivateFileParams,
	ListPrivateFolderParams,
	MetaDataBaseCosts,
	RenamePublicDriveParams,
	RenamePrivateDriveParams,
	W,
	TransactionID,
	ArFSFees,
	ArFSCreateFileMetaDataV2Plan,
	RewardSettings,
	FileNameConflictResolution,
	RetryPublicArFSFileParams,
	RetryPublicArFSFileByFileIdParams,
	RetryPublicArFSFileByDestFolderIdParams,
	emptyArFSResult,
	DriveSignatureInfo,
	DriveKey,
	GetDriveSignatureInfoParameters
} from './types';
import { errorMessage } from './utils/error_message';
import { Wallet } from './wallet';
import { WalletDAO } from './wallet_dao';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from './utils/constants';
import { StreamDecrypt } from './utils/stream_decrypt';
import { assertFolderExists } from './utils/assert_folder';
import { join as joinPath } from 'path';
import {
	assertLocalNameConflicts,
	resolveFileNameConflicts,
	resolveFolderNameConflicts
} from './utils/upload_conflict_resolution';
import { ArFSCreateBundledDriveResult, ArFSCreateDriveResult, isBundleResult } from './arfs/arfs_entity_result_factory';
import { ArFSUploadPlanner, UploadPlanner } from './arfs/arfs_upload_planner';
import { CreateDriveRewardSettings, EstimateCreateDriveParams } from './types/upload_planner_types';
import {
	getPrivateCreateDriveEstimationPrototypes,
	getPublicCreateDriveEstimationPrototypes,
	getPublicUploadFileEstimationPrototype
} from './pricing/estimation_prototypes';
import { ArFSTagSettings } from './arfs/arfs_tag_settings';
import { ARDataPriceNetworkEstimator } from './pricing/ar_data_price_network_estimator';
import { ROOT_FOLDER_ID_PLACEHOLDER } from './arfs/arfs_builders/arfs_folder_builders';
import { ArFSCostCalculator, CostCalculator } from './arfs/arfs_cost_calculator';
import {
	assertValidArFSDriveName,
	assertValidArFSFileName,
	assertValidArFSFolderName,
	assertArFSCompliantNamesWithinFolder
} from './arfs/arfs_entity_name_validators';

export class ArDrive extends ArDriveAnonymous {
	constructor(
		private readonly wallet: Wallet,
		private readonly walletDao: WalletDAO,
		protected readonly arFsDao: ArFSDAO,
		private readonly communityOracle: CommunityOracle,
		/** @deprecated App Name should be provided with ArFSTagSettings  */
		protected readonly appName: string = DEFAULT_APP_NAME,
		/** @deprecated App Version should be provided with ArFSTagSettings  */
		protected readonly appVersion: string = DEFAULT_APP_VERSION,
		private readonly priceEstimator: ARDataPriceEstimator = new ARDataPriceNetworkEstimator(),
		private readonly feeMultiple: FeeMultiple = new FeeMultiple(1.0),
		private readonly dryRun: boolean = false,
		private readonly arFSTagSettings: ArFSTagSettings = new ArFSTagSettings({ appName, appVersion }),
		private readonly uploadPlanner: UploadPlanner = new ArFSUploadPlanner({
			priceEstimator,
			arFSTagSettings: arFSTagSettings,
			feeMultiple,
			communityOracle
		}),
		private readonly costCalculator: CostCalculator = new ArFSCostCalculator({
			communityOracle,
			feeMultiple,
			priceEstimator
		})
	) {
		super(arFsDao);
	}

	/**
	 * @deprecated Sending separate layer 1 community tips is discouraged due
	 *  to concerns with network congestion. We find it safer to place the tip
	 *  on the layer 1 data transaction or bundle transaction. This also prevents
	 *  separation of file data and tip payment
	 *
	 * @remarks Presumes that there's a sufficient wallet balance
	 */
	async sendCommunityTip({ communityWinstonTip, assertBalance = false }: CommunityTipParams): Promise<TipResult> {
		let tokenHolder: ArweaveAddress;
		try {
			tokenHolder = await this.communityOracle.selectTokenHolder();
		} catch (error) {
			console.error(`Failed to select token holder: ${error}. Cannot send community tip.`);
			throw new Error('Failed to select a token holder to receive the community tip.');
		}
		const arTransferBaseFee = await this.priceEstimator.getBaseWinstonPriceForByteCount(new ByteCount(0));

		const transferResult = await this.walletDao.sendARToAddress(
			new AR(communityWinstonTip),
			this.wallet,
			tokenHolder,
			{ reward: arTransferBaseFee, feeMultiple: this.feeMultiple },
			this.dryRun,
			this.arFSTagSettings.getTipTagsWithAppTags(),
			assertBalance
		);

		return {
			tipData: { txId: transferResult.txID, recipient: tokenHolder, winston: communityWinstonTip },
			reward: transferResult.reward
		};
	}

	public async movePublicFile({ fileId, newParentFolderId }: MovePublicFileParams): Promise<ArFSResult> {
		const destFolderDriveId = await this.arFsDao.getDriveIdForFolderId(newParentFolderId);

		const owner = await this.wallet.getAddress();
		const originalFileMetaData = await this.getPublicFile({ fileId });

		if (!destFolderDriveId.equals(originalFileMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFileMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('File', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPublicEntityNamesInFolder(
			newParentFolderId,
			owner,
			destFolderDriveId
		);
		if (entityNamesInParentFolder.includes(originalFileMetaData.name)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		const fileTransactionData = new ArFSPublicFileMetadataTransactionData(
			originalFileMetaData.name,
			originalFileMetaData.size,
			originalFileMetaData.lastModifiedDate,
			originalFileMetaData.dataTxId,
			originalFileMetaData.dataContentType,
			originalFileMetaData.customMetaDataJson
		);

		const fileMetaDataBaseReward = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfMoveFile(fileTransactionData)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		// Move file will create a new meta data tx with identical meta data except for a new parentFolderId
		const {
			dataTxId,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.movePublicFile({
			originalMetaData: originalFileMetaData,
			transactionData: fileTransactionData,
			newParentFolderId,
			metaDataBaseReward: fileMetaDataBaseReward
		});

		const result: ArFSResult = {
			created: [
				{
					type: 'file',
					metadataTxId: metaDataTxId,
					dataTxId: dataTxId,
					entityId: fileId,
					entityName: originalFileMetaData.name,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			result.fees = {
				[`${metaDataTxId}`]: metaDataTxReward
			};
		}
		return result;
	}

	public async movePrivateFile({ fileId, newParentFolderId, driveKey }: MovePrivateFileParams): Promise<ArFSResult> {
		const destFolderDriveId = await this.arFsDao.getDriveIdForFolderId(newParentFolderId);

		const owner = await this.wallet.getAddress();
		const originalFileMetaData = await this.getPrivateFile({ fileId, driveKey });

		if (!destFolderDriveId.equals(originalFileMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFileMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('File', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPrivateEntityNamesInFolder(
			newParentFolderId,
			owner,
			driveKey,
			destFolderDriveId
		);
		if (entityNamesInParentFolder.includes(originalFileMetaData.name)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		const fileTransactionData = await ArFSPrivateFileMetadataTransactionData.from(
			originalFileMetaData.name,
			originalFileMetaData.size,
			originalFileMetaData.lastModifiedDate,
			originalFileMetaData.dataTxId,
			originalFileMetaData.dataContentType,
			fileId,
			driveKey,
			originalFileMetaData.customMetaDataJson
		);

		const fileMetaDataBaseReward = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfMoveFile(fileTransactionData)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		// Move file will create a new meta data tx with identical meta data except for a new parentFolderId
		const {
			dataTxId,
			fileKey,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.movePrivateFile({
			originalMetaData: originalFileMetaData,
			transactionData: fileTransactionData,
			newParentFolderId,
			metaDataBaseReward: fileMetaDataBaseReward
		});

		const result: ArFSResult = {
			created: [
				{
					type: 'file',
					metadataTxId: metaDataTxId,
					dataTxId: dataTxId,
					entityId: fileId,
					key: fileKey,
					entityName: originalFileMetaData.name,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			result.fees = {
				[`${metaDataTxId}`]: metaDataTxReward
			};
		}
		return result;
	}

	public async movePublicFolder({ folderId, newParentFolderId }: MovePublicFolderParams): Promise<ArFSResult> {
		if (folderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.folderCannotMoveIntoItself);
		}

		const destFolderDriveId = await this.arFsDao.getDriveIdForFolderId(newParentFolderId);

		const owner = await this.wallet.getAddress();
		const originalFolderMetaData = await this.getPublicFolder({ folderId });

		if (!destFolderDriveId.equals(originalFolderMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFolderMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('Folder', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPublicEntityNamesInFolder(
			newParentFolderId,
			owner,
			destFolderDriveId
		);
		if (entityNamesInParentFolder.includes(originalFolderMetaData.name)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		const childrenFolderIds = await this.arFsDao.getPublicChildrenFolderIds({
			folderId,
			driveId: destFolderDriveId,
			owner
		});

		if (childrenFolderIds.some((fid) => fid.equals(newParentFolderId))) {
			throw new Error(errorMessage.cannotMoveParentIntoChildFolder);
		}

		const folderTransactionData = new ArFSPublicFolderTransactionData(
			originalFolderMetaData.name,
			originalFolderMetaData.customMetaDataJson
		);
		const folderMetaDataBaseReward = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(folderTransactionData)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		// Move folder will create a new meta data tx with identical meta data except for a new parentFolderId
		const { metaDataTxId, dataCaches, fastFinalityIndexes, metaDataTxReward } = await this.arFsDao.movePublicFolder(
			{
				originalMetaData: originalFolderMetaData,
				transactionData: folderTransactionData,
				newParentFolderId,
				metaDataBaseReward: folderMetaDataBaseReward
			}
		);

		const result: ArFSResult = {
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: folderId,
					entityName: originalFolderMetaData.name,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			result.fees = {
				[`${metaDataTxId}`]: metaDataTxReward
			};
		}
		return result;
	}

	public async movePrivateFolder({
		folderId,
		newParentFolderId,
		driveKey
	}: MovePrivateFolderParams): Promise<ArFSResult> {
		if (folderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.folderCannotMoveIntoItself);
		}

		const destFolderDriveId = await this.arFsDao.getDriveIdForFolderId(newParentFolderId);

		const owner = await this.wallet.getAddress();
		const originalFolderMetaData = await this.getPrivateFolder({ folderId, driveKey });

		if (!destFolderDriveId.equals(originalFolderMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFolderMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('Folder', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPrivateEntityNamesInFolder(
			newParentFolderId,
			owner,
			driveKey,
			destFolderDriveId
		);
		if (entityNamesInParentFolder.includes(originalFolderMetaData.name)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		const childrenFolderIds = await this.arFsDao.getPrivateChildrenFolderIds({
			folderId,
			driveId: destFolderDriveId,
			driveKey,
			owner
		});

		if (childrenFolderIds.some((fid) => fid.equals(newParentFolderId))) {
			throw new Error(errorMessage.cannotMoveParentIntoChildFolder);
		}

		const folderTransactionData = await ArFSPrivateFolderTransactionData.from(
			originalFolderMetaData.name,
			driveKey,
			originalFolderMetaData.customMetaDataJson
		);
		const folderMetaDataBaseReward = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(folderTransactionData)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		// Move folder will create a new meta data tx with identical meta data except for a new parentFolderId
		const {
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.movePrivateFolder({
			originalMetaData: originalFolderMetaData,
			transactionData: folderTransactionData,
			newParentFolderId,
			metaDataBaseReward: folderMetaDataBaseReward
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: folderId,
					key: driveKey,
					entityName: originalFolderMetaData.name,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = {
				[`${metaDataTxId}`]: metaDataTxReward
			};
		}
		return arFSResult;
	}

	/**
	 * Utility method to resolve any name conflicts for a bulk upload
	 *
	 * @returns An array of upload stats that have had their name conflicts resolved
	 */
	private async resolveBulkNameConflicts({
		entitiesToUpload,
		conflictResolution,
		prompts
	}: ResolveBulkConflictsParams): Promise<UploadStats[]> {
		// First, assert any name conflicts within the upload itself
		assertLocalNameConflicts(entitiesToUpload);

		/** Accumulate resolved entities to pass back to the bulk upload method  */
		const resolvedEntitiesToUpload: UploadStats[] = [];

		for (const entity of entitiesToUpload) {
			const { destFolderId, wrappedEntity, driveKey, owner, destName, destDriveId } = entity;

			const resolveConflictParams = {
				conflictResolution,
				getConflictInfoFn: (folderId: FolderID) =>
					driveKey
						? this.arFsDao.getPrivateNameConflictInfoInFolder(folderId, owner, driveKey, destDriveId)
						: this.arFsDao.getPublicNameConflictInfoInFolder(folderId, owner, destDriveId),
				prompts,
				destFolderId
			};

			const destinationName = destName ?? wrappedEntity.destinationBaseName;

			if (wrappedEntity.entityType === 'folder') {
				assertArFSCompliantNamesWithinFolder(wrappedEntity, destinationName);

				await resolveFolderNameConflicts({
					wrappedFolder: wrappedEntity,
					destinationFolderName: destinationName,
					...resolveConflictParams
				});
			} else {
				assertValidArFSFileName(destinationName);

				await resolveFileNameConflicts({
					wrappedFile: wrappedEntity,
					destinationFileName: destinationName,
					...resolveConflictParams
				});
			}

			switch (wrappedEntity.conflictResolution) {
				case errorOnConflict:
					throw new Error(errorMessage.entityNameExists);

				case skipOnConflicts:
					// Skip this folder without error, continue with other bulk upload paths
					break;

				case undefined:
					// Conflicts are resolved, add this entity to the accumulating entitiesToUpload
					resolvedEntitiesToUpload.push({ ...entity, wrappedEntity });
					break;
			}
		}

		return resolvedEntitiesToUpload;
	}

	/**
	 * Upload any number of entities, each to their own destination folder and with their own potential driveKeys
	 *
	 * @remarks The presence of a drive key on the entitiesToUpload determines the privacy of each upload
	 */
	public async uploadAllEntities({
		entitiesToUpload,
		conflictResolution = upsertOnConflicts,
		prompts
	}: UploadAllEntitiesParams): Promise<ArFSResult> {
		const preparedEntities: UploadStats[] = [];

		for (const entity of entitiesToUpload) {
			const { destFolderId } = entity;
			const destDriveId = await this.arFsDao.getDriveIdForFolderId(destFolderId);
			const owner = await this.wallet.getAddress();

			// Assert that the drive has the correct privacy settings
			await this.arFsDao.assertDrivePrivacy(destDriveId, owner, entity.driveKey);

			preparedEntities.push({ ...entity, destDriveId, owner });
		}

		const resolvedEntities = await this.resolveBulkNameConflicts({
			entitiesToUpload: preparedEntities,
			conflictResolution,
			prompts
		});

		const results = this.uploadPlanner.isTurboUpload()
			? await this.arFsDao.uploadAllEntitiesToTurbo(resolvedEntities)
			: await (async () => {
					// Plan the upload
					const uploadPlan = await this.uploadPlanner.planUploadAllEntities(resolvedEntities);

					// Calculate rewardSettings and communityTipSettings for each upload plan
					const calculatedPlan = await this.costCalculator.calculateCostsForUploadPlan(uploadPlan);

					// Assert balance for total winston price of upload
					await this.assertWalletBalance(calculatedPlan.totalWinstonPrice);

					// Send calculated uploadPlan to ArFSDAO to consume
					return this.arFsDao.uploadAllEntities(calculatedPlan.calculatedUploadPlan);
			  })();

		const arFSResult: ArFSResult = {
			created: [],
			tips: [],
			fees: {}
		};

		// Add folder results
		for (const {
			entityId,
			folderTxId,
			driveKey,
			folderMetaDataReward,
			entityName,
			bundledIn,
			sourceUri,
			dataCaches,
			fastFinalityIndexes
		} of results.folderResults) {
			arFSResult.created.push({
				type: 'folder',
				entityId,
				metadataTxId: folderTxId,
				key: driveKey,
				bundledIn,
				entityName,
				sourceUri,
				dataCaches,
				fastFinalityIndexes
			});

			if (folderMetaDataReward) {
				arFSResult.fees = { ...arFSResult.fees, [`${folderTxId}`]: folderMetaDataReward };
			}
		}

		// Add file results
		for (const {
			fileDataTxId,
			entityId,
			metaDataTxId,
			fileDataReward,
			fileKey,
			fileMetaDataReward,
			communityTipSettings,
			bundledIn,
			entityName,
			sourceUri,
			dataCaches,
			fastFinalityIndexes
		} of results.fileResults) {
			arFSResult.created.push({
				type: 'file',
				entityName,
				entityId,
				dataTxId: fileDataTxId,
				metadataTxId: metaDataTxId,
				bundledIn,
				sourceUri,
				key: fileKey ? fileKey : undefined,
				dataCaches,
				fastFinalityIndexes
			});

			if (communityTipSettings) {
				arFSResult.tips.push({
					recipient: communityTipSettings.communityTipTarget,
					txId: fileDataTxId,
					winston: communityTipSettings.communityWinstonTip
				});
			}
			if (fileDataReward) {
				arFSResult.fees = { ...arFSResult.fees, [`${fileDataTxId}`]: fileDataReward };
			}
			if (fileMetaDataReward) {
				arFSResult.fees = { ...arFSResult.fees, [`${metaDataTxId}`]: fileMetaDataReward };
			}
		}

		// Add bundle results
		for (const { bundleTxId, bundleReward, communityTipSettings } of results.bundleResults) {
			arFSResult.created.push({ type: 'bundle', bundleTxId });
			if (communityTipSettings) {
				arFSResult.tips.push({
					recipient: communityTipSettings.communityTipTarget,
					txId: bundleTxId,
					winston: communityTipSettings.communityWinstonTip
				});
			}

			if (bundleReward) {
				arFSResult.fees = { ...arFSResult.fees, [`${bundleTxId}`]: bundleReward };
			}
		}

		return arFSResult;
	}

	public async retryPublicArFSFileUploadByFileId({
		dataTxId,
		wrappedFile,
		fileId
	}: RetryPublicArFSFileByFileIdParams): Promise<ArFSResult> {
		const metaDataTxId = await this.deriveMetaDataTxIdForFileId(fileId, dataTxId);

		return this.retryPublicArFSFileUpload({ dataTxId, wrappedFile, fileId, metaDataTxId });
	}

	public async retryPublicArFSFileUploadByDestFolderId({
		dataTxId,
		wrappedFile,
		conflictResolution = 'upsert',
		destinationFolderId
	}: RetryPublicArFSFileByDestFolderIdParams): Promise<ArFSResult> {
		const metaDataTx = await this.deriveMetaDataTxFromPublicFolder(destinationFolderId, dataTxId);
		const driveId = await this.arFsDao.getDriveIdForFolderId(destinationFolderId);

		let metaDataTxId: undefined | TransactionID = undefined;
		let createMetaDataPlan: undefined | ArFSCreateFileMetaDataV2Plan = undefined;
		let fileId: undefined | FileID = undefined;

		if (metaDataTx) {
			// MetaData has been verified
			metaDataTxId = metaDataTx.txId;
			fileId = metaDataTx.fileId;
		} else {
			// Metadata has not been found, it must be created
			const isValidUpload = await this.assertWriteFileMetaData({
				wrappedFile,
				conflictResolution,
				destinationFolderId,
				driveId
			});

			if (!isValidUpload) {
				return emptyArFSResult;
			}

			createMetaDataPlan = {
				rewardSettings: await this.deriveAndAssertV2PublicFileMetaDataRewardSettings(wrappedFile),
				destinationFolderId,
				fileId: wrappedFile.existingId
			};
		}

		return this.retryPublicArFSFileUpload({ dataTxId, wrappedFile, fileId, metaDataTxId, createMetaDataPlan });
	}

	private async retryPublicArFSFileUpload({
		dataTxId,
		wrappedFile,
		fileId,
		createMetaDataPlan,
		metaDataTxId
	}: RetryPublicArFSFileParams): Promise<ArFSResult> {
		// prettier-ignore
		const { fileDataReward, communityTipSettings, newMetaDataInfo } =
			await this.arFsDao.retryV2ArFSPublicFileTransaction({
				arFSDataTxId: dataTxId,
				wrappedFile,
				createMetaDataPlan
			});

		const fees: ArFSFees = { [`${dataTxId}`]: fileDataReward };

		if (newMetaDataInfo) {
			fileId = newMetaDataInfo.fileId;
			metaDataTxId = newMetaDataInfo.metaDataTxId;
			fees[`${metaDataTxId}`] = newMetaDataInfo.fileMetaDataReward;
		}

		if (!fileId || !metaDataTxId) {
			// Provided for increased type safety, this error is considered unreachable with current code
			throw Error('MetaData Tx could not be verified or re-created!');
		}

		return {
			created: [
				{
					type: 'file',
					dataTxId,
					metadataTxId: metaDataTxId,
					entityId: fileId,
					entityName: wrappedFile.destinationBaseName,
					sourceUri: wrappedFile.sourceUri
				}
			],
			tips: [
				{
					recipient: communityTipSettings.communityTipTarget,
					txId: dataTxId,
					winston: communityTipSettings.communityWinstonTip
				}
			],
			fees
		};
	}

	private async deriveMetaDataTxIdForFileId(fileId: FileID, dataTxId: TransactionID): Promise<TransactionID> {
		const owner = await this.wallet.getAddress();
		const fileMetaData = await this.arFsDao.getPublicFile(fileId, owner);

		if (fileMetaData.dataTxId.equals(dataTxId)) {
			// This metadata tx id is verified
			return fileMetaData.txId;
		}

		throw Error(`File with id "${fileId}" has no metadata that links to dataTxId: "${dataTxId}"`);
	}

	private async deriveMetaDataTxFromPublicFolder(
		destinationFolderId: FolderID,
		dataTxId: TransactionID
	): Promise<ArFSPublicFile | undefined> {
		const owner = await this.wallet.getAddress();
		const driveId = await this.arFsDao.getDriveIdForFolderId(destinationFolderId);
		await this.assertFolderExists(destinationFolderId, owner);

		const allFileMetaDataTxInFolder = await this.arFsDao.getPublicFilesWithParentFolderIds(
			[destinationFolderId],
			owner,
			driveId
		);
		const metaDataTxsForThisTx = allFileMetaDataTxInFolder.filter((f) => `${f.dataTxId}` === `${dataTxId}`);

		if (metaDataTxsForThisTx.length > 0) {
			return metaDataTxsForThisTx[0];
		}

		return undefined;
	}

	private async assertFolderExists(destinationFolderId: FolderID, owner: ArweaveAddress) {
		try {
			await this.arFsDao.getPublicFolder(destinationFolderId, owner);
		} catch (error) {
			throw Error(`The supplied public destination folder ID (${destinationFolderId}) cannot be found!`);
		}
	}

	private async assertWriteFileMetaData({
		wrappedFile,
		destinationFolderId,
		conflictResolution,
		driveId
	}: {
		wrappedFile: ArFSFileToUpload;
		destinationFolderId: FolderID;
		conflictResolution: FileNameConflictResolution;
		driveId: DriveID;
	}): Promise<boolean> {
		const owner = await this.wallet.getAddress();
		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution,
			destFolderId: destinationFolderId,
			destinationFileName: wrappedFile.destinationBaseName,
			getConflictInfoFn: (folderId: FolderID) =>
				this.arFsDao.getPublicNameConflictInfoInFolder(folderId, owner, driveId)
		});

		if (wrappedFile.conflictResolution) {
			switch (wrappedFile.conflictResolution) {
				case 'error':
					throw Error('File names cannot conflict with a folder name in the destination folder!');

				case 'skip' || 'upsert':
					console.error(
						'File name conflicts with an existing file, with the current conflictResolution setting this upload would have be skipped. Use `replace` conflict resolution setting to override this and retry this transaction'
					);
					return false;
			}
		}

		return true;
	}

	private async deriveAndAssertV2PublicFileMetaDataRewardSettings(
		wrappedFile: ArFSFileToUpload
	): Promise<RewardSettings> {
		const fileEstimationPrototype = getPublicUploadFileEstimationPrototype(wrappedFile);

		// prettier-ignore
		const { metaDataRewardSettings, totalWinstonPrice } =
			await this.costCalculator.calculateCostForV2MetaDataUpload(fileEstimationPrototype.objectData.sizeOf());

		this.assertWalletBalance(totalWinstonPrice);

		return metaDataRewardSettings;
	}

	/** @deprecated -- Now uses the uploadAllEntities method internally. Will be removed in a future major release */
	public async uploadPublicFile({
		parentFolderId,
		wrappedFile,
		conflictResolution,
		destinationFileName,
		prompts
	}: UploadPublicFileParams): Promise<ArFSResult> {
		return this.uploadAllEntities({
			entitiesToUpload: [
				{ destFolderId: parentFolderId, wrappedEntity: wrappedFile, destName: destinationFileName }
			],
			conflictResolution,
			prompts: prompts as FolderConflictPrompts
		});
	}

	/** @deprecated -- Now uses the uploadAllEntities method internally. Will be removed in a future major release */
	public async uploadPrivateFile({
		wrappedFile,
		parentFolderId,
		prompts,
		destinationFileName,
		conflictResolution,
		driveKey
	}: UploadPrivateFileParams): Promise<ArFSResult> {
		return this.uploadAllEntities({
			entitiesToUpload: [
				{ destFolderId: parentFolderId, wrappedEntity: wrappedFile, destName: destinationFileName, driveKey }
			],
			conflictResolution,
			prompts: prompts as FolderConflictPrompts
		});
	}

	/** @deprecated -- Now uses the uploadAllEntities method internally. Will be removed in a future major release */
	public async createPublicFolderAndUploadChildren({
		parentFolderId,
		wrappedFolder,
		destParentFolderName,
		conflictResolution = upsertOnConflicts,
		prompts
	}: BulkPublicUploadParams): Promise<ArFSResult> {
		return this.uploadAllEntities({
			entitiesToUpload: [
				{ wrappedEntity: wrappedFolder, destFolderId: parentFolderId, destName: destParentFolderName }
			],
			conflictResolution,
			prompts
		});
	}

	/** @deprecated -- Now uses the uploadAllEntities method internally. Will be removed in a future major release */
	public async createPrivateFolderAndUploadChildren({
		parentFolderId,
		wrappedFolder,
		driveKey,
		destParentFolderName,
		conflictResolution = upsertOnConflicts,
		prompts
	}: BulkPrivateUploadParams): Promise<ArFSResult> {
		return this.uploadAllEntities({
			entitiesToUpload: [
				{ wrappedEntity: wrappedFolder, destFolderId: parentFolderId, destName: destParentFolderName, driveKey }
			],
			conflictResolution,
			prompts
		});
	}

	public async uploadPublicManifest({
		folderId,
		destManifestName = 'DriveManifest.json',
		maxDepth = Number.MAX_SAFE_INTEGER,
		conflictResolution = upsertOnConflicts,
		prompts
	}: UploadPublicManifestParams): Promise<ArFSManifestResult> {
		// Assert that the owner of this drive is consistent with the provided wallet
		const owner = await this.wallet.getAddress();
		const children = await this.listPublicFolder({
			folderId,
			maxDepth,
			includeRoot: true,
			owner
		});
		const arweaveManifest = new ArFSManifestToUpload(children, destManifestName);
		const uploadManifestResults = await this.uploadAllEntities({
			entitiesToUpload: [
				{
					wrappedEntity: arweaveManifest,
					destFolderId: folderId,
					destName: arweaveManifest.destinationBaseName
				}
			],
			conflictResolution,
			prompts: prompts as FolderConflictPrompts
		});

		const manifestTxId = uploadManifestResults.created[0]?.dataTxId;

		if (manifestTxId) {
			const links = this.arFsDao.getManifestLinks(manifestTxId, arweaveManifest);

			return {
				...uploadManifestResults,
				manifest: arweaveManifest.manifest,
				links
			};
		}

		// ArFSResult was empty, return expected empty manifest result
		return emptyManifestResult;
	}

	public async createPublicFolder({ folderName, parentFolderId }: CreatePublicFolderParams): Promise<ArFSResult> {
		assertValidArFSFolderName(folderName);

		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);
		const owner = await this.wallet.getAddress();

		// Assert that the drive is public
		await this.arFsDao.assertDrivePrivacy(driveId, owner);

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPublicEntityNamesInFolder(
			parentFolderId,
			owner,
			driveId
		);
		if (entityNamesInParentFolder.includes(folderName)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		// Assert that there's enough AR available in the wallet
		const folderData = new ArFSPublicFolderTransactionData(folderName);
		const rewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(folderData)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		// Create the folder and retrieve its folder ID
		const {
			metaDataTxId: metaDataTxId,
			metaDataTxReward: metaDataTxReward,
			folderId,
			dataCaches,
			fastFinalityIndexes
		} = await this.arFsDao.createPublicFolder({
			folderData,
			driveId,
			rewardSettings,
			parentFolderId
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: folderId,
					entityName: folderName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}
		return arFSResult;
	}

	public async createPrivateFolder({
		folderName,
		driveKey,
		parentFolderId
	}: CreatePrivateFolderParams): Promise<ArFSResult> {
		assertValidArFSFolderName(folderName);

		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);
		const owner = await this.wallet.getAddress();

		// Assert that the drive is private
		await this.arFsDao.assertDrivePrivacy(driveId, owner, driveKey);

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPrivateEntityNamesInFolder(
			parentFolderId,
			owner,
			driveKey,
			driveId
		);
		if (entityNamesInParentFolder.includes(folderName)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		// Assert that there's enough AR available in the wallet
		const folderData = await ArFSPrivateFolderTransactionData.from(folderName, driveKey);
		const rewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(folderData)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		// Create the folder and retrieve its folder ID
		const {
			metaDataTxId: metaDataTxId,
			metaDataTxReward: metaDataTxReward,
			folderId,
			dataCaches,
			fastFinalityIndexes
		} = await this.arFsDao.createPrivateFolder({
			folderData,
			driveId,
			rewardSettings,
			parentFolderId
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: folderId,
					key: driveKey,
					entityName: folderName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}
		return arFSResult;
	}

	private async createDrive(
		arFSPrototypes: EstimateCreateDriveParams,
		arFSCreateDrive: (
			rewardSettings: CreateDriveRewardSettings
		) => Promise<ArFSCreateDriveResult | ArFSCreateBundledDriveResult>
	): Promise<ArFSResult> {
		const rewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: await (async () => {
					const uploadPlan = this.uploadPlanner.planCreateDrive(arFSPrototypes);
					const { rewardSettings, totalWinstonPrice } = await this.costCalculator.calculateCostForCreateDrive(
						uploadPlan
					);
					await this.assertWalletBalance(totalWinstonPrice);
					return rewardSettings;
			  })();

		const createDriveResult = await arFSCreateDrive(rewardSettings);

		const {
			driveId,
			metaDataTxId,
			rootFolderId,
			rootFolderTxId,
			dataCaches,
			fastFinalityIndexes
		} = createDriveResult;

		const arFSResults: ArFSResult = {
			created: [
				{
					type: 'drive',
					metadataTxId: metaDataTxId,
					entityId: driveId,
					dataCaches,
					fastFinalityIndexes
				},
				{
					type: 'folder',
					metadataTxId: rootFolderTxId,
					entityId: rootFolderId,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (isBundleResult(createDriveResult)) {
			// Add bundle entity and bundled in
			arFSResults.created.push({
				type: 'bundle',
				bundleTxId: createDriveResult.bundleTxId
			});
			arFSResults.created[0].bundledIn = createDriveResult.bundleTxId;
			arFSResults.created[1].bundledIn = createDriveResult.bundleTxId;

			if (createDriveResult.bundleTxReward) {
				//  direct to network bundled tx fee
				arFSResults.fees = {
					[`${createDriveResult.bundleTxId}`]: createDriveResult.bundleTxReward
				};
			}

			return arFSResults;
		}

		if (createDriveResult.metaDataTxReward) {
			Object.assign(arFSResults.fees, {
				[`${createDriveResult.metaDataTxId}`]: createDriveResult.metaDataTxReward
			});
		}
		if (createDriveResult.rootFolderTxReward) {
			Object.assign(arFSResults.fees, {
				[`${createDriveResult.rootFolderTxId}`]: createDriveResult.rootFolderTxReward
			});
		}

		// Return as V2 Transaction result
		return arFSResults;
	}

	public async createPublicDrive(params: CreatePublicDriveParams): Promise<ArFSResult> {
		const { driveName } = params;

		assertValidArFSDriveName(driveName);

		const createDriveResult = await this.createDrive(
			getPublicCreateDriveEstimationPrototypes(params),
			(rewardSettings) => this.arFsDao.createPublicDrive({ driveName, rewardSettings })
		);

		createDriveResult.created[0].entityName = driveName;
		createDriveResult.created[1].entityName = driveName;

		return createDriveResult;
	}

	public async createPrivateDrive(params: CreatePrivateDriveParams): Promise<ArFSResult> {
		const { driveName, newPrivateDriveData: newDriveData } = params;

		assertValidArFSDriveName(driveName);

		const createDriveResult = await this.createDrive(
			await getPrivateCreateDriveEstimationPrototypes(params),
			(rewardSettings) => this.arFsDao.createPrivateDrive({ driveName, newDriveData, rewardSettings })
		);

		// Add drive keys and entity name to drive and folder entity results
		createDriveResult.created[0].key = newDriveData.driveKey;
		createDriveResult.created[1].key = newDriveData.driveKey;
		createDriveResult.created[0].entityName = driveName;
		createDriveResult.created[1].entityName = driveName;

		return createDriveResult;
	}

	async assertOwnerAddress(owner: ArweaveAddress): Promise<void> {
		if (!owner.equals(await this.wallet.getAddress())) {
			throw new Error('Supplied wallet is not the owner of this drive!');
		}
	}

	public async getPrivateDrive({
		driveId,
		driveKey,
		owner,
		withKeys
	}: GetPrivateDriveParams): Promise<ArFSPrivateDrive> {
		if (!owner) {
			owner = await this.wallet.getAddress();
		}
		const drive = await this.arFsDao.getPrivateDrive(driveId, driveKey, owner);
		return withKeys
			? drive
			: new ArFSPrivateDriveKeyless(
					drive.appName,
					drive.appVersion,
					drive.arFS,
					drive.contentType,
					drive.driveId,
					drive.entityType,
					drive.name,
					drive.txId,
					drive.unixTime,
					drive.drivePrivacy,
					drive.rootFolderId,
					drive.driveAuthMode,
					drive.cipher,
					drive.cipherIV,
					drive.driveSignatureType
			  );
	}

	public async getPrivateFolder({
		folderId,
		driveKey,
		owner,
		withKeys
	}: GetPrivateFolderParams): Promise<ArFSPrivateFolder> {
		if (!owner) {
			owner = await this.wallet.getAddress();
		}

		const folder = await this.arFsDao.getPrivateFolder(folderId, driveKey, owner);
		return withKeys ? folder : new ArFSPrivateFolderKeyless(folder);
	}

	// Remove me after PE-1027 is applied
	public async getPrivateFolderKeyless({
		folderId,
		driveKey,
		owner
	}: GetPrivateFolderParams): Promise<ArFSPrivateFolderKeyless> {
		const folder = await this.getPrivateFolder({ folderId, driveKey, owner });
		return new ArFSPrivateFolderKeyless(folder);
	}

	public async getPrivateFile({
		fileId,
		driveKey,
		owner,
		withKeys = false
	}: GetPrivateFileParams): Promise<ArFSPrivateFile> {
		if (!owner) {
			owner = await this.wallet.getAddress();
		}

		const file = await this.arFsDao.getPrivateFile(fileId, driveKey, owner);
		return withKeys ? file : new ArFSPrivateFileKeyless(file);
	}

	/**
	 * Lists the children of certain private folder
	 * @param {FolderID} folderId the folder ID to list children of
	 * @returns {ArFSPrivateFileOrFolderWithPaths[]} an array representation of the children and parent folder
	 */
	public async listPrivateFolder({
		folderId,
		driveKey,
		maxDepth = 0,
		includeRoot = false,
		owner,
		withKeys = false
	}: ListPrivateFolderParams): Promise<(ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths)[]> {
		if (!owner) {
			owner = await this.wallet.getAddress();
		}

		const withPathsFactory = withKeys ? privateEntityWithPathsFactory : privateEntityWithPathsKeylessFactory;

		const children = this.arFsDao.listPrivateFolder({
			folderId,
			driveKey,
			maxDepth,
			includeRoot,
			owner,
			withPathsFactory
		});
		return children;
	}

	/** Throw an error if wallet balance does not cover cost of the provided winston  */
	async assertWalletBalance(winston: Winston): Promise<void> {
		const walletHasBalance = await this.walletDao.walletHasBalance(this.wallet, winston);

		if (!walletHasBalance) {
			const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

			throw new Error(`Wallet balance of ${walletBalance} Winston is not enough (${winston}) for this action!`);
		}
	}

	async estimateAndAssertCostOfMoveFile(metadata: ArFSFileMetadataTransactionData): Promise<MetaDataBaseCosts> {
		return this.estimateAndAssertCostOfMetaDataTx(metadata);
	}

	async estimateAndAssertCostOfFolderUpload(metaData: ArFSObjectTransactionData): Promise<MetaDataBaseCosts> {
		return this.estimateAndAssertCostOfMetaDataTx(metaData);
	}

	async estimateAndAssertCostOfFileRename(metadata: ArFSObjectTransactionData): Promise<MetaDataBaseCosts> {
		return this.estimateAndAssertCostOfMetaDataTx(metadata);
	}

	async estimateAndAssertCostOfFolderRename(metadata: ArFSObjectTransactionData): Promise<MetaDataBaseCosts> {
		return this.estimateAndAssertCostOfMetaDataTx(metadata);
	}

	async estimateAndAssertCostOfDriveRename(metadata: ArFSObjectTransactionData): Promise<MetaDataBaseCosts> {
		return this.estimateAndAssertCostOfMetaDataTx(metadata);
	}

	private async estimateAndAssertCostOfMetaDataTx(metaData: ArFSObjectTransactionData): Promise<MetaDataBaseCosts> {
		const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(metaData.sizeOf());
		const boostedReward = W(this.feeMultiple.boostReward(metaDataBaseReward.toString()));

		const walletHasBalance = await this.walletDao.walletHasBalance(this.wallet, boostedReward);

		if (!walletHasBalance) {
			const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

			throw new Error(
				`Wallet balance of ${walletBalance} Winston is not enough (${boostedReward}) for this transaction!`
			);
		}

		return {
			metaDataBaseReward
		};
	}

	public async getDriveIdForFileId(fileId: FileID): Promise<DriveID> {
		return this.arFsDao.getDriveIdForFileId(fileId);
	}

	public async getDriveIdForFolderId(folderId: FolderID): Promise<DriveID> {
		return this.arFsDao.getDriveIdForFolderId(folderId);
	}

	async assertValidPassword(password: string): Promise<void> {
		await this.arFsDao.assertValidPassword(password);
	}

	async downloadPrivateFile({
		fileId,
		driveKey,
		destFolderPath,
		defaultFileName
	}: DownloadPrivateFileParameters): Promise<void> {
		assertFolderExists(destFolderPath);
		const privateFile = await this.getPrivateFile({ fileId, driveKey });
		const outputFileName = defaultFileName ?? privateFile.name;
		const fullPath = joinPath(destFolderPath, outputFileName);
		const data = await this.arFsDao.getPrivateDataStream(privateFile);
		const fileKey = await deriveFileKey(`${fileId}`, driveKey);
		const fileCipherIV = await this.arFsDao.getPrivateTransactionCipherIV(privateFile.dataTxId);
		const authTag = await this.arFsDao.getAuthTagForPrivateFile(privateFile);
		const decipher = new StreamDecrypt(fileCipherIV, fileKey, authTag);
		const fileToDownload = new ArFSPrivateFileToDownload(privateFile, data, fullPath, decipher);
		await fileToDownload.write();
	}

	async assertUniqueNameWithinPublicFolder(name: string, folderId: FolderID, driveId: DriveID): Promise<void> {
		const allSiblingNames = await this.arFsDao.getPublicEntityNamesInFolder(
			folderId,
			await this.wallet.getAddress(),
			driveId
		);
		const collidesWithExistingSiblingName = allSiblingNames.reduce((accumulator, siblingName) => {
			return accumulator || siblingName === name;
		}, false);
		if (collidesWithExistingSiblingName) {
			throw new Error(`There already is an entity named that way`);
		}
	}

	async assertUniqueNameWithinPrivateFolder(
		name: string,
		folderId: FolderID,
		driveKey: DriveKey,
		driveId: DriveID
	): Promise<void> {
		const allSiblingNames = await this.arFsDao.getPrivateEntityNamesInFolder(
			folderId,
			await this.wallet.getAddress(),
			driveKey,
			driveId
		);
		const collidesWithExistingSiblingName = allSiblingNames.reduce((accumulator, siblingName) => {
			return accumulator || siblingName === name;
		}, false);
		if (collidesWithExistingSiblingName) {
			throw new Error(`There already is an entity named that way`);
		}
	}

	async renamePublicFile({ fileId, newName }: RenamePublicFileParams): Promise<ArFSResult> {
		const owner = await this.wallet.getAddress();
		const driveId = await this.getDriveIdForFileId(fileId);

		const file = await this.getPublicFile({ fileId, owner });
		if (file.name === newName) {
			throw new Error(`To rename a file, the new name must be different`);
		}
		assertValidArFSFileName(newName);
		await this.assertUniqueNameWithinPublicFolder(newName, file.parentFolderId, driveId);
		const fileMetadataTxDataStub = new ArFSPublicFileMetadataTransactionData(
			newName,
			file.size,
			file.lastModifiedDate,
			file.dataTxId,
			file.dataContentType,
			file.customMetaDataJson
		);

		const metadataRewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(fileMetadataTxDataStub)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		const {
			entityId,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.renamePublicFile({
			file,
			newName,
			metadataRewardSettings
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'file',
					entityId: entityId,
					metadataTxId: metaDataTxId,
					entityName: newName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}

		return arFSResult;
	}

	async renamePrivateFile({ fileId, newName, driveKey }: RenamePrivateFileParams): Promise<ArFSResult> {
		const owner = await this.wallet.getAddress();
		const file = await this.getPrivateFile({ fileId, driveKey, owner });
		const driveId = await this.getDriveIdForFileId(fileId);

		if (file.name === newName) {
			throw new Error(`To rename a file, the new name must be different`);
		}
		assertValidArFSFileName(newName);
		await this.assertUniqueNameWithinPrivateFolder(newName, file.parentFolderId, driveKey, driveId);
		const fileMetadataTxDataStub = await ArFSPrivateFileMetadataTransactionData.from(
			newName,
			file.size,
			file.lastModifiedDate,
			file.dataTxId,
			file.dataContentType,
			file.fileId,
			driveKey,
			file.customMetaDataJson
		);

		const metadataRewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(fileMetadataTxDataStub)).metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		const {
			entityId,
			fileKey,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.renamePrivateFile({
			file,
			newName,
			metadataRewardSettings,
			driveKey
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'file',
					entityId: entityId,
					key: fileKey,
					metadataTxId: metaDataTxId,
					entityName: newName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}

		return arFSResult;
	}

	async renamePublicFolder({ folderId, newName }: RenamePublicFolderParams): Promise<ArFSResult> {
		const owner = await this.wallet.getAddress();
		const folder = await this.getPublicFolder({ folderId, owner });
		const driveId = await this.getDriveIdForFolderId(folderId);

		if (`${folder.parentFolderId}` === ROOT_FOLDER_ID_PLACEHOLDER) {
			throw new Error(
				`The root folder with ID '${folderId}' cannot be renamed as it shares its name with its parent drive. Consider renaming the drive instead.`
			);
		}
		if (folder.name === newName) {
			throw new Error(`New folder name '${newName}' must be different from the current folder name!`);
		}
		assertValidArFSFolderName(newName);
		await this.assertUniqueNameWithinPublicFolder(newName, folder.parentFolderId, driveId);
		const folderMetadataTxDataStub = new ArFSPublicFolderTransactionData(newName, folder.customMetaDataJson);

		const metadataRewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(folderMetadataTxDataStub))
						.metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		const {
			entityId,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.renamePublicFolder({
			folder,
			newName,
			metadataRewardSettings
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'folder',
					entityId: entityId,
					metadataTxId: metaDataTxId,
					entityName: newName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}

		return arFSResult;
	}

	async renamePrivateFolder({ folderId, newName, driveKey }: RenamePrivateFolderParams): Promise<ArFSResult> {
		const owner = await this.wallet.getAddress();
		const folder = await this.getPrivateFolder({ folderId, driveKey, owner });
		const driveId = await this.getDriveIdForFolderId(folderId);
		if (`${folder.parentFolderId}` === ROOT_FOLDER_ID_PLACEHOLDER) {
			throw new Error(
				`The root folder with ID '${folderId}' cannot be renamed as it shares its name with its parent drive. Consider renaming the drive instead.`
			);
		}
		if (folder.name === newName) {
			throw new Error(`New folder name '${newName}' must be different from the current folder name!`);
		}
		assertValidArFSFolderName(newName);
		await this.assertUniqueNameWithinPrivateFolder(newName, folder.parentFolderId, driveKey, driveId);
		const folderMetadataTxDataStub = await ArFSPrivateFolderTransactionData.from(
			newName,
			driveKey,
			folder.customMetaDataJson
		);

		const metadataRewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(folderMetadataTxDataStub))
						.metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		const {
			entityId,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.renamePrivateFolder({
			folder,
			newName,
			metadataRewardSettings,
			driveKey
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'folder',
					entityId: entityId,
					metadataTxId: metaDataTxId,
					key: driveKey,
					entityName: newName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}

		return arFSResult;
	}

	async renamePublicDrive({ driveId, newName }: RenamePublicDriveParams): Promise<ArFSResult> {
		const owner = await this.wallet.getAddress();
		const drive = await this.getPublicDrive({ driveId, owner });

		if (drive.name === newName) {
			throw new Error(`New drive name '${newName}' must be different from the current drive name!`);
		}
		assertValidArFSDriveName(newName);
		const driveMetadataTxDataStub = new ArFSPublicDriveTransactionData(
			newName,
			drive.rootFolderId,
			drive.customMetaDataJson
		);

		const metadataRewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(driveMetadataTxDataStub))
						.metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		const {
			entityId,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.renamePublicDrive({
			drive,
			newName,
			metadataRewardSettings
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'drive',
					entityId: entityId,
					metadataTxId: metaDataTxId,
					entityName: newName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}

		return arFSResult;
	}

	async renamePrivateDrive({ driveId, newName, driveKey }: RenamePrivateDriveParams): Promise<ArFSResult> {
		const owner = await this.wallet.getAddress();
		const drive = await this.getPrivateDrive({ driveId, owner, driveKey });
		if (drive.name === newName) {
			throw new Error(`New drive name '${newName}' must be different from the current drive name!`);
		}
		assertValidArFSDriveName(newName);
		const driveMetadataTxDataStub = await ArFSPrivateDriveTransactionData.from(
			newName,
			drive.rootFolderId,
			driveKey,
			drive.customMetaDataJson
		);

		const metadataRewardSettings = this.uploadPlanner.isTurboUpload()
			? undefined
			: {
					reward: (await this.estimateAndAssertCostOfFolderUpload(driveMetadataTxDataStub))
						.metaDataBaseReward,
					feeMultiple: this.feeMultiple
			  };

		const {
			entityId,
			metaDataTxId,
			dataCaches,
			fastFinalityIndexes,
			metaDataTxReward
		} = await this.arFsDao.renamePrivateDrive({
			drive,
			newName,
			metadataRewardSettings,
			driveKey
		});

		const arFSResult: ArFSResult = {
			created: [
				{
					type: 'drive',
					entityId: entityId,
					key: driveKey,
					metadataTxId: metaDataTxId,
					entityName: newName,
					dataCaches,
					fastFinalityIndexes
				}
			],
			tips: [],
			fees: {}
		};

		if (metaDataTxReward) {
			arFSResult.fees = { [`${metaDataTxId}`]: metaDataTxReward };
		}

		return arFSResult;
	}

	async downloadPrivateFolder({
		folderId,
		destFolderPath,
		customFolderName,
		maxDepth,
		driveKey,
		owner
	}: DownloadPrivateFolderParameters): Promise<void> {
		if (!owner) {
			owner = await this.wallet.getAddress();
		}

		return this.arFsDao.downloadPrivateFolder({
			folderId,
			destFolderPath,
			customFolderName,
			maxDepth,
			driveKey,
			owner
		});
	}

	async downloadPrivateDrive({
		driveId,
		destFolderPath,
		customFolderName,
		maxDepth,
		driveKey,
		owner
	}: DownloadPrivateDriveParameters): Promise<void> {
		if (!owner) {
			owner = await this.wallet.getAddress();
		}

		const drive = await this.arFsDao.getPrivateDrive(driveId, driveKey, owner);
		const downloadFolderArgs: ArFSDownloadPrivateFolderParams = {
			folderId: drive.rootFolderId,
			destFolderPath,
			customFolderName,
			maxDepth,
			driveKey,
			owner
		};

		return this.arFsDao.downloadPrivateFolder(downloadFolderArgs);
	}

	async getDriveSignatureInfo({ driveId, owner }: GetDriveSignatureInfoParameters): Promise<DriveSignatureInfo> {
		return this.arFsDao.getDriveSignatureInfo(driveId, owner);
	}
}
