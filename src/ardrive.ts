import { ArDriveAnonymous } from './ardrive_anonymous';
import {
	ArFSPrivateDrive,
	ArFSPrivateFolder,
	ArFSPrivateFile,
	ArFSPrivateFileOrFolderWithPaths
} from './arfs/arfs_entities';
import {
	ArFSFolderToUpload,
	ArFSPrivateFileToDownload,
	ArFSEntityToUpload,
	ArFSManifestToUpload
} from './arfs/arfs_file_wrapper';
import {
	ArFSPublicFileMetadataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSFileMetadataTransactionData,
	ArFSObjectTransactionData
} from './arfs/arfs_tx_data_types';
import { ArFSDAO } from './arfs/arfsdao';
import { CommunityOracle } from './community/community_oracle';
import { deriveFileKey } from './utils/crypto';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import {
	FeeMultiple,
	ArweaveAddress,
	ByteCount,
	AR,
	W,
	FolderID,
	DriveKey,
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
	skipOnConflicts,
	upsertOnConflicts,
	emptyManifestResult,
	CommunityTipSettings,
	ArFSDownloadPrivateFolderParams
} from './types';
import {
	CommunityTipParams,
	TipResult,
	MovePublicFileParams,
	ArFSResult,
	MovePrivateFileParams,
	MovePublicFolderParams,
	MovePrivateFolderParams,
	emptyArFSResult,
	BulkPublicUploadParams,
	RecursivePublicBulkUploadParams,
	ArFSEntityData,
	ArFSFees,
	BulkPrivateUploadParams,
	RecursivePrivateBulkUploadParams,
	CreatePublicFolderParams,
	CreatePrivateFolderParams,
	CreatePublicDriveParams,
	CreatePrivateDriveParams,
	GetPrivateDriveParams,
	GetPrivateFolderParams,
	GetPrivateFileParams,
	ListPrivateFolderParams,
	MetaDataBaseCosts
} from './types';
import { encryptedDataSize, urlEncodeHashKey } from './utils/common';
import { errorMessage } from './utils/error_message';
import { Wallet } from './wallet';
import { WalletDAO } from './wallet_dao';
import {
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION,
	privateOctetContentTypeTag,
	publicJsonContentTypeTag
} from './utils/constants';
import { StreamDecrypt } from './utils/stream_decrypt';
import { assertFolderExists } from './utils/assert_folder';
import { join as joinPath } from 'path';
import { resolveFileNameConflicts, resolveFolderNameConflicts } from './utils/upload_conflict_resolution';
import {
	ArFSCreateBundledDriveResult,
	ArFSCreateDriveResult,
	ArFSUploadFileV2TxResult,
	ArFSUploadPrivateFileResult,
	ArFSUploadPublicFileResult,
	isBundleResult,
	isPrivateResult,
	WithFileKey
} from './arfs/arfs_entity_result_factory';
import { ArFSUploadPlanner } from './arfs/arfs_upload_planner';
import {
	CreateDriveRewardSettings,
	EstimateCreateDriveParams,
	EstimateUploadFileResult,
	UploadFileRewardSettings
} from './types/upload_planner_types';
import {
	getPrivateCreateDriveEstimationPrototypes,
	getPrivateUploadFileEstimationPrototype,
	getPublicCreateDriveEstimationPrototypes,
	getPublicUploadFileEstimationPrototype
} from './pricing/estimation_prototypes';
import { ArFSTagSettings } from './arfs/arfs_tag_settings';
import { NameConflictInfo } from './utils/mapper_functions';
import { ARDataPriceNetworkEstimator } from './pricing/ar_data_price_network_estimator';
import { assertValidArFSDriveName, assertValidArFSFolderName } from './arfs/arfs_entity_name_validators';
import { TipData } from './exports';

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
		private readonly uploadPlanner: ArFSUploadPlanner = new ArFSUploadPlanner({
			priceEstimator,
			arFSTagSettings: arFSTagSettings,
			feeMultiple,
			communityOracle
		})
	) {
		super(arFsDao);
	}

	// NOTE: Presumes that there's a sufficient wallet balance
	async sendCommunityTip({ communityWinstonTip, assertBalance = false }: CommunityTipParams): Promise<TipResult> {
		const tokenHolder: ArweaveAddress = await this.communityOracle.selectTokenHolder();
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

		const owner = await this.getOwnerForDriveId(destFolderDriveId);
		await this.assertOwnerAddress(owner);

		const originalFileMetaData = await this.getPublicFile({ fileId });

		if (!destFolderDriveId.equals(originalFileMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFileMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('File', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPublicEntityNamesInFolder(newParentFolderId);
		if (entityNamesInParentFolder.includes(originalFileMetaData.name)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		const fileTransactionData = new ArFSPublicFileMetadataTransactionData(
			originalFileMetaData.name,
			originalFileMetaData.size,
			originalFileMetaData.lastModifiedDate,
			originalFileMetaData.dataTxId,
			originalFileMetaData.dataContentType
		);

		const moveFileBaseCosts = await this.estimateAndAssertCostOfMoveFile(fileTransactionData);
		const fileMetaDataBaseReward = { reward: moveFileBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };

		// Move file will create a new meta data tx with identical meta data except for a new parentFolderId
		const moveFileResult = await this.arFsDao.movePublicFile({
			originalMetaData: originalFileMetaData,
			transactionData: fileTransactionData,
			newParentFolderId,
			metaDataBaseReward: fileMetaDataBaseReward
		});

		return Promise.resolve({
			created: [
				{
					type: 'file',
					metadataTxId: moveFileResult.metaDataTxId,
					dataTxId: moveFileResult.dataTxId,
					entityId: fileId
				}
			],
			tips: [],
			fees: {
				[`${moveFileResult.metaDataTxId}`]: moveFileResult.metaDataTxReward
			}
		});
	}

	public async movePrivateFile({ fileId, newParentFolderId, driveKey }: MovePrivateFileParams): Promise<ArFSResult> {
		const destFolderDriveId = await this.arFsDao.getDriveIdForFolderId(newParentFolderId);

		const owner = await this.getOwnerForDriveId(destFolderDriveId);
		await this.assertOwnerAddress(owner);

		const originalFileMetaData = await this.getPrivateFile({ fileId, driveKey });

		if (!destFolderDriveId.equals(originalFileMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFileMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('File', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPrivateEntityNamesInFolder(newParentFolderId, driveKey);
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
			driveKey
		);

		const moveFileBaseCosts = await this.estimateAndAssertCostOfMoveFile(fileTransactionData);
		const fileMetaDataBaseReward = { reward: moveFileBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };

		// Move file will create a new meta data tx with identical meta data except for a new parentFolderId
		const moveFileResult = await this.arFsDao.movePrivateFile({
			originalMetaData: originalFileMetaData,
			transactionData: fileTransactionData,
			newParentFolderId,
			metaDataBaseReward: fileMetaDataBaseReward
		});

		return Promise.resolve({
			created: [
				{
					type: 'file',
					metadataTxId: moveFileResult.metaDataTxId,
					dataTxId: moveFileResult.dataTxId,
					entityId: fileId,
					key: urlEncodeHashKey(moveFileResult.fileKey)
				}
			],
			tips: [],
			fees: {
				[`${moveFileResult.metaDataTxId}`]: moveFileResult.metaDataTxReward
			}
		});
	}

	public async movePublicFolder({ folderId, newParentFolderId }: MovePublicFolderParams): Promise<ArFSResult> {
		if (folderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.folderCannotMoveIntoItself);
		}

		const destFolderDriveId = await this.arFsDao.getDriveIdForFolderId(newParentFolderId);

		const owner = await this.getOwnerForDriveId(destFolderDriveId);
		await this.assertOwnerAddress(owner);

		const originalFolderMetaData = await this.getPublicFolder({ folderId });

		if (!destFolderDriveId.equals(originalFolderMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFolderMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('Folder', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPublicEntityNamesInFolder(newParentFolderId);
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

		const folderTransactionData = new ArFSPublicFolderTransactionData(originalFolderMetaData.name);
		const { metaDataBaseReward: baseReward } = await this.estimateAndAssertCostOfFolderUpload(
			folderTransactionData
		);

		const folderMetaDataBaseReward = { reward: baseReward, feeMultiple: this.feeMultiple };

		// Move folder will create a new meta data tx with identical meta data except for a new parentFolderId
		const moveFolderResult = await this.arFsDao.movePublicFolder({
			originalMetaData: originalFolderMetaData,
			transactionData: folderTransactionData,
			newParentFolderId,
			metaDataBaseReward: folderMetaDataBaseReward
		});

		return Promise.resolve({
			created: [
				{
					type: 'folder',
					metadataTxId: moveFolderResult.metaDataTxId,
					entityId: folderId
				}
			],
			tips: [],
			fees: {
				[`${moveFolderResult.metaDataTxId}`]: moveFolderResult.metaDataTxReward
			}
		});
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

		const owner = await this.getOwnerForDriveId(destFolderDriveId);
		await this.assertOwnerAddress(owner);

		const originalFolderMetaData = await this.getPrivateFolder({ folderId, driveKey });

		if (!destFolderDriveId.equals(originalFolderMetaData.driveId)) {
			throw new Error(errorMessage.cannotMoveToDifferentDrive);
		}

		if (originalFolderMetaData.parentFolderId.equals(newParentFolderId)) {
			throw new Error(errorMessage.cannotMoveIntoSamePlace('Folder', newParentFolderId));
		}

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPrivateEntityNamesInFolder(newParentFolderId, driveKey);
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
			driveKey
		);
		const { metaDataBaseReward: baseReward } = await this.estimateAndAssertCostOfFolderUpload(
			folderTransactionData
		);

		const folderMetaDataBaseReward = { reward: baseReward, feeMultiple: this.feeMultiple };

		// Move folder will create a new meta data tx with identical meta data except for a new parentFolderId
		const moveFolderResult = await this.arFsDao.movePrivateFolder({
			originalMetaData: originalFolderMetaData,
			transactionData: folderTransactionData,
			newParentFolderId,
			metaDataBaseReward: folderMetaDataBaseReward
		});

		return Promise.resolve({
			created: [
				{
					type: 'folder',
					metadataTxId: moveFolderResult.metaDataTxId,
					entityId: folderId,
					key: urlEncodeHashKey(moveFolderResult.driveKey)
				}
			],
			tips: [],
			fees: {
				[`${moveFolderResult.metaDataTxId}`]: moveFolderResult.metaDataTxReward
			}
		});
	}

	private async uploadFile(
		{
			parentFolderId,
			wrappedFile,
			destinationFileName,
			conflictResolution = upsertOnConflicts,
			prompts
		}: UploadPublicFileParams,
		getOwnerAndAssertDrive: (driveId: DriveID) => Promise<ArweaveAddress>,
		getConflictInfoFn: (parentFolderId: FolderID) => Promise<NameConflictInfo>,
		prepareEstimationFn: (wrappedFile: ArFSEntityToUpload) => Promise<EstimateUploadFileResult>,
		arFSUploadFile: (
			rewardSettings: UploadFileRewardSettings,
			driveId: DriveID,
			wrappedFile: ArFSEntityToUpload,
			communityTipSettings: CommunityTipSettings
		) => Promise<ArFSUploadPublicFileResult | ArFSUploadPrivateFileResult>
	): Promise<ArFSResult> {
		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);

		const owner = await getOwnerAndAssertDrive(driveId);
		await this.assertOwnerAddress(owner);

		// Derive destination name and names already within provided destination folder
		wrappedFile.newFileName = destinationFileName;
		const nameConflictInfo = await getConflictInfoFn(parentFolderId);

		await resolveFileNameConflicts({
			conflictResolution,
			destinationFileName: wrappedFile.destinationBaseName,
			nameConflictInfo,
			wrappedFile,
			prompts
		});

		if (wrappedFile.conflictResolution) {
			switch (wrappedFile.conflictResolution) {
				case errorOnConflict:
					throw new Error(errorMessage.entityNameExists);

				case skipOnConflicts:
					return emptyArFSResult;

				case upsertOnConflicts:
					throw new Error(errorMessage.fileIsTheSame);
			}
		}

		const { rewardSettings, totalWinstonPrice, communityWinstonTip } = await prepareEstimationFn(wrappedFile);
		await this.assertWalletBalance(totalWinstonPrice);

		const communityTipTarget = await this.communityOracle.selectTokenHolder();
		const communityTipSettings: CommunityTipSettings = { communityTipTarget, communityWinstonTip };

		const uploadFileResult = await arFSUploadFile(rewardSettings, driveId, wrappedFile, communityTipSettings);

		const arFSResults: ArFSResult = {
			created: [
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTxId,
					dataTxId: uploadFileResult.dataTxId,
					entityId: uploadFileResult.fileId,
					key: isPrivateResult(uploadFileResult) ? urlEncodeHashKey(uploadFileResult.fileKey) : undefined
				}
			],
			tips: [],
			fees: {}
		};

		const tipResult: Omit<TipData, 'txId'> = { recipient: communityTipTarget, winston: communityWinstonTip };

		if (isBundleResult(uploadFileResult)) {
			// Add bundle entity and return direct to network bundled tx result
			arFSResults.created.push({
				type: 'bundle',
				bundleTxId: uploadFileResult.bundleTxId
			});

			return {
				...arFSResults,
				tips: [{ ...tipResult, txId: uploadFileResult.bundleTxId }],
				fees: {
					[`${uploadFileResult.bundleTxId}`]: uploadFileResult.bundleTxReward
				}
			};
		}

		// Return as V2 Transaction result
		return {
			...arFSResults,
			tips: [{ ...tipResult, txId: uploadFileResult.dataTxId }],
			fees: {
				[`${uploadFileResult.dataTxId}`]: uploadFileResult.dataTxReward,
				[`${uploadFileResult.metaDataTxId}`]: uploadFileResult.metaDataTxReward
			}
		};
	}

	public async uploadPublicFile(uploadParams: UploadPublicFileParams): Promise<ArFSResult> {
		const { parentFolderId } = uploadParams;

		return this.uploadFile(
			uploadParams,
			async (driveId) => this.arFsDao.getOwnerAndAssertDrive(driveId),
			(parentFolderId) => this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId),
			async (wrappedFile) =>
				await this.uploadPlanner.estimateUploadFile({
					fileDataSize: wrappedFile.size,
					fileMetaDataPrototype: getPublicUploadFileEstimationPrototype(wrappedFile),
					contentTypeTag: publicJsonContentTypeTag
				}),
			(rewardSettings, driveId, wrappedFile, communityTipSettings) => {
				return this.arFsDao.uploadPublicFile({
					parentFolderId,
					wrappedFile,
					rewardSettings,
					driveId,
					communityTipSettings
				});
			}
		);
	}

	public async uploadPrivateFile(uploadParams: UploadPrivateFileParams): Promise<ArFSResult> {
		const { parentFolderId, driveKey } = uploadParams;

		return this.uploadFile(
			uploadParams,
			async (driveId) => this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey),
			(parentFolderId) => this.arFsDao.getPrivateNameConflictInfoInFolder(parentFolderId, driveKey),
			async (wrappedFile) =>
				this.uploadPlanner.estimateUploadFile({
					fileDataSize: encryptedDataSize(wrappedFile.size),
					fileMetaDataPrototype: await getPrivateUploadFileEstimationPrototype(wrappedFile, driveKey),
					contentTypeTag: privateOctetContentTypeTag
				}),
			(rewardSettings, driveId, wrappedFile, communityTipSettings) =>
				this.arFsDao.uploadPrivateFile({
					parentFolderId,
					wrappedFile,
					rewardSettings,
					driveId,
					driveKey,
					communityTipSettings
				})
		);
	}

	public async createPublicFolderAndUploadChildren({
		parentFolderId,
		wrappedFolder,
		destParentFolderName,
		conflictResolution = upsertOnConflicts,
		prompts
	}: BulkPublicUploadParams): Promise<ArFSResult> {
		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);

		const owner = await this.arFsDao.getOwnerAndAssertDrive(driveId);
		await this.assertOwnerAddress(owner);

		// Derive destination name and names already within provided destination folder
		destParentFolderName ??= wrappedFolder.getBaseFileName();
		const nameConflictInfo = await this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId);

		await resolveFolderNameConflicts({
			conflictResolution,
			destinationFolderName: destParentFolderName,
			getConflictInfoFn: (folderId) => this.arFsDao.getPublicNameConflictInfoInFolder(folderId),
			nameConflictInfo,
			wrappedFolder,
			prompts
		});

		// Estimate and assert the cost of the entire bulk upload
		// This will assign the calculated base costs to each wrapped file and folder
		const bulkEstimation = await this.estimateAndAssertCostOfBulkUpload(wrappedFolder);

		// TODO: Add interactive confirmation of price estimation before uploading

		const results = await this.recursivelyCreatePublicFolderAndUploadChildren({
			parentFolderId,
			wrappedFolder,
			driveId,
			owner
		});

		if (bulkEstimation.communityWinstonTip.isGreaterThan(W(0))) {
			// Send community tip only if communityWinstonTip has a value
			// This can be zero when a user uses this method to upload empty folders

			const { tipData, reward: communityTipTxReward } = await this.sendCommunityTip({
				communityWinstonTip: bulkEstimation.communityWinstonTip
			});

			return Promise.resolve({
				created: results.entityResults,
				tips: [tipData],
				fees: { ...results.feeResults, [`${tipData.txId}`]: communityTipTxReward }
			});
		}

		return Promise.resolve({
			created: results.entityResults,
			tips: [],
			fees: results.feeResults
		});
	}

	protected async recursivelyCreatePublicFolderAndUploadChildren({
		parentFolderId,
		wrappedFolder,
		driveId,
		owner
	}: RecursivePublicBulkUploadParams): Promise<{
		entityResults: ArFSEntityData[];
		feeResults: ArFSFees;
	}> {
		let uploadEntityFees: ArFSFees = {};
		let uploadEntityResults: ArFSEntityData[] = [];
		let folderId: FolderID;

		if (wrappedFolder.conflictResolution === skipOnConflicts) {
			// We may skip a folder upload if it conflicts with an existing file name.
			// This would one be the FAIL cases from the table, ideally we'd throw an
			// error -- but we don't want to interrupt other parts of the bulk upload
			return { entityResults: [], feeResults: {} };
		}

		if (wrappedFolder.existingId) {
			// Re-use existing parent folder ID for bulk upload if it exists
			folderId = wrappedFolder.existingId;
		} else {
			// Create the parent folder
			const folderData = new ArFSPublicFolderTransactionData(
				wrappedFolder.newFolderName ?? wrappedFolder.getBaseFileName()
			);

			const createFolderResult = await this.arFsDao.createPublicFolder({
				folderData: folderData,
				driveId,
				rewardSettings: {
					reward: wrappedFolder.getBaseCosts().metaDataBaseReward,
					feeMultiple: this.feeMultiple
				},
				parentFolderId
			});

			const {
				metaDataTxId: metaDataTxId,
				folderId: newFolderId,
				metaDataTxReward: metaDataTxReward
			} = createFolderResult;

			// Capture parent folder results
			uploadEntityFees = { [`${metaDataTxId}`]: metaDataTxReward };
			uploadEntityResults = [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: newFolderId
				}
			];

			folderId = newFolderId;
		}

		// Upload all files in the folder
		for await (const wrappedFile of wrappedFolder.files) {
			if (wrappedFile.conflictResolution) {
				// Continue loop -- don't upload this file in every conflict case for bulk upload.
				// We avoid throwing any errors inside this loop so other possible results get returned
				continue;
			}

			const dataTxRewardSettings = {
				reward: wrappedFile.getBaseCosts().fileDataBaseReward,
				feeMultiple: this.feeMultiple
			};

			const metaDataRewardSettings = {
				reward: wrappedFile.getBaseCosts().metaDataBaseReward,
				feeMultiple: this.feeMultiple
			};

			const uploadFileResult = (await this.arFsDao.uploadPublicFile({
				wrappedFile,
				driveId,
				parentFolderId,
				rewardSettings: {
					dataTxRewardSettings,
					metaDataRewardSettings
				}
			})) as ArFSUploadFileV2TxResult;

			// Capture all file results
			uploadEntityFees = {
				...uploadEntityFees,
				[`${uploadFileResult.dataTxId}`]: uploadFileResult.dataTxReward,
				[`${uploadFileResult.metaDataTxId}`]: uploadFileResult.metaDataTxReward
			};
			uploadEntityResults = [
				...uploadEntityResults,
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTxId,
					dataTxId: uploadFileResult.dataTxId,
					entityId: uploadFileResult.fileId
				}
			];
		}

		// Upload folders, and children of those folders
		for await (const childFolder of wrappedFolder.folders) {
			// Recursion alert, will keep creating folders of all nested folders
			const results = await this.recursivelyCreatePublicFolderAndUploadChildren({
				parentFolderId: folderId,
				wrappedFolder: childFolder,
				driveId,
				owner
			});

			// Capture all folder results
			uploadEntityFees = {
				...uploadEntityFees,
				...results.feeResults
			};
			uploadEntityResults = [...uploadEntityResults, ...results.entityResults];
		}

		return {
			entityResults: uploadEntityResults,
			feeResults: uploadEntityFees
		};
	}

	public async createPrivateFolderAndUploadChildren({
		parentFolderId,
		wrappedFolder,
		driveKey,
		destParentFolderName,
		conflictResolution = upsertOnConflicts,
		prompts
	}: BulkPrivateUploadParams): Promise<ArFSResult> {
		// Retrieve drive ID from folder ID
		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);

		// Get owner of drive, will error if no drives are found
		const owner = await this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey);

		// Assert that the provided wallet is the owner of the drive
		await this.assertOwnerAddress(owner);

		// Derive destination name and names already within provided destination folder
		destParentFolderName ??= wrappedFolder.getBaseFileName();
		const nameConflictInfo = await this.arFsDao.getPrivateNameConflictInfoInFolder(parentFolderId, driveKey);

		await resolveFolderNameConflicts({
			conflictResolution,
			destinationFolderName: destParentFolderName,
			getConflictInfoFn: (folderId: FolderID) =>
				this.arFsDao.getPrivateNameConflictInfoInFolder(folderId, driveKey),
			nameConflictInfo,
			wrappedFolder,
			prompts
		});

		// Estimate and assert the cost of the entire bulk upload
		// This will assign the calculated base costs to each wrapped file and folder
		const bulkEstimation = await this.estimateAndAssertCostOfBulkUpload(wrappedFolder, driveKey);

		// TODO: Add interactive confirmation of price estimation before uploading

		const results = await this.recursivelyCreatePrivateFolderAndUploadChildren({
			parentFolderId,
			wrappedFolder,
			driveKey,
			driveId,
			owner
		});

		if (bulkEstimation.communityWinstonTip.isGreaterThan(W(0))) {
			// Send community tip only if communityWinstonTip has a value
			// This can be zero when a user uses this method to upload empty folders

			const { tipData, reward: communityTipTxReward } = await this.sendCommunityTip({
				communityWinstonTip: bulkEstimation.communityWinstonTip
			});

			return Promise.resolve({
				created: results.entityResults,
				tips: [tipData],
				fees: { ...results.feeResults, [`${tipData.txId}`]: communityTipTxReward }
			});
		}

		return Promise.resolve({
			created: results.entityResults,
			tips: [],
			fees: results.feeResults
		});
	}

	protected async recursivelyCreatePrivateFolderAndUploadChildren({
		wrappedFolder,
		driveId,
		parentFolderId,
		driveKey,
		owner
	}: RecursivePrivateBulkUploadParams): Promise<{
		entityResults: ArFSEntityData[];
		feeResults: ArFSFees;
	}> {
		let uploadEntityFees: ArFSFees = {};
		let uploadEntityResults: ArFSEntityData[] = [];
		let folderId: FolderID;

		if (wrappedFolder.conflictResolution === skipOnConflicts) {
			// We may skip a folder upload if it conflicts with an existing file name.
			// This would one be the FAIL cases from the table, ideally we'd throw an
			// error -- but we don't want to interrupt other parts of the bulk upload
			return { entityResults: [], feeResults: {} };
		}

		if (wrappedFolder.existingId) {
			// Re-use existing parent folder ID for bulk upload if it exists
			folderId = wrappedFolder.existingId;
		} else {
			// Create parent folder
			const folderData = await ArFSPrivateFolderTransactionData.from(
				wrappedFolder.newFolderName ?? wrappedFolder.getBaseFileName(),
				driveKey
			);
			const createFolderResult = await this.arFsDao.createPrivateFolder({
				folderData: folderData,
				driveId,
				rewardSettings: {
					reward: wrappedFolder.getBaseCosts().metaDataBaseReward,
					feeMultiple: this.feeMultiple
				},
				parentFolderId
			});

			const {
				metaDataTxId: metaDataTxId,
				folderId: newFolderId,
				metaDataTxReward: metaDataTxReward
			} = createFolderResult;

			// Capture parent folder results
			uploadEntityFees = { [`${metaDataTxId}`]: metaDataTxReward };
			uploadEntityResults = [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: newFolderId,
					key: urlEncodeHashKey(driveKey)
				}
			];

			folderId = newFolderId;
		}

		// Upload all files in the folder
		for await (const wrappedFile of wrappedFolder.files) {
			if (wrappedFile.conflictResolution) {
				// Continue loop -- don't upload this file in every conflict case for bulk upload.
				// We avoid throwing any errors inside this loop so other possible results get returned
				continue;
			}

			const dataTxRewardSettings = {
				reward: wrappedFile.getBaseCosts().fileDataBaseReward,
				feeMultiple: this.feeMultiple
			};
			const metaDataRewardSettings = {
				reward: wrappedFile.getBaseCosts().metaDataBaseReward,
				feeMultiple: this.feeMultiple
			};

			const uploadFileResult = (await this.arFsDao.uploadPublicFile({
				wrappedFile,
				driveId,
				parentFolderId,
				rewardSettings: {
					dataTxRewardSettings,
					metaDataRewardSettings
				}
			})) as ArFSUploadFileV2TxResult & WithFileKey;

			// Capture all file results
			uploadEntityFees = {
				...uploadEntityFees,
				[`${uploadFileResult.dataTxId}`]: uploadFileResult.dataTxReward,
				[`${uploadFileResult.metaDataTxId}`]: uploadFileResult.metaDataTxReward
			};
			uploadEntityResults = [
				...uploadEntityResults,
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTxId,
					dataTxId: uploadFileResult.dataTxId,
					entityId: uploadFileResult.fileId,
					key: urlEncodeHashKey(uploadFileResult.fileKey)
				}
			];
		}

		// Upload folders, and children of those folders
		for await (const childFolder of wrappedFolder.folders) {
			// Recursion alert, will keep creating folders of all nested folders
			const results = await this.recursivelyCreatePrivateFolderAndUploadChildren({
				parentFolderId: folderId,
				wrappedFolder: childFolder,
				driveId,
				driveKey,
				owner
			});

			// Capture all folder results
			uploadEntityFees = {
				...uploadEntityFees,
				...results.feeResults
			};
			uploadEntityResults = [...uploadEntityResults, ...results.entityResults];
		}

		return {
			entityResults: uploadEntityResults,
			feeResults: uploadEntityFees
		};
	}

	public async uploadPublicManifest({
		folderId,
		destManifestName = 'DriveManifest.json',
		maxDepth = Number.MAX_SAFE_INTEGER,
		conflictResolution = upsertOnConflicts,
		prompts
	}: UploadPublicManifestParams): Promise<ArFSManifestResult> {
		const driveId = await this.arFsDao.getDriveIdForFolderId(folderId);

		// Assert that the owner of this drive is consistent with the provided wallet
		const owner = await this.getOwnerForDriveId(driveId);
		await this.assertOwnerAddress(owner);

		const children = await this.listPublicFolder({
			folderId,
			maxDepth,
			includeRoot: true,
			owner
		});
		const arweaveManifest = new ArFSManifestToUpload(children, destManifestName);

		const nameConflictInfo = await this.arFsDao.getPublicNameConflictInfoInFolder(folderId);
		await resolveFileNameConflicts({
			wrappedFile: arweaveManifest,
			conflictResolution,
			destinationFileName: destManifestName,
			nameConflictInfo,
			prompts
		});

		if (arweaveManifest.conflictResolution === errorOnConflict) {
			// File names CANNOT conflict with folder names
			throw new Error(errorMessage.entityNameExists);
		}

		if (arweaveManifest.conflictResolution === skipOnConflicts) {
			// Return empty result if there is an existing manifest and resolution is set to skip
			return emptyManifestResult;
		}

		const { totalWinstonPrice, communityWinstonTip, rewardSettings } = await this.uploadPlanner.estimateUploadFile({
			fileDataSize: arweaveManifest.size,
			fileMetaDataPrototype: getPublicUploadFileEstimationPrototype(arweaveManifest),
			contentTypeTag: publicJsonContentTypeTag
		});

		const communityTipTarget = await this.communityOracle.selectTokenHolder();
		const communityTipSettings: CommunityTipSettings = { communityTipTarget, communityWinstonTip };

		await this.assertWalletBalance(totalWinstonPrice);

		const uploadFileResult = await this.arFsDao.uploadPublicFile({
			parentFolderId: folderId,
			wrappedFile: arweaveManifest,
			driveId,
			rewardSettings,
			communityTipSettings
		});

		const tipResult = { recipient: communityTipTarget, winston: communityWinstonTip };

		const arFSResults: ArFSManifestResult = {
			created: [
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTxId,
					dataTxId: uploadFileResult.dataTxId,
					entityId: uploadFileResult.fileId
				}
			],
			tips: [],
			fees: {},
			manifest: arweaveManifest.manifest,
			links: arweaveManifest.getLinksOutput(uploadFileResult.dataTxId)
		};

		if (isBundleResult(uploadFileResult)) {
			// Add bundle entity and return direct to network bundled tx result
			arFSResults.created.push({
				type: 'bundle',
				bundleTxId: uploadFileResult.bundleTxId
			});

			return {
				...arFSResults,
				tips: [{ ...tipResult, txId: uploadFileResult.bundleTxId }],
				fees: {
					[`${uploadFileResult.bundleTxId}`]: uploadFileResult.bundleTxReward
				}
			};
		}

		// Return as V2 Transaction result
		return {
			...arFSResults,
			tips: [{ ...tipResult, txId: uploadFileResult.dataTxId }],
			fees: {
				[`${uploadFileResult.dataTxId}`]: uploadFileResult.dataTxReward,
				[`${uploadFileResult.metaDataTxId}`]: uploadFileResult.metaDataTxReward
			}
		};
	}

	public async createPublicFolder({ folderName, parentFolderId }: CreatePublicFolderParams): Promise<ArFSResult> {
		assertValidArFSFolderName(folderName);

		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);
		const owner = await this.arFsDao.getOwnerAndAssertDrive(driveId);
		await this.assertOwnerAddress(owner);

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPublicEntityNamesInFolder(parentFolderId);
		if (entityNamesInParentFolder.includes(folderName)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		// Assert that there's enough AR available in the wallet
		const folderData = new ArFSPublicFolderTransactionData(folderName);
		const { metaDataBaseReward } = await this.estimateAndAssertCostOfFolderUpload(folderData);

		// Create the folder and retrieve its folder ID
		const {
			metaDataTxId: metaDataTxId,
			metaDataTxReward: metaDataTxReward,
			folderId
		} = await this.arFsDao.createPublicFolder({
			folderData,
			driveId,
			rewardSettings: { reward: metaDataBaseReward, feeMultiple: this.feeMultiple },
			parentFolderId
		});

		// IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
		return Promise.resolve({
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: folderId
				}
			],
			tips: [],
			fees: {
				[`${metaDataTxId}`]: metaDataTxReward
			}
		});
	}

	public async createPrivateFolder({
		folderName,
		driveKey,
		parentFolderId
	}: CreatePrivateFolderParams): Promise<ArFSResult> {
		assertValidArFSFolderName(folderName);

		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);
		const owner = await this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey);
		await this.assertOwnerAddress(owner);

		// Assert that there are no duplicate names in the destination folder
		const entityNamesInParentFolder = await this.arFsDao.getPrivateEntityNamesInFolder(parentFolderId, driveKey);
		if (entityNamesInParentFolder.includes(folderName)) {
			// TODO: Add optional interactive prompt to resolve name conflicts in ticket PE-599
			throw new Error(errorMessage.entityNameExists);
		}

		// Assert that there's enough AR available in the wallet
		const folderData = await ArFSPrivateFolderTransactionData.from(folderName, driveKey);
		const { metaDataBaseReward } = await this.estimateAndAssertCostOfFolderUpload(folderData);

		// Create the folder and retrieve its folder ID
		const {
			metaDataTxId: metaDataTxId,
			metaDataTxReward: metaDataTxReward,
			folderId
		} = await this.arFsDao.createPrivateFolder({
			folderData,
			driveId,
			rewardSettings: { reward: metaDataBaseReward, feeMultiple: this.feeMultiple },
			parentFolderId
		});

		// IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
		return Promise.resolve({
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTxId,
					entityId: folderId,
					key: urlEncodeHashKey(driveKey)
				}
			],
			tips: [],
			fees: {
				[`${metaDataTxId}`]: metaDataTxReward
			}
		});
	}

	private async createDrive(
		arFSPrototypes: EstimateCreateDriveParams,
		arFSCreateDrive: (
			rewardSettings: CreateDriveRewardSettings
		) => Promise<ArFSCreateDriveResult | ArFSCreateBundledDriveResult>
	): Promise<ArFSResult> {
		const { rewardSettings, totalWinstonPrice } = await this.uploadPlanner.estimateCreateDrive(arFSPrototypes);
		await this.assertWalletBalance(totalWinstonPrice);

		const createDriveResult = await arFSCreateDrive(rewardSettings);

		const arFSResults: ArFSResult = {
			created: [
				{
					type: 'drive',
					metadataTxId: createDriveResult.metaDataTxId,
					entityId: createDriveResult.driveId
				},
				{
					type: 'folder',
					metadataTxId: createDriveResult.rootFolderTxId,
					entityId: createDriveResult.rootFolderId
				}
			],
			tips: [],
			fees: {}
		};

		if (isBundleResult(createDriveResult)) {
			// Add bundle entity and return direct to network bundled tx result
			arFSResults.created.push({
				type: 'bundle',
				bundleTxId: createDriveResult.bundleTxId
			});
			return {
				...arFSResults,
				fees: {
					[`${createDriveResult.bundleTxId}`]: createDriveResult.bundleTxReward
				}
			};
		}

		// Return as V2 Transaction result
		return {
			...arFSResults,
			fees: {
				[`${createDriveResult.metaDataTxId}`]: createDriveResult.metaDataTxReward,
				[`${createDriveResult.rootFolderTxId}`]: createDriveResult.rootFolderTxReward
			}
		};
	}

	public async createPublicDrive(params: CreatePublicDriveParams): Promise<ArFSResult> {
		const { driveName } = params;

		assertValidArFSDriveName(driveName);

		return this.createDrive(getPublicCreateDriveEstimationPrototypes(params), (rewardSettings) =>
			this.arFsDao.createPublicDrive({ driveName, rewardSettings })
		);
	}

	public async createPrivateDrive(params: CreatePrivateDriveParams): Promise<ArFSResult> {
		const { driveName, newPrivateDriveData: newDriveData } = params;

		assertValidArFSDriveName(driveName);

		const createDriveResult = await this.createDrive(
			await getPrivateCreateDriveEstimationPrototypes(params),
			(rewardSettings) => this.arFsDao.createPrivateDrive({ driveName, newDriveData, rewardSettings })
		);

		// Add drive keys to drive and folder entity results
		createDriveResult.created[0].key = urlEncodeHashKey(newDriveData.driveKey);
		createDriveResult.created[1].key = urlEncodeHashKey(newDriveData.driveKey);

		return createDriveResult;
	}

	/**
	 * Utility function to estimate and assert the cost of a bulk upload
	 *
	 * @remarks This function will recurse into the folder contents of the provided folderToUpload
	 *
	 * @throws when the wallet does not contain enough AR for the bulk upload
	 *
	 * @param folderToUpload The wrapped folder to estimate the cost of
	 * @param driveKey Optional parameter to determine whether to estimate the cost of a private or public upload
	 * @param isParentFolder Boolean to determine whether to Assert the total cost. This parameter
	 *   is only to be handled as false internally within the recursive function. Always use default
	 *   of TRUE when calling this method
	 *  */
	async estimateAndAssertCostOfBulkUpload(
		folderToUpload: ArFSFolderToUpload,
		driveKey?: DriveKey,
		isParentFolder = true
	): Promise<{ totalPrice: Winston; totalFilePrice: Winston; communityWinstonTip: Winston }> {
		let totalPrice = W(0);
		let totalFilePrice = W(0);

		if (folderToUpload.conflictResolution === skipOnConflicts) {
			// Return empty estimation if this folder will be skipped, do not recurse
			return { totalPrice: W('0'), totalFilePrice: W('0'), communityWinstonTip: W('0') };
		}

		// Don't estimate cost of folder metadata if using existing folder
		if (!folderToUpload.existingId) {
			const folderMetadataTxData = await (async () => {
				const folderName = folderToUpload.newFolderName ?? folderToUpload.getBaseFileName();

				if (driveKey) {
					return ArFSPrivateFolderTransactionData.from(folderName, driveKey);
				}
				return new ArFSPublicFolderTransactionData(folderName);
			})();
			const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
				folderMetadataTxData.sizeOf()
			);
			const parentFolderWinstonPrice = metaDataBaseReward;

			// Assign base costs to folder
			folderToUpload.baseCosts = { metaDataBaseReward: parentFolderWinstonPrice };

			totalPrice = totalPrice.plus(parentFolderWinstonPrice);
		}

		for await (const file of folderToUpload.files) {
			if (file.conflictResolution) {
				// Continue loop, won't upload this file
				continue;
			}

			const fileSize = driveKey ? file.encryptedDataSize() : new ByteCount(file.fileStats.size);

			const fileDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileSize);

			const stubFileMetaData = driveKey
				? await getPrivateUploadFileEstimationPrototype(file, driveKey)
				: getPublicUploadFileEstimationPrototype(file);
			const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
				stubFileMetaData.objectData.sizeOf()
			);

			totalPrice = totalPrice.plus(fileDataBaseReward);
			totalPrice = totalPrice.plus(metaDataBaseReward);

			totalFilePrice = totalFilePrice.plus(fileDataBaseReward);

			// Assign base costs to the file
			file.baseCosts = {
				fileDataBaseReward: fileDataBaseReward,
				metaDataBaseReward: metaDataBaseReward
			};
		}

		for await (const folder of folderToUpload.folders) {
			const childFolderResults = await this.estimateAndAssertCostOfBulkUpload(folder, driveKey, false);

			totalPrice = totalPrice.plus(childFolderResults.totalPrice);
			totalFilePrice = totalFilePrice.plus(childFolderResults.totalFilePrice);
		}

		const totalWinstonPrice = totalPrice;
		let communityWinstonTip = W(0);

		if (isParentFolder) {
			if (totalFilePrice.isGreaterThan(W(0))) {
				communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(totalFilePrice);
			}

			// Check and assert balance of the total bulk upload if this folder is the parent folder
			const walletHasBalance = await this.walletDao.walletHasBalance(
				this.wallet,
				communityWinstonTip.plus(totalWinstonPrice)
			);

			if (!walletHasBalance) {
				const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

				throw new Error(
					`Wallet balance of ${walletBalance} Winston is not enough (${totalWinstonPrice}) for data upload of size ${folderToUpload.getTotalByteCount(
						driveKey !== undefined
					)} bytes!`
				);
			}
		}

		return {
			totalPrice,
			totalFilePrice,
			communityWinstonTip
		};
	}

	async assertOwnerAddress(owner: ArweaveAddress): Promise<void> {
		if (!owner.equals(await this.wallet.getAddress())) {
			throw new Error('Supplied wallet is not the owner of this drive!');
		}
	}

	public async getPrivateDrive({ driveId, driveKey, owner }: GetPrivateDriveParams): Promise<ArFSPrivateDrive> {
		if (!owner) {
			owner = await this.getOwnerForDriveId(driveId);
		}
		await this.assertOwnerAddress(owner);

		return this.arFsDao.getPrivateDrive(driveId, driveKey, owner);
	}

	public async getPrivateFolder({ folderId, driveKey, owner }: GetPrivateFolderParams): Promise<ArFSPrivateFolder> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
		}
		await this.assertOwnerAddress(owner);

		return this.arFsDao.getPrivateFolder(folderId, driveKey, owner);
	}

	public async getPrivateFile({ fileId, driveKey, owner }: GetPrivateFileParams): Promise<ArFSPrivateFile> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFileId(fileId);
		}
		await this.assertOwnerAddress(owner);

		return this.arFsDao.getPrivateFile(fileId, driveKey, owner);
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
		owner
	}: ListPrivateFolderParams): Promise<ArFSPrivateFileOrFolderWithPaths[]> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
		}
		await this.assertOwnerAddress(owner);

		const children = this.arFsDao.listPrivateFolder({ folderId, driveKey, maxDepth, includeRoot, owner });
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

	async estimateAndAssertCostOfMoveFile(
		fileTransactionData: ArFSFileMetadataTransactionData
	): Promise<MetaDataBaseCosts> {
		const fileMetaTransactionDataReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
			fileTransactionData.sizeOf()
		);
		const walletHasBalance = await this.walletDao.walletHasBalance(this.wallet, fileMetaTransactionDataReward);

		if (!walletHasBalance) {
			const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

			throw new Error(
				`Wallet balance of ${walletBalance} Winston is not enough (${fileMetaTransactionDataReward}) for moving file!`
			);
		}

		return { metaDataBaseReward: fileMetaTransactionDataReward };
	}

	async estimateAndAssertCostOfFolderUpload(metaData: ArFSObjectTransactionData): Promise<MetaDataBaseCosts> {
		const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(metaData.sizeOf());
		const totalWinstonPrice = metaDataBaseReward;

		const walletHasBalance = await this.walletDao.walletHasBalance(this.wallet, totalWinstonPrice);

		if (!walletHasBalance) {
			const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

			throw new Error(
				`Wallet balance of ${walletBalance} Winston is not enough (${totalWinstonPrice}) for folder creation!`
			);
		}

		return {
			metaDataBaseReward: totalWinstonPrice
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

	async downloadPrivateFolder({
		folderId,
		destFolderPath,
		customFolderName,
		maxDepth,
		driveKey,
		owner
	}: DownloadPrivateFolderParameters): Promise<void> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
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
			owner = await this.arFsDao.getOwnerForDriveId(driveId);
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
}
