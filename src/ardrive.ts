import { ArDriveAnonymous } from './ardrive_anonymous';
import {
	ArFSPrivateDrive,
	ArFSPrivateFolder,
	ArFSPrivateFile,
	ArFSPrivateFileOrFolderWithPaths
} from './arfs/arfs_entities';
import {
	ArFSFolderToUpload,
	ArFSFileToUpload,
	ArFSEntityToUpload,
	ArFSManifestToUpload
} from './arfs/arfs_file_wrapper';
import {
	ArFSPublicFileMetadataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPrivateDriveTransactionData,
	ArFSFileMetadataTransactionData,
	ArFSObjectTransactionData,
	ArFSDriveTransactionData,
	ArFSFolderTransactionData
} from './arfs/arfs_trx_data_types';
import { ArFSDAO } from './arfs/arfsdao';
import { CommunityOracle } from './community/community_oracle';
import { deriveDriveKey } from './utils/crypto';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import {
	FeeMultiple,
	ArweaveAddress,
	ByteCount,
	AR,
	TipType,
	GQLTagInterface,
	W,
	FolderID,
	DriveKey,
	Winston,
	DrivePrivacy,
	FileID,
	DriveID,
	stubTransactionID,
	UploadPublicFileParams,
	UploadPrivateFileParams,
	ArFSManifestResult,
	UploadPublicManifestParams
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
	MetaDataBaseCosts,
	FileUploadBaseCosts,
	DriveUploadBaseCosts
} from './types';
import { urlEncodeHashKey } from './utils/common';
import { errorMessage } from './utils/error_message';
import { Wallet } from './wallet';
import { JWKWallet } from './jwk_wallet';
import { WalletDAO } from './wallet_dao';
import { fakeEntityId } from './utils/constants';
import { ARDataPriceChunkEstimator } from './pricing/ar_data_price_chunk_estimator';
import {
	resolveFileNameConflicts,
	resolveFolderNameConflicts,
	skipOnConflicts,
	upsertOnConflicts
} from './utils/upload_conflict_resolution';

export class ArDrive extends ArDriveAnonymous {
	constructor(
		private readonly wallet: Wallet,
		private readonly walletDao: WalletDAO,
		protected readonly arFsDao: ArFSDAO,
		private readonly communityOracle: CommunityOracle,
		private readonly appName: string,
		private readonly appVersion: string,
		private readonly priceEstimator: ARDataPriceEstimator = new ARDataPriceChunkEstimator(true),
		private readonly feeMultiple: FeeMultiple = new FeeMultiple(1.0),
		private readonly dryRun: boolean = false
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
			this.getTipTags(),
			assertBalance
		);

