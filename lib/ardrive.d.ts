import { ArDriveAnonymous } from './ardrive_anonymous';
import { ArFSPrivateDrive, ArFSPrivateFolder, ArFSPrivateFile, ArFSPrivateFileOrFolderWithPaths } from './arfs/arfs_entities';
import { ArFSFolderToUpload } from './arfs/arfs_file_wrapper';
import { ArFSFileMetadataTransactionData, ArFSObjectTransactionData, ArFSDriveTransactionData, ArFSFolderTransactionData } from './arfs/arfs_trx_data_types';
import { ArFSDAO } from './arfs/arfsdao';
import { CommunityOracle } from './community/community_oracle';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import { FeeMultiple, ArweaveAddress, ByteCount, TipType, GQLTagInterface, FolderID, DriveKey, Winston, DrivePrivacy, FileID, DriveID, UploadPublicFileParams, UploadPrivateFileParams, ArFSManifestResult, UploadPublicManifestParams } from './types';
import { CommunityTipParams, TipResult, MovePublicFileParams, ArFSResult, MovePrivateFileParams, MovePublicFolderParams, MovePrivateFolderParams, BulkPublicUploadParams, RecursivePublicBulkUploadParams, ArFSEntityData, ArFSFees, BulkPrivateUploadParams, RecursivePrivateBulkUploadParams, CreatePublicFolderParams, CreatePrivateFolderParams, CreatePublicDriveParams, CreatePrivateDriveParams, FileNameConflictResolution, GetPrivateDriveParams, GetPrivateFolderParams, GetPrivateFileParams, ListPrivateFolderParams, MetaDataBaseCosts, FileUploadBaseCosts, DriveUploadBaseCosts } from './types';
import { Wallet } from './wallet';
import { WalletDAO } from './wallet_dao';
export declare class ArDrive extends ArDriveAnonymous {
    private readonly wallet;
    private readonly walletDao;
    protected readonly arFsDao: ArFSDAO;
    private readonly communityOracle;
    private readonly appName;
    private readonly appVersion;
    private readonly priceEstimator;
    private readonly feeMultiple;
    private readonly dryRun;
    constructor(wallet: Wallet, walletDao: WalletDAO, arFsDao: ArFSDAO, communityOracle: CommunityOracle, appName: string, appVersion: string, priceEstimator?: ARDataPriceEstimator, feeMultiple?: FeeMultiple, dryRun?: boolean);
    sendCommunityTip({ communityWinstonTip, assertBalance }: CommunityTipParams): Promise<TipResult>;
    getTipTags(tipType?: TipType): GQLTagInterface[];
    movePublicFile({ fileId, newParentFolderId }: MovePublicFileParams): Promise<ArFSResult>;
    movePrivateFile({ fileId, newParentFolderId, driveKey }: MovePrivateFileParams): Promise<ArFSResult>;
    movePublicFolder({ folderId, newParentFolderId }: MovePublicFolderParams): Promise<ArFSResult>;
    movePrivateFolder({ folderId, newParentFolderId, driveKey }: MovePrivateFolderParams): Promise<ArFSResult>;
    uploadPublicFile({ parentFolderId, wrappedFile, destinationFileName, conflictResolution }: UploadPublicFileParams): Promise<ArFSResult>;
    createPublicFolderAndUploadChildren({ parentFolderId, wrappedFolder, destParentFolderName, conflictResolution }: BulkPublicUploadParams): Promise<ArFSResult>;
    protected recursivelyCreatePublicFolderAndUploadChildren({ parentFolderId, wrappedFolder, driveId, owner, conflictResolution }: RecursivePublicBulkUploadParams): Promise<{
        entityResults: ArFSEntityData[];
        feeResults: ArFSFees;
    }>;
    /** Computes the size of a private file encrypted with AES256-GCM */
    encryptedDataSize(dataSize: ByteCount): ByteCount;
    uploadPrivateFile({ parentFolderId, wrappedFile, driveKey, destinationFileName, conflictResolution }: UploadPrivateFileParams): Promise<ArFSResult>;
    createPrivateFolderAndUploadChildren({ parentFolderId, wrappedFolder, driveKey, destParentFolderName, conflictResolution }: BulkPrivateUploadParams): Promise<ArFSResult>;
    protected checkAndAssignExistingPublicNames(wrappedFolder: ArFSFolderToUpload): Promise<void>;
    protected checkAndAssignExistingPrivateNames(wrappedFolder: ArFSFolderToUpload, driveKey: DriveKey): Promise<void>;
    protected recursivelyCreatePrivateFolderAndUploadChildren({ wrappedFolder, driveId, parentFolderId, driveKey, owner, conflictResolution }: RecursivePrivateBulkUploadParams): Promise<{
        entityResults: ArFSEntityData[];
        feeResults: ArFSFees;
    }>;
    uploadPublicManifest({ folderId, driveId, destManifestName, maxDepth }: UploadPublicManifestParams): Promise<ArFSManifestResult>;
    createPublicFolder({ folderName, driveId, parentFolderId }: CreatePublicFolderParams): Promise<ArFSResult>;
    createPrivateFolder({ folderName, driveId, driveKey, parentFolderId }: CreatePrivateFolderParams): Promise<ArFSResult>;
    createPublicDrive({ driveName }: CreatePublicDriveParams): Promise<ArFSResult>;
    createPrivateDrive({ driveName, newPrivateDriveData }: CreatePrivateDriveParams): Promise<ArFSResult>;
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
    estimateAndAssertCostOfBulkUpload(folderToUpload: ArFSFolderToUpload, conflictResolution: FileNameConflictResolution, driveKey?: DriveKey, isParentFolder?: boolean): Promise<{
        totalPrice: Winston;
        totalFilePrice: Winston;
        communityWinstonTip: Winston;
    }>;
    assertOwnerAddress(owner: ArweaveAddress): Promise<void>;
    getPrivateDrive({ driveId, driveKey, owner }: GetPrivateDriveParams): Promise<ArFSPrivateDrive>;
    getPrivateFolder({ folderId, driveKey, owner }: GetPrivateFolderParams): Promise<ArFSPrivateFolder>;
    getPrivateFile({ fileId, driveKey, owner }: GetPrivateFileParams): Promise<ArFSPrivateFile>;
    /**
     * Lists the children of certain private folder
     * @param {FolderID} folderId the folder ID to list children of
     * @returns {ArFSPrivateFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPrivateFolder({ folderId, driveKey, maxDepth, includeRoot, owner }: ListPrivateFolderParams): Promise<ArFSPrivateFileOrFolderWithPaths[]>;
    estimateAndAssertCostOfMoveFile(fileTransactionData: ArFSFileMetadataTransactionData): Promise<MetaDataBaseCosts>;
    estimateAndAssertCostOfFileUpload(decryptedFileSize: ByteCount, metaData: ArFSObjectTransactionData, drivePrivacy: DrivePrivacy): Promise<FileUploadBaseCosts>;
    estimateAndAssertCostOfFolderUpload(metaData: ArFSObjectTransactionData): Promise<MetaDataBaseCosts>;
    estimateAndAssertCostOfDriveCreation(driveMetaData: ArFSDriveTransactionData, rootFolderMetaData: ArFSFolderTransactionData): Promise<DriveUploadBaseCosts>;
    getDriveIdForFileId(fileId: FileID): Promise<DriveID>;
    getDriveIdForFolderId(folderId: FolderID): Promise<DriveID>;
    private stubPublicFileMetadata;
    private stubPrivateFileMetadata;
    assertValidPassword(password: string): Promise<void>;
}
