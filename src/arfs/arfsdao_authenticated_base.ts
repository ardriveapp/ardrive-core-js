/**
 * Shared base class for authenticated ArFS DAO operations
 * Contains upload-agnostic logic for metadata preparation and validation
 * Subclasses implement platform-specific upload mechanisms (V2 transactions vs Turbo DataItems)
 */

import { v4 as uuidv4 } from 'uuid';
import { DataItem, bundleAndSignData, createData } from '@dha-team/arbundles';
import type Arweave from 'arweave';
import { ArFSDAOAnonymous, ArFSAnonymousCache } from './arfsdao_anonymous';
import { TxPreparer } from './tx/tx_preparer';
import {
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPublicFolderMetaDataPrototype,
	ArFSEntityMetaDataPrototype,
	ArFSPublicDriveMetaDataPrototype,
	ArFSPrivateDriveMetaDataPrototype
} from './tx/arfs_prototypes';
import { ArFSCreateFolderResult } from './arfs_entity_result_factory';
import { EID, TransactionID, TxID, FolderID, RewardSettings, DriveID, DriveKey, FileID } from '../types';
import { ArFSPrivateCreateFolderParams, ArFSPublicCreateFolderParams } from '../types/arfsdao_types';
import { ArFSPublicFile, ArFSPrivateFile, ArFSPublicFolder, ArFSPrivateFolder } from './arfs_entities';
import { ArFSPublicFileMetaDataPrototype, ArFSPrivateFileMetaDataPrototype } from './tx/arfs_prototypes';
import { ArFSPublicFileMetadataTransactionData, ArFSPrivateFileMetadataTransactionData } from './tx/arfs_tx_data_types';
import {
	ArFSPrivateFolderTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPrivateDriveTransactionData
} from './tx/arfs_tx_data_types';
import { TurboUploadDataItemResponse } from '@ardrive/turbo-sdk';
import { GatewayAPI } from '../utils/gateway_api';

/**
 * Result of preparing folder metadata (before upload)
 */
export interface PrepareFolderMetadataResult {
	folderId: FolderID;
	prototype: ArFSEntityMetaDataPrototype;
	folderData: ArFSPrivateFolderTransactionData | ArFSPublicFolderTransactionData;
}

/**
 * Abstract base class for authenticated ArFS DAO operations
 * Provides shared logic for metadata preparation and validation
 * Subclasses must implement platform-specific upload methods
 */
export abstract class ArFSDAOAuthenticatedBase extends ArFSDAOAnonymous {
	protected abstract readonly txPreparer: TxPreparer;

	constructor(
		arweave: Arweave | null,
		appName: string,
		appVersion: string,
		caches: ArFSAnonymousCache,
		gatewayApi?: GatewayAPI
	) {
		// Pass null as unknown to satisfy parent constructor (web doesn't use arweave instance)
		super(arweave as unknown as Arweave, appName, appVersion, caches, gatewayApi);
	}

	/**
	 * Abstract method: Upload a DataItem to the network
	 * Subclasses implement this for their specific upload mechanism (Turbo, etc.)
	 */
	protected abstract uploadDataItem(
		dataItem: DataItem
	): Promise<{ id: string } & Partial<Pick<TurboUploadDataItemResponse, 'dataCaches' | 'fastFinalityIndexes'>>>;

	/**
	 * Shared logic: Upload metadata as DataItem
	 * Works for both Node (Turbo) and Web (TurboWeb)
	 */
	protected async uploadMetaData<P extends ArFSEntityMetaDataPrototype>(
		objectMetaData: P,
		rewardSettings?: RewardSettings
	): Promise<
		{ id: TransactionID } & Partial<Pick<TurboUploadDataItemResponse, 'dataCaches' | 'fastFinalityIndexes'>>
	> {
		if (rewardSettings) {
			// If rewardSettings provided, subclass should handle V2 transaction upload
			// This is Node-specific and will be overridden in ArFSDAO
			throw new Error('V2 transaction upload not supported in base class. Override uploadMetaData in subclass.');
		}

		// Absence of rewardSettings implies we will send to turbo as DataItem
		const metaDataDataItem = await this.txPreparer.prepareMetaDataDataItem({
			objectMetaData
		});

		const result = await this.uploadDataItem(metaDataDataItem);

		return {
			id: TxID(result.id),
			dataCaches: result.dataCaches,
			fastFinalityIndexes: result.fastFinalityIndexes
		};
	}