		return {
			tipData: { txId: transferResult.trxID, recipient: tokenHolder, winston: communityWinstonTip },
			reward: transferResult.reward
		};
	}

	getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'Type', value: 'fee' },
			{ name: 'Tip-Type', value: tipType }
		];
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
					metadataTxId: moveFileResult.metaDataTrxId,
					dataTxId: moveFileResult.dataTrxId,
					entityId: fileId
				}
			],
			tips: [],
			fees: {
				[`${moveFileResult.metaDataTrxId}`]: moveFileResult.metaDataTrxReward
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
					metadataTxId: moveFileResult.metaDataTrxId,
					dataTxId: moveFileResult.dataTrxId,
					entityId: fileId,
					key: urlEncodeHashKey(moveFileResult.fileKey)
				}
			],
			tips: [],
			fees: {
				[`${moveFileResult.metaDataTrxId}`]: moveFileResult.metaDataTrxReward
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
					metadataTxId: moveFolderResult.metaDataTrxId,
					entityId: folderId
				}
			],
			tips: [],
			fees: {
				[`${moveFolderResult.metaDataTrxId}`]: moveFolderResult.metaDataTrxReward
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
					metadataTxId: moveFolderResult.metaDataTrxId,
					entityId: folderId,
					key: urlEncodeHashKey(moveFolderResult.driveKey)
				}
			],
			tips: [],
			fees: {
				[`${moveFolderResult.metaDataTrxId}`]: moveFolderResult.metaDataTrxReward
			}
		});
	}

	public async uploadPublicFile({
		parentFolderId,
		wrappedFile,
		destinationFileName,
		conflictResolution = upsertOnConflicts,
		prompts
	}: UploadPublicFileParams): Promise<ArFSResult> {
		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);

		const owner = await this.arFsDao.getOwnerAndAssertDrive(driveId);
		await this.assertOwnerAddress(owner);

		// Derive destination name and names already within provided destination folder
		destinationFileName ??= wrappedFile.getBaseFileName();
		const nameConflictInfo = await this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId);

		await resolveFileNameConflicts({
			conflictResolution,
			destinationFileName,
			nameConflictInfo,
			wrappedFile,
			prompts
		});

		if (wrappedFile.skipThisUpload) {
			return emptyArFSResult;
		}

		if (wrappedFile.newFileName) {
			destinationFileName = wrappedFile.newFileName;
		}

		const uploadBaseCosts = await this.estimateAndAssertCostOfFileUpload(
			new ByteCount(wrappedFile.fileStats.size),
			this.stubPublicFileMetadata(wrappedFile, destinationFileName),
			'public'
		);
		const fileDataRewardSettings = { reward: uploadBaseCosts.fileDataBaseReward, feeMultiple: this.feeMultiple };
		const metadataRewardSettings = { reward: uploadBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };

		const uploadFileResult = await this.arFsDao.uploadPublicFile({
			parentFolderId,
			wrappedFile,
			driveId,
			fileDataRewardSettings,
			metadataRewardSettings,
			destFileName: destinationFileName,
			existingFileId: wrappedFile.existingId
		});

		const { tipData, reward: communityTipTrxReward } = await this.sendCommunityTip({
			communityWinstonTip: uploadBaseCosts.communityWinstonTip
		});

		return Promise.resolve({
			created: [
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTrxId,
					dataTxId: uploadFileResult.dataTrxId,
					entityId: uploadFileResult.fileId
				}
			],
			tips: [tipData],
			fees: {
				[`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
				[`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward,
				[`${tipData.txId}`]: communityTipTrxReward
			}
		});
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

			const { tipData, reward: communityTipTrxReward } = await this.sendCommunityTip({
				communityWinstonTip: bulkEstimation.communityWinstonTip
			});

			return Promise.resolve({
				created: results.entityResults,
				tips: [tipData],
				fees: { ...results.feeResults, [`${tipData.txId}`]: communityTipTrxReward }
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

		if (wrappedFolder.skipThisUpload) {
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
				parentFolderId,
				syncParentFolderId: false,
				owner
			});

			const { metaDataTrxId, folderId: newFolderId, metaDataTrxReward } = createFolderResult;

			// Capture parent folder results
			uploadEntityFees = { [`${metaDataTrxId}`]: metaDataTrxReward };
			uploadEntityResults = [
				{
					type: 'folder',
					metadataTxId: metaDataTrxId,
					entityId: newFolderId
				}
			];

			folderId = newFolderId;
		}

		// Upload all files in the folder
		for await (const wrappedFile of wrappedFolder.files) {
			if (wrappedFile.skipThisUpload) {
				// Continue loop, don't upload this file, and don't throw
				// errors inside loop so the other results get returned
				continue;
			}

			const fileDataRewardSettings = {
				reward: wrappedFile.getBaseCosts().fileDataBaseReward,
				feeMultiple: this.feeMultiple
			};

			const metadataRewardSettings = {
				reward: wrappedFile.getBaseCosts().metaDataBaseReward,
				feeMultiple: this.feeMultiple
			};

			const uploadFileResult = await this.arFsDao.uploadPublicFile({
				parentFolderId: folderId,
				wrappedFile,
				driveId,
				fileDataRewardSettings,
				metadataRewardSettings,
				existingFileId: wrappedFile.existingId,
				destFileName: wrappedFile.newFileName ?? wrappedFile.getBaseFileName()
			});

			// Capture all file results
			uploadEntityFees = {
				...uploadEntityFees,
				[`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
				[`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward
			};
			uploadEntityResults = [
				...uploadEntityResults,
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTrxId,
					dataTxId: uploadFileResult.dataTrxId,
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

	/** Computes the size of a private file encrypted with AES256-GCM */
	encryptedDataSize(dataSize: ByteCount): ByteCount {
		// TODO: Refactor to utils?
		if (+dataSize > Number.MAX_SAFE_INTEGER - 16) {
			throw new Error(`Max un-encrypted dataSize allowed is ${Number.MAX_SAFE_INTEGER - 16}!`);
		}
		return new ByteCount((+dataSize / 16 + 1) * 16);
	}

	public async uploadPrivateFile({
		parentFolderId,
		wrappedFile,
		driveKey,
		destinationFileName,
		conflictResolution = upsertOnConflicts,
		prompts
	}: UploadPrivateFileParams): Promise<ArFSResult> {
		const driveId = await this.arFsDao.getDriveIdForFolderId(parentFolderId);

		const owner = await this.arFsDao.getOwnerAndAssertDrive(driveId, driveKey);
		await this.assertOwnerAddress(owner);

		// Derive destination name and names already within provided destination folder
		destinationFileName ??= wrappedFile.getBaseFileName();
		const nameConflictInfo = await this.arFsDao.getPrivateNameConflictInfoInFolder(parentFolderId, driveKey);

		await resolveFileNameConflicts({
			conflictResolution,
			destinationFileName,
			nameConflictInfo,
			wrappedFile,
			prompts
		});

		if (wrappedFile.skipThisUpload) {
			return emptyArFSResult;
		}

		if (wrappedFile.newFileName) {
			destinationFileName = wrappedFile.newFileName;
		}

		const uploadBaseCosts = await this.estimateAndAssertCostOfFileUpload(
			new ByteCount(wrappedFile.fileStats.size),
			await this.stubPrivateFileMetadata(wrappedFile, destinationFileName),
			'private'
		);

		const fileDataRewardSettings = {
			reward: uploadBaseCosts.fileDataBaseReward,
			feeMultiple: this.feeMultiple
		};
		const metadataRewardSettings = {
			reward: uploadBaseCosts.metaDataBaseReward,
			feeMultiple: this.feeMultiple
		};

		// TODO: Add interactive confirmation of AR price estimation

		const uploadFileResult = await this.arFsDao.uploadPrivateFile({
			parentFolderId,
			wrappedFile,
			driveId,
			driveKey,
			fileDataRewardSettings,
			metadataRewardSettings,
			destFileName: destinationFileName,
			existingFileId: wrappedFile.existingId
		});

		const { tipData, reward: communityTipTrxReward } = await this.sendCommunityTip({
			communityWinstonTip: uploadBaseCosts.communityWinstonTip
		});

		return Promise.resolve({
			created: [
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTrxId,
					dataTxId: uploadFileResult.dataTrxId,
					entityId: uploadFileResult.fileId,
					key: urlEncodeHashKey(uploadFileResult.fileKey)
				}
			],
			tips: [tipData],
			fees: {
				[`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
				[`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward,
				[`${tipData.txId}`]: communityTipTrxReward
			}
		});
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
		const nameConflictInfo = await this.arFsDao.getPublicNameConflictInfoInFolder(parentFolderId);

		await resolveFolderNameConflicts({
			conflictResolution,
			destinationFolderName: destParentFolderName,
			getConflictInfoFn: (folderId: FolderID) => this.arFsDao.getPublicNameConflictInfoInFolder(folderId),
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

			const { tipData, reward: communityTipTrxReward } = await this.sendCommunityTip({
				communityWinstonTip: bulkEstimation.communityWinstonTip
			});

			return Promise.resolve({
				created: results.entityResults,
				tips: [tipData],
				fees: { ...results.feeResults, [`${tipData.txId}`]: communityTipTrxReward }
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

		if (wrappedFolder.skipThisUpload) {
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
				parentFolderId,
				driveKey,
				syncParentFolderId: false,
				owner
			});

			const { metaDataTrxId, folderId: newFolderId, metaDataTrxReward } = createFolderResult;

			// Capture parent folder results
			uploadEntityFees = { [`${metaDataTrxId}`]: metaDataTrxReward };
			uploadEntityResults = [
				{
					type: 'folder',
					metadataTxId: metaDataTrxId,
					entityId: newFolderId,
					key: urlEncodeHashKey(driveKey)
				}
			];

			folderId = newFolderId;
		}

		// Upload all files in the folder
		for await (const wrappedFile of wrappedFolder.files) {
			if (wrappedFile.skipThisUpload) {
				// Continue loop, don't upload this file, and don't throw
				// errors inside loop so the other results get returned
				continue;
			}

			const fileDataRewardSettings = {
				reward: wrappedFile.getBaseCosts().fileDataBaseReward,
				feeMultiple: this.feeMultiple
			};
			const metadataRewardSettings = {
				reward: wrappedFile.getBaseCosts().metaDataBaseReward,
				feeMultiple: this.feeMultiple
			};

			const uploadFileResult = await this.arFsDao.uploadPrivateFile({
				parentFolderId: folderId,
				wrappedFile,
				driveId,
				driveKey,
				fileDataRewardSettings,
				metadataRewardSettings,
				existingFileId: wrappedFile.existingId,
				destFileName: wrappedFile.newFileName ?? wrappedFile.getBaseFileName()
			});

			// Capture all file results
			uploadEntityFees = {
				...uploadEntityFees,
				[`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
				[`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward
			};
			uploadEntityResults = [
				...uploadEntityResults,
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTrxId,
					dataTxId: uploadFileResult.dataTrxId,
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
		conflictResolution = upsertOnConflicts
	}: UploadPublicManifestParams): Promise<ArFSManifestResult> {
		const driveId = await this.arFsDao.getDriveIdForFolderId(folderId);

		// Assert that the owner of this drive is consistent with the provided wallet
		const owner = await this.getOwnerForDriveId(driveId);
		await this.assertOwnerAddress(owner);

		const filesAndFolderNames = await this.arFsDao.getPublicNameConflictInfoInFolder(folderId);

		const fileToFolderConflict = filesAndFolderNames.folders.find((f) => f.folderName === destManifestName);
		if (fileToFolderConflict) {
			// File names CANNOT conflict with folder names
			throw new Error(errorMessage.entityNameExists);
		}

		// Manifest becomes a new revision if the destination name conflicts for
		// --replace and --upsert behaviors, since it will be newly created each time
		const existingFileId = filesAndFolderNames.files.find((f) => f.fileName === destManifestName)?.fileId;
		if (existingFileId && conflictResolution === skipOnConflicts) {
			// Return empty result if there is an existing manifest and resolution is set to skip
			return { ...emptyArFSResult, links: [] };
		}

		const children = await this.listPublicFolder({
			folderId,
			maxDepth,
			includeRoot: true,
			owner
		});
		const arweaveManifest = new ArFSManifestToUpload(children, destManifestName);

		const uploadBaseCosts = await this.estimateAndAssertCostOfFileUpload(
			arweaveManifest.size,
			this.stubPublicFileMetadata(arweaveManifest),
			'public'
		);
		const fileDataRewardSettings = { reward: uploadBaseCosts.fileDataBaseReward, feeMultiple: this.feeMultiple };
		const metadataRewardSettings = { reward: uploadBaseCosts.metaDataBaseReward, feeMultiple: this.feeMultiple };

		const uploadFileResult = await this.arFsDao.uploadPublicFile({
			parentFolderId: folderId,
			wrappedFile: arweaveManifest,
			driveId,
			fileDataRewardSettings,
			metadataRewardSettings,
			destFileName: destManifestName,
			existingFileId
		});

		const { tipData, reward: communityTipTrxReward } = await this.sendCommunityTip({
			communityWinstonTip: uploadBaseCosts.communityWinstonTip
		});

		// Setup links array from manifest
		const fileLinks = Object.keys(arweaveManifest.manifest.paths).map(
			(path) => `https://arweave.net/${uploadFileResult.dataTrxId}/${path}`
		);

		return Promise.resolve({
			created: [
				{
					type: 'file',
					metadataTxId: uploadFileResult.metaDataTrxId,
					dataTxId: uploadFileResult.dataTrxId,
					entityId: uploadFileResult.fileId
				}
			],
			tips: [tipData],
			fees: {
				[`${uploadFileResult.dataTrxId}`]: uploadFileResult.dataTrxReward,
				[`${uploadFileResult.metaDataTrxId}`]: uploadFileResult.metaDataTrxReward,
				[`${tipData.txId}`]: communityTipTrxReward
			},
			links: [`https://arweave.net/${uploadFileResult.dataTrxId}`, ...fileLinks]
		});
	}

	public async createPublicFolder({
		folderName,
		driveId,
		parentFolderId
	}: CreatePublicFolderParams): Promise<ArFSResult> {
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
		const { metaDataTrxId, metaDataTrxReward, folderId } = await this.arFsDao.createPublicFolder({
			folderData,
			driveId,
			rewardSettings: { reward: metaDataBaseReward, feeMultiple: this.feeMultiple },
			parentFolderId,
			owner
		});

		// IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
		return Promise.resolve({
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTrxId,
					entityId: folderId
				}
			],
			tips: [],
			fees: {
				[`${metaDataTrxId}`]: metaDataTrxReward
			}
		});
	}

	public async createPrivateFolder({
		folderName,
		driveId,
		driveKey,
		parentFolderId
	}: CreatePrivateFolderParams): Promise<ArFSResult> {
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
		const { metaDataTrxId, metaDataTrxReward, folderId } = await this.arFsDao.createPrivateFolder({
			folderData,
			driveId,
			rewardSettings: { reward: metaDataBaseReward, feeMultiple: this.feeMultiple },
			driveKey,
			parentFolderId,
			owner
		});

		// IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
		return Promise.resolve({
			created: [
				{
					type: 'folder',
					metadataTxId: metaDataTrxId,
					entityId: folderId,
					key: urlEncodeHashKey(driveKey)
				}
			],
			tips: [],
			fees: {
				[`${metaDataTrxId}`]: metaDataTrxReward
			}
		});
	}

	public async createPublicDrive({ driveName }: CreatePublicDriveParams): Promise<ArFSResult> {
		// Assert that there's enough AR available in the wallet
		// Use stub data to estimate costs since actual data requires entity IDs generated by ArFSDao
		const stubRootFolderData = new ArFSPublicFolderTransactionData(driveName);
		const stubDriveData = new ArFSPublicDriveTransactionData(driveName, fakeEntityId);
		const driveUploadCosts = await this.estimateAndAssertCostOfDriveCreation(stubDriveData, stubRootFolderData);
		const driveRewardSettings = {
			reward: driveUploadCosts.driveMetaDataBaseReward,
			feeMultiple: this.feeMultiple
		};
		const rootFolderRewardSettings = {
			reward: driveUploadCosts.rootFolderMetaDataBaseReward,
			feeMultiple: this.feeMultiple
		};
		const createDriveResult = await this.arFsDao.createPublicDrive(
			driveName,
			driveRewardSettings,
			rootFolderRewardSettings,
			// There is no need to assert ownership during drive creation
			await this.wallet.getAddress()
		);
		return Promise.resolve({
			created: [
				{
					type: 'drive',
					metadataTxId: createDriveResult.metaDataTrxId,
					entityId: createDriveResult.driveId
				},
				{
					type: 'folder',
					metadataTxId: createDriveResult.rootFolderTrxId,
					entityId: createDriveResult.rootFolderId
				}
			],
			tips: [],
			fees: {
				[`${createDriveResult.metaDataTrxId}`]: createDriveResult.metaDataTrxReward,
				[`${createDriveResult.rootFolderTrxId}`]: createDriveResult.rootFolderTrxReward
			}
		});
	}

	public async createPrivateDrive({ driveName, newPrivateDriveData }: CreatePrivateDriveParams): Promise<ArFSResult> {
		// Assert that there's enough AR available in the wallet
		const stubRootFolderData = await ArFSPrivateFolderTransactionData.from(driveName, newPrivateDriveData.driveKey);
		const stubDriveData = await ArFSPrivateDriveTransactionData.from(
			driveName,
			fakeEntityId,
			newPrivateDriveData.driveKey
		);
		const driveCreationCosts = await this.estimateAndAssertCostOfDriveCreation(stubDriveData, stubRootFolderData);
		const driveRewardSettings = {
			reward: driveCreationCosts.driveMetaDataBaseReward,
			feeMultiple: this.feeMultiple
		};
		const rootFolderRewardSettings = {
			reward: driveCreationCosts.rootFolderMetaDataBaseReward,
			feeMultiple: this.feeMultiple
		};
		const createDriveResult = await this.arFsDao.createPrivateDrive(
			driveName,
			newPrivateDriveData,
			driveRewardSettings,
			rootFolderRewardSettings,
			// Ownership of drive has been verified by assertValidPassword successfully decrypting
			await this.wallet.getAddress()
		);

		// IN THE FUTURE WE MIGHT SEND A COMMUNITY TIP HERE
		return Promise.resolve({
			created: [
				{
					type: 'drive',
					metadataTxId: createDriveResult.metaDataTrxId,
					entityId: createDriveResult.driveId,
					key: urlEncodeHashKey(createDriveResult.driveKey)
				},
				{
					type: 'folder',
					metadataTxId: createDriveResult.rootFolderTrxId,
					entityId: createDriveResult.rootFolderId,
					key: urlEncodeHashKey(createDriveResult.driveKey)
				}
			],
			tips: [],
			fees: {
				[`${createDriveResult.metaDataTrxId}`]: createDriveResult.metaDataTrxReward,
				[`${createDriveResult.rootFolderTrxId}`]: createDriveResult.rootFolderTrxReward
			}
		});
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

		if (folderToUpload.skipThisUpload) {
			// Return empty estimation if this folder will be skipped, do not recurse
			return { totalPrice: W('0'), totalFilePrice: W('0'), communityWinstonTip: W('0') };
		}

		// Don't estimate cost of folder metadata if using existing folder
		if (!folderToUpload.existingId) {
			const folderMetadataTrxData = await (async () => {
				const folderName = folderToUpload.newFolderName ?? folderToUpload.getBaseFileName();

				if (driveKey) {
					return ArFSPrivateFolderTransactionData.from(folderName, driveKey);
				}
				return new ArFSPublicFolderTransactionData(folderName);
			})();
			const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
				folderMetadataTrxData.sizeOf()
			);
			const parentFolderWinstonPrice = metaDataBaseReward;

			// Assign base costs to folder
			folderToUpload.baseCosts = { metaDataBaseReward: parentFolderWinstonPrice };

			totalPrice = totalPrice.plus(parentFolderWinstonPrice);
		}

		for await (const file of folderToUpload.files) {
			if (file.skipThisUpload) {
				// Continue loop, won't upload this file
				continue;
			}

			const fileSize = driveKey ? file.encryptedDataSize() : new ByteCount(file.fileStats.size);

			const fileDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileSize);
			const destFileName = file.newFileName ?? file.getBaseFileName();

			const stubFileMetaData = driveKey
				? await this.stubPrivateFileMetadata(file, destFileName)
				: this.stubPublicFileMetadata(file, destFileName);
			const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
				stubFileMetaData.sizeOf()
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

	async estimateAndAssertCostOfFileUpload(
		decryptedFileSize: ByteCount,
		metaData: ArFSObjectTransactionData,
		drivePrivacy: DrivePrivacy
	): Promise<FileUploadBaseCosts> {
		let fileSize = decryptedFileSize;
		if (drivePrivacy === 'private') {
			fileSize = this.encryptedDataSize(fileSize);
		}

		let totalPrice = W(0);
		let fileDataBaseReward = W(0);
		let communityWinstonTip = W(0);
		if (fileSize) {
			fileDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(fileSize);
			communityWinstonTip = await this.communityOracle.getCommunityWinstonTip(fileDataBaseReward);
			const tipReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(new ByteCount(0));
			totalPrice = totalPrice.plus(fileDataBaseReward);
			totalPrice = totalPrice.plus(communityWinstonTip);
			totalPrice = totalPrice.plus(tipReward);
		}
		const metaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(metaData.sizeOf());
		totalPrice = totalPrice.plus(metaDataBaseReward);

		const totalWinstonPrice = totalPrice;

		const walletHasBalance = await this.walletDao.walletHasBalance(this.wallet, totalWinstonPrice);

		if (!walletHasBalance) {
			const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

			throw new Error(
				`Wallet balance of ${walletBalance} Winston is not enough (${totalWinstonPrice}) for data upload of size ${fileSize} bytes!`
			);
		}

		return {
			fileDataBaseReward: fileDataBaseReward,
			metaDataBaseReward: metaDataBaseReward,
			communityWinstonTip
		};
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

	async estimateAndAssertCostOfDriveCreation(
		driveMetaData: ArFSDriveTransactionData,
		rootFolderMetaData: ArFSFolderTransactionData
	): Promise<DriveUploadBaseCosts> {
		let totalPrice = W(0);
		const driveMetaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
			driveMetaData.sizeOf()
		);
		totalPrice = totalPrice.plus(driveMetaDataBaseReward);
		const rootFolderMetaDataBaseReward = await this.priceEstimator.getBaseWinstonPriceForByteCount(
			rootFolderMetaData.sizeOf()
		);
		totalPrice = totalPrice.plus(rootFolderMetaDataBaseReward);

		const totalWinstonPrice = totalPrice;

		const walletHasBalance = await this.walletDao.walletHasBalance(this.wallet, totalWinstonPrice);

		if (!walletHasBalance) {
			const walletBalance = await this.walletDao.getWalletWinstonBalance(this.wallet);

			throw new Error(
				`Wallet balance of ${walletBalance} Winston is not enough (${totalPrice}) for drive creation!`
			);
		}

		return {
			driveMetaDataBaseReward,
			rootFolderMetaDataBaseReward
		};
	}

	public async getDriveIdForFileId(fileId: FileID): Promise<DriveID> {
		return this.arFsDao.getDriveIdForFileId(fileId);
	}

	public async getDriveIdForFolderId(folderId: FolderID): Promise<DriveID> {
		return this.arFsDao.getDriveIdForFolderId(folderId);
	}

	// Provides for stubbing metadata during cost estimations since the data trx ID won't yet be known
	private stubPublicFileMetadata(
		wrappedFile: ArFSEntityToUpload,
		destinationFileName?: string
	): ArFSPublicFileMetadataTransactionData {
		const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

		return new ArFSPublicFileMetadataTransactionData(
			destinationFileName ?? wrappedFile.getBaseFileName(),
			fileSize,
			lastModifiedDateMS,
			stubTransactionID,
			dataContentType
		);
	}

	// Provides for stubbing metadata during cost estimations since the data trx and File IDs won't yet be known
	private async stubPrivateFileMetadata(
		wrappedFile: ArFSFileToUpload,
		destinationFileName?: string
	): Promise<ArFSPrivateFileMetadataTransactionData> {
		const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

		return await ArFSPrivateFileMetadataTransactionData.from(
			destinationFileName ?? wrappedFile.getBaseFileName(),
			fileSize,
			lastModifiedDateMS,
			stubTransactionID,
			dataContentType,
			fakeEntityId,
			await deriveDriveKey(
				'stubPassword',
				`${fakeEntityId}`,
				JSON.stringify((this.wallet as JWKWallet).getPrivateKey())
			)
		);
	}

	async assertValidPassword(password: string): Promise<void> {
		await this.arFsDao.assertValidPassword(password);
	}
}
