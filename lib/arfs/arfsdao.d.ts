import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import Transaction from 'arweave/node/lib/transaction';
import { ArFSFileOrFolderBuilder } from './arfs_builders/arfs_builders';
import { ArFSFileOrFolderEntity, ArFSPublicDrive, ArFSPrivateDrive, ArFSPublicFile, ArFSPrivateFile, ArFSPublicFolder, ArFSPrivateFolder, ArFSPrivateFileOrFolderWithPaths } from './arfs_entities';
import { ArFSCreateFolderResult, WithDriveKey, ArFSCreateDriveResult, ArFSCreateDriveResultFactory, ArFSCreatePrivateDriveResult, ArFSMoveEntityResult, ArFSMoveEntityResultFactory, ArFSMovePublicFileResult, ArFSMovePrivateFileResult, ArFSMovePublicFolderResult, ArFSMovePrivateFolderResult, ArFSUploadFileResult, ArFSUploadFileResultFactory, ArFSUploadPrivateFileResult } from './arfs_entity_result_factory';
import { ArFSEntityToUpload } from './arfs_file_wrapper';
import { FolderMetaDataFactory, CreateDriveMetaDataFactory, MoveEntityMetaDataFactory, FileDataPrototypeFactory, FileMetadataTrxDataFactory, FileMetaDataFactory } from './arfs_meta_data_factory';
import { ArFSObjectMetadataPrototype } from './arfs_prototypes';
import { ArFSObjectTransactionData, ArFSPublicFolderTransactionData, ArFSPrivateFolderTransactionData, ArFSPublicFileMetadataTransactionData, ArFSPrivateFileMetadataTransactionData, ArFSFileMetadataTransactionData } from './arfs_trx_data_types';
import { ArFSAllPublicFoldersOfDriveParams, ArFSDAOAnonymous } from './arfsdao_anonymous';
import { ArweaveAddress, GQLTagInterface, GQLNodeInterface, ListPrivateFolderParams, DriveID, DriveKey, FolderID, RewardSettings, FileID } from '../types';
import { EntityNamesAndIds } from '../utils/mapper_functions';
import { Wallet } from '../wallet';
export declare class PrivateDriveKeyData {
    readonly driveId: DriveID;
    readonly driveKey: DriveKey;
    private constructor();
    static from(drivePassword: string, privateKey: JWKInterface): Promise<PrivateDriveKeyData>;
}
export interface ArFSMoveParams<O extends ArFSFileOrFolderEntity, T extends ArFSObjectTransactionData> {
    originalMetaData: O;
    newParentFolderId: FolderID;
    metaDataBaseReward: RewardSettings;
    transactionData: T;
}
export declare type GetDriveFunction = () => Promise<ArFSPublicDrive | ArFSPrivateDrive>;
export declare type CreateFolderFunction = (driveId: DriveID) => Promise<ArFSCreateFolderResult>;
export declare type GenerateDriveIdFn = () => DriveID;
export declare type ArFSListPrivateFolderParams = Required<ListPrivateFolderParams>;
export interface ArFSUploadPublicFileParams {
    parentFolderId: FolderID;
    wrappedFile: ArFSEntityToUpload;
    driveId: DriveID;
    fileDataRewardSettings: RewardSettings;
    metadataRewardSettings: RewardSettings;
    destFileName?: string;
    existingFileId?: FileID;
}
export interface ArFSUploadPrivateFileParams extends ArFSUploadPublicFileParams {
    driveKey: DriveKey;
}
export declare type ArFSAllPrivateFoldersOfDriveParams = ArFSAllPublicFoldersOfDriveParams & WithDriveKey;
export interface CreateFolderSettings {
    driveId: DriveID;
    rewardSettings: RewardSettings;
    parentFolderId?: FolderID;
    syncParentFolderId?: boolean;
    owner: ArweaveAddress;
}
export interface CreatePublicFolderSettings extends CreateFolderSettings {
    folderData: ArFSPublicFolderTransactionData;
}
export interface CreatePrivateFolderSettings extends CreateFolderSettings {
    folderData: ArFSPrivateFolderTransactionData;
    driveKey: DriveKey;
}
interface getPublicChildrenFolderIdsParams {
    folderId: FolderID;
    driveId: DriveID;
    owner: ArweaveAddress;
}
interface getPrivateChildrenFolderIdsParams extends getPublicChildrenFolderIdsParams {
    driveKey: DriveKey;
}
export declare class ArFSDAO extends ArFSDAOAnonymous {
    private readonly wallet;
    private readonly dryRun;
    protected appName: string;
    protected appVersion: any;
    constructor(wallet: Wallet, arweave: Arweave, dryRun?: boolean, appName?: string, appVersion?: any);
    createFolder({ driveId, rewardSettings, parentFolderId, syncParentFolderId }: CreateFolderSettings, getDriveFn: GetDriveFunction, folderPrototypeFactory: FolderMetaDataFactory): Promise<ArFSCreateFolderResult>;
    createPublicFolder({ folderData, driveId, rewardSettings, parentFolderId, syncParentFolderId, owner }: CreatePublicFolderSettings): Promise<ArFSCreateFolderResult>;
    createPrivateFolder({ folderData, driveId, driveKey, parentFolderId, rewardSettings, syncParentFolderId, owner }: CreatePrivateFolderSettings): Promise<ArFSCreateFolderResult>;
    createDrive<R extends ArFSCreateDriveResult>(driveRewardSettings: RewardSettings, generateDriveIdFn: GenerateDriveIdFn, createFolderFn: CreateFolderFunction, createMetadataFn: CreateDriveMetaDataFactory, resultFactory: ArFSCreateDriveResultFactory<R>): Promise<R>;
    createPublicDrive(driveName: string, driveRewardSettings: RewardSettings, rootFolderRewardSettings: RewardSettings, owner: ArweaveAddress): Promise<ArFSCreateDriveResult>;
    createPrivateDrive(driveName: string, newDriveData: PrivateDriveKeyData, driveRewardSettings: RewardSettings, rootFolderRewardSettings: RewardSettings, owner: ArweaveAddress): Promise<ArFSCreatePrivateDriveResult>;
    moveEntity<R extends ArFSMoveEntityResult>(metaDataBaseReward: RewardSettings, metaDataFactory: MoveEntityMetaDataFactory, resultFactory: ArFSMoveEntityResultFactory<R>): Promise<R>;
    movePublicFile({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }: ArFSMoveParams<ArFSPublicFile, ArFSPublicFileMetadataTransactionData>): Promise<ArFSMovePublicFileResult>;
    movePrivateFile({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }: ArFSMoveParams<ArFSPrivateFile, ArFSPrivateFileMetadataTransactionData>): Promise<ArFSMovePrivateFileResult>;
    movePublicFolder({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }: ArFSMoveParams<ArFSPublicFolder, ArFSPublicFolderTransactionData>): Promise<ArFSMovePublicFolderResult>;
    movePrivateFolder({ metaDataBaseReward, originalMetaData, transactionData, newParentFolderId }: ArFSMoveParams<ArFSPrivateFolder, ArFSPrivateFolderTransactionData>): Promise<ArFSMovePrivateFolderResult>;
    uploadFile<R extends ArFSUploadFileResult, D extends ArFSFileMetadataTransactionData>(wrappedFile: ArFSEntityToUpload, fileDataRewardSettings: RewardSettings, metadataRewardSettings: RewardSettings, dataPrototypeFactoryFn: FileDataPrototypeFactory, metadataTrxDataFactoryFn: FileMetadataTrxDataFactory<D>, metadataFactoryFn: FileMetaDataFactory<D>, resultFactoryFn: ArFSUploadFileResultFactory<R, D>, destFileName?: string, existingFileId?: FileID): Promise<R>;
    uploadPublicFile({ parentFolderId, wrappedFile, driveId, fileDataRewardSettings, metadataRewardSettings, destFileName, existingFileId }: ArFSUploadPublicFileParams): Promise<ArFSUploadFileResult>;
    uploadPrivateFile({ parentFolderId, wrappedFile, driveId, driveKey, fileDataRewardSettings, metadataRewardSettings, destFileName, existingFileId }: ArFSUploadPrivateFileParams): Promise<ArFSUploadPrivateFileResult>;
    prepareArFSObjectTransaction(objectMetaData: ArFSObjectMetadataPrototype, rewardSettings?: RewardSettings, otherTags?: GQLTagInterface[]): Promise<Transaction>;
    getPrivateDrive(driveId: DriveID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateDrive>;
    getPrivateFolder(folderId: FolderID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFolder>;
    getPrivateFile(fileId: FileID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFile>;
    getAllFoldersOfPrivateDrive({ driveId, driveKey, owner, latestRevisionsOnly }: ArFSAllPrivateFoldersOfDriveParams): Promise<ArFSPrivateFolder[]>;
    getPrivateFilesWithParentFolderIds(folderIDs: FolderID[], driveKey: DriveKey, owner: ArweaveAddress, latestRevisionsOnly?: boolean): Promise<ArFSPrivateFile[]>;
    getEntitiesInFolder(parentFolderId: FolderID, builder: (node: GQLNodeInterface, entityType: 'file' | 'folder') => ArFSFileOrFolderBuilder<ArFSFileOrFolderEntity>, latestRevisionsOnly?: boolean, filterOnOwner?: boolean): Promise<ArFSFileOrFolderEntity[]>;
    getPrivateEntitiesInFolder(parentFolderId: FolderID, driveKey: DriveKey, latestRevisionsOnly?: boolean): Promise<ArFSFileOrFolderEntity[]>;
    getPublicEntitiesInFolder(parentFolderId: FolderID, latestRevisionsOnly?: boolean): Promise<ArFSFileOrFolderEntity[]>;
    getChildrenFolderIds(folderId: FolderID, allFolderEntitiesOfDrive: ArFSFileOrFolderEntity[]): Promise<FolderID[]>;
    getPrivateEntityNamesInFolder(folderId: FolderID, driveKey: DriveKey): Promise<string[]>;
    getPublicEntityNamesInFolder(folderId: FolderID): Promise<string[]>;
    getPublicNameConflictInfoInFolder(folderId: FolderID): Promise<EntityNamesAndIds>;
    getPrivateNameConflictInfoInFolder(folderId: FolderID, driveKey: DriveKey): Promise<EntityNamesAndIds>;
    getPrivateChildrenFolderIds({ folderId, driveId, driveKey, owner }: getPrivateChildrenFolderIdsParams): Promise<FolderID[]>;
    getPublicChildrenFolderIds({ folderId, owner, driveId }: getPublicChildrenFolderIdsParams): Promise<FolderID[]>;
    getOwnerAndAssertDrive(driveId: DriveID, driveKey?: DriveKey): Promise<ArweaveAddress>;
    /**
     * Lists the children of certain private folder
     * @param {FolderID} folderId the folder ID to list children of
     * @param {DriveKey} driveKey the drive key used for drive and folder data decryption and file key derivation
     * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
     * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
     * @returns {ArFSPrivateFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPrivateFolder({ folderId, driveKey, maxDepth, includeRoot, owner }: ArFSListPrivateFolderParams): Promise<ArFSPrivateFileOrFolderWithPaths[]>;
    assertValidPassword(password: string): Promise<void>;
}
export {};