	/**
	 * Shared logic: Prepare private folder metadata
	 * Returns metadata ready for upload (platform-agnostic)
	 */
	protected async preparePrivateFolderMetadata({
		driveId,
		parentFolderId,
		folderData
	}: Omit<ArFSPrivateCreateFolderParams, 'rewardSettings'>): Promise<PrepareFolderMetadataResult> {
		const folderId = EID(uuidv4());
		const prototype = new ArFSPrivateFolderMetaDataPrototype(driveId, folderId, folderData, parentFolderId);

		return {
			folderId,
			prototype,
			folderData
		};
	}

	/**
	 * Shared logic: Prepare public folder metadata
	 * Returns metadata ready for upload (platform-agnostic)
	 */
	protected async preparePublicFolderMetadata({
		driveId,
		parentFolderId,
		folderData
	}: Omit<ArFSPublicCreateFolderParams, 'rewardSettings'>): Promise<PrepareFolderMetadataResult> {
		const folderId = EID(uuidv4());
		const prototype = new ArFSPublicFolderMetaDataPrototype(folderData, driveId, folderId, parentFolderId);

		return {
			folderId,
			prototype,
			folderData
		};
	}

	/**
	 * Create a private folder (Turbo/DataItem only)
	 * For V2 transactions, override in subclass
	 */
	public async createPrivateFolder({
		driveId,
		rewardSettings,
		parentFolderId,
		folderData
	}: ArFSPrivateCreateFolderParams): Promise<ArFSCreateFolderResult> {
		const { folderId, prototype } = await this.preparePrivateFolderMetadata({
			driveId,
			parentFolderId,
			folderData
		});

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(prototype, rewardSettings);

		return {
			folderId,
			metaDataTxId: id,
			metaDataTxReward: rewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	/**
	 * Create a public folder (Turbo/DataItem only)
	 * For V2 transactions, override in subclass
	 */
	public async createPublicFolder({
		driveId,
		rewardSettings,
		parentFolderId,
		folderData
	}: ArFSPublicCreateFolderParams): Promise<ArFSCreateFolderResult> {
		const { folderId, prototype } = await this.preparePublicFolderMetadata({
			driveId,
			parentFolderId,
			folderData
		});

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(prototype, rewardSettings);

		return {
			folderId,
			metaDataTxId: id,
			metaDataTxReward: rewardSettings?.reward,
			dataCaches,
			fastFinalityIndexes
		};
	}

	/**
	 * Create a public drive (Turbo/DataItem only)
	 * Creates both drive and root folder as a bundle
	 */
	public async createPublicDrive({ driveName }: { driveName: string }): Promise<{
		driveId: DriveID;
		rootFolderId: FolderID;
		metaDataTxId: TransactionID;
		rootFolderTxId: TransactionID;
		bundleTxId: TransactionID;
		dataCaches?: string[];
		fastFinalityIndexes?: string[];
	}> {
		// Generate IDs
		const driveId = EID(uuidv4());
		const rootFolderId = EID(uuidv4());

		// Create folder data
		const folderData = new ArFSPublicFolderTransactionData(driveName);
		const folderPrototype = new ArFSPublicFolderMetaDataPrototype(folderData, driveId, rootFolderId);

		// Create drive data
		const driveData = new ArFSPublicDriveTransactionData(driveName, rootFolderId);
		const drivePrototype = new ArFSPublicDriveMetaDataPrototype(driveData, driveId);

		// Prepare DataItems
		const folderDataItem = await this.txPreparer.prepareMetaDataDataItem({ objectMetaData: folderPrototype });
		const driveDataItem = await this.txPreparer.prepareMetaDataDataItem({ objectMetaData: drivePrototype });

		// Bundle and upload with proper bundle tags
		const bundle = await bundleAndSignData([folderDataItem, driveDataItem], this.txPreparer['signer']);
		const bundleTags = this.txPreparer['tagAssembler']['arFSTagSettings'].baseBundleTags;
		const bundleDataItem = createData(bundle.getRaw(), this.txPreparer['signer'], {
			tags: bundleTags
		});
		await bundleDataItem.sign(this.txPreparer['signer']);

		const result = await this.uploadDataItem(bundleDataItem);

		return {
			driveId,
			rootFolderId,
			metaDataTxId: TxID(driveDataItem.id),
			rootFolderTxId: TxID(folderDataItem.id),
			bundleTxId: TxID(bundleDataItem.id),
			dataCaches: result.dataCaches,
			fastFinalityIndexes: result.fastFinalityIndexes
		};
	}

	/**
	 * Create a private drive (Turbo/DataItem only)
	 * Creates both drive and root folder as a bundle
	 *
	 * @param newDriveData - PrivateDriveKeyData containing both driveId and driveKey (use PrivateDriveKeyData.from() to create)
	 * @param driveName - Name for the new drive
	 */
	public async createPrivateDrive({
		driveName,
		newDriveData
	}: {
		driveName: string;
		newDriveData: { driveId: DriveID; driveKey: DriveKey };
	}): Promise<{
		driveId: DriveID;
		rootFolderId: FolderID;
		metaDataTxId: TransactionID;
		rootFolderTxId: TransactionID;
		bundleTxId: TransactionID;
		driveKey: DriveKey;
		dataCaches?: string[];
		fastFinalityIndexes?: string[];
	}> {
		// Use the drive ID from newDriveData (which was used to derive the key)
		const driveId = newDriveData.driveId;
		const driveKey = newDriveData.driveKey;
		const rootFolderId = EID(uuidv4());

		// Create encrypted folder data
		const folderData = await ArFSPrivateFolderTransactionData.from(driveName, driveKey);
		const folderPrototype = new ArFSPrivateFolderMetaDataPrototype(driveId, rootFolderId, folderData);

		// Create encrypted drive data
		const driveData = await ArFSPrivateDriveTransactionData.from(driveName, rootFolderId, driveKey);
		const drivePrototype = new ArFSPrivateDriveMetaDataPrototype(driveId, driveData);

		// Prepare DataItems
		const folderDataItem = await this.txPreparer.prepareMetaDataDataItem({ objectMetaData: folderPrototype });
		const driveDataItem = await this.txPreparer.prepareMetaDataDataItem({ objectMetaData: drivePrototype });

		// Bundle and upload with proper bundle tags
		const bundle = await bundleAndSignData([folderDataItem, driveDataItem], this.txPreparer['signer']);
		const bundleTags = this.txPreparer['tagAssembler']['arFSTagSettings'].baseBundleTags;
		const bundleDataItem = createData(bundle.getRaw(), this.txPreparer['signer'], {
			tags: bundleTags
		});
		await bundleDataItem.sign(this.txPreparer['signer']);

		const result = await this.uploadDataItem(bundleDataItem);

		return {
			driveId,
			rootFolderId,
			metaDataTxId: TxID(driveDataItem.id),
			rootFolderTxId: TxID(folderDataItem.id),
			bundleTxId: TxID(bundleDataItem.id),
			driveKey,
			dataCaches: result.dataCaches,
			fastFinalityIndexes: result.fastFinalityIndexes
		};
	}

	/**
	 * Move a public file to a new parent folder
	 */
	public async movePublicFile({
		fileId,
		newParentFolderId,
		originalMetaData
	}: {
		fileId: FileID;
		newParentFolderId: FolderID;
		originalMetaData: ArFSPublicFile;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = new ArFSPublicFileMetadataTransactionData(
			originalMetaData.name,
			originalMetaData.size,
			originalMetaData.lastModifiedDate,
			originalMetaData.dataTxId,
			originalMetaData.dataContentType,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFileMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				fileId,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Move a private file to a new parent folder
	 */
	public async movePrivateFile({
		fileId,
		newParentFolderId,
		originalMetaData,
		driveKey
	}: {
		fileId: FileID;
		newParentFolderId: FolderID;
		originalMetaData: ArFSPrivateFile;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = await ArFSPrivateFileMetadataTransactionData.from(
			originalMetaData.name,
			originalMetaData.size,
			originalMetaData.lastModifiedDate,
			originalMetaData.dataTxId,
			originalMetaData.dataContentType,
			fileId,
			driveKey,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFileMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				fileId,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Move a public folder to a new parent folder
	 */
	public async movePublicFolder({
		folderId,
		newParentFolderId,
		originalMetaData
	}: {
		folderId: FolderID;
		newParentFolderId: FolderID;
		originalMetaData: ArFSPublicFolder;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = new ArFSPublicFolderTransactionData(
			originalMetaData.name,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFolderMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				folderId,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Move a private folder to a new parent folder
	 */
	public async movePrivateFolder({
		folderId,
		newParentFolderId,
		originalMetaData,
		driveKey
	}: {
		folderId: FolderID;
		newParentFolderId: FolderID;
		originalMetaData: ArFSPrivateFolder;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = await ArFSPrivateFolderTransactionData.from(
			originalMetaData.name,
			driveKey,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFolderMetaDataPrototype(
				originalMetaData.driveId,
				folderId,
				transactionData,
				newParentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Rename a public file
	 */
	public async renamePublicFile({
		fileId,
		newName,
		originalMetaData
	}: {
		fileId: FileID;
		newName: string;
		originalMetaData: ArFSPublicFile;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = new ArFSPublicFileMetadataTransactionData(
			newName, // Updated name
			originalMetaData.size,
			originalMetaData.lastModifiedDate,
			originalMetaData.dataTxId,
			originalMetaData.dataContentType,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFileMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				fileId,
				originalMetaData.parentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Rename a private file
	 */
	public async renamePrivateFile({
		fileId,
		newName,
		originalMetaData,
		driveKey
	}: {
		fileId: FileID;
		newName: string;
		originalMetaData: ArFSPrivateFile;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = await ArFSPrivateFileMetadataTransactionData.from(
			newName, // Updated name
			originalMetaData.size,
			originalMetaData.lastModifiedDate,
			originalMetaData.dataTxId,
			originalMetaData.dataContentType,
			fileId,
			driveKey,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFileMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				fileId,
				originalMetaData.parentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Rename a public folder
	 */
	public async renamePublicFolder({
		folderId,
		newName,
		originalMetaData
	}: {
		folderId: FolderID;
		newName: string;
		originalMetaData: ArFSPublicFolder;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = new ArFSPublicFolderTransactionData(
			newName, // Updated name
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPublicFolderMetaDataPrototype(
				transactionData,
				originalMetaData.driveId,
				folderId,
				originalMetaData.parentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}

	/**
	 * Rename a private folder
	 */
	public async renamePrivateFolder({
		folderId,
		newName,
		originalMetaData,
		driveKey
	}: {
		folderId: FolderID;
		newName: string;
		originalMetaData: ArFSPrivateFolder;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: TransactionID; dataCaches?: string[]; fastFinalityIndexes?: string[] }> {
		const transactionData = await ArFSPrivateFolderTransactionData.from(
			newName, // Updated name
			driveKey,
			originalMetaData.customMetaDataJson
		);

		const { id, dataCaches, fastFinalityIndexes } = await this.uploadMetaData(
			new ArFSPrivateFolderMetaDataPrototype(
				originalMetaData.driveId,
				folderId,
				transactionData,
				originalMetaData.parentFolderId,
				originalMetaData.customMetaDataGqlTags
			),
			undefined // Turbo upload
		);

		return { metaDataTxId: id, dataCaches, fastFinalityIndexes };
	}
}
