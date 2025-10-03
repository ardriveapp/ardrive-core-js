/**
 * Shared base class for authenticated ArFS DAO operations
 * Contains upload-agnostic logic for metadata preparation and validation
 * Subclasses implement platform-specific upload mechanisms (V2 transactions vs Turbo DataItems)
 */

import { v4 as uuidv4 } from 'uuid';
import { DataItem } from '@dha-team/arbundles';
import type Arweave from 'arweave';
import { ArFSDAOAnonymous, ArFSAnonymousCache } from './arfsdao_anonymous';
import { TxPreparer } from './tx/tx_preparer';
import {
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPublicFolderMetaDataPrototype,
	ArFSEntityMetaDataPrototype
} from './tx/arfs_prototypes';
import { ArFSCreateFolderResult } from './arfs_entity_result_factory';
import { EID, TransactionID, TxID, FolderID, RewardSettings } from '../types';
import { ArFSPrivateCreateFolderParams, ArFSPublicCreateFolderParams } from '../types/arfsdao_types';
import { ArFSPrivateFolderTransactionData, ArFSPublicFolderTransactionData } from './tx/arfs_tx_data_types';
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
}
