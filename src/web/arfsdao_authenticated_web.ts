/**
 * Browser-compatible authenticated ArFS DAO
 * Extends ArFSDAOAuthenticatedBase with browser-specific upload implementation
 * Uses TurboWeb for DataItem uploads
 */

import type { Signer, DataItem } from '@dha-team/arbundles';
import type Arweave from 'arweave';
import type { ArDriveSigner } from './ardrive_signer';
import { ArFSDAOAuthenticatedBase } from '../arfs/arfsdao_authenticated_base';
import { defaultArFSAnonymousCache, ArFSAnonymousCache } from '../arfs/arfsdao_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
import { TxPreparer } from '../arfs/tx/tx_preparer';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ArFSTagAssembler } from '../arfs/tags/tag_assembler';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION, gqlTagNameRecord } from '../utils/constants';
import { TurboWeb, TurboSettings } from './turbo_web';
import { TurboUploadDataItemResponse } from '@ardrive/turbo-sdk';
import {
	DriveID,
	ArweaveAddress,
	DriveSignatureInfo,
	DriveSignatureType,
	FolderID,
	FileID,
	DriveKey,
	ArFSListPrivateFolderParams,
	GQLEdgeInterface
} from '../types';
import { buildQuery, DESCENDING_ORDER } from '../utils/query';
import { parseDriveSignatureType } from '../utils/common_browser';
import {
	ArFSPrivateDrive,
	ArFSPrivateFolder,
	ArFSPrivateFile,
	ArFSPrivateFolderWithPaths,
	ArFSPrivateFileWithPaths,
	privateEntityWithPathsKeylessFactory
} from '../arfs/arfs_entities';
import { ArFSPrivateDriveBuilder } from '../arfs/arfs_builders/arfs_drive_builders';
import { ArFSPrivateFolderBuilder } from '../arfs/arfs_builders/arfs_folder_builders';
import { ArFSPrivateFileBuilder } from '../arfs/arfs_builders/arfs_file_builders';
import { FolderHierarchy } from '../arfs/folder_hierarchy';
import { latestRevisionFilter } from '../utils/filter_methods';
import { SeparatedFolderHierarchy } from '../types/arfsdao_types';
import { InvalidFileStateException } from '../types/exceptions';

/**
 * Authenticated DAO for browser that uses signer instead of wallet
 * Provides write operations without Node.js dependencies
 * Uses TurboWeb for uploading DataItems
 */
export class ArFSDAOAuthenticatedWeb extends ArFSDAOAuthenticatedBase {
	protected readonly txPreparer: TxPreparer;
	private readonly signer: Signer | ArDriveSigner;
	private readonly turbo?: TurboWeb;

	constructor(
		signer: Signer | ArDriveSigner,
		gatewayApi: GatewayAPI,
		appName = DEFAULT_APP_NAME,
		appVersion = DEFAULT_APP_VERSION,
		arFSTagSettings: ArFSTagSettings = new ArFSTagSettings({ appName, appVersion }),
		caches: ArFSAnonymousCache = defaultArFSAnonymousCache,
		turboSettings?: TurboSettings,
		dryRun = false
	) {
		// Call parent with null arweave (not used in browser)
		super(null as unknown as Arweave, appName, appVersion, caches, gatewayApi);

		this.signer = signer;
		this.txPreparer = new TxPreparer({
			arweave: null as unknown as Arweave,
			signer: signer,
			arFSTagAssembler: new ArFSTagAssembler(arFSTagSettings)
		});

		// Initialize Turbo if settings provided
		if (turboSettings) {
			this.turbo = new TurboWeb({
				...turboSettings,
				isDryRun: dryRun
			});
		}
	}

	/**
	 * Get the signer for external use
	 */
	getSigner(): Signer | ArDriveSigner {
		return this.signer;
	}

	/**
	 * Upload a DataItem using TurboWeb
	 * Implements abstract method from ArFSDAOAuthenticatedBase
	 */
	protected async uploadDataItem(
		dataItem: DataItem
	): Promise<{ id: string } & Partial<Pick<TurboUploadDataItemResponse, 'dataCaches' | 'fastFinalityIndexes'>>> {
		if (!this.turbo) {
			throw new Error('No Turbo uploader configured. Please provide turboSettings in constructor.');
		}

		const result = await this.turbo.sendDataItem(dataItem);

		return {
			id: result.id,
			dataCaches: result.dataCaches,
			fastFinalityIndexes: result.fastFinalityIndexes
		};
	}

	/**
	 * Get drive signature information for private drive key derivation
	 * This method queries the Arweave network for drive metadata and signature data
	 */
	async getDriveSignatureInfo(driveId: DriveID, address: ArweaveAddress): Promise<DriveSignatureInfo> {
		// Query for drive transaction
		const gqlDriveQuery = buildQuery({
			tags: [
				{ name: 'Drive-Id', value: `${driveId}` },
				{ name: 'Entity-Type', value: 'drive' }
			],
			owner: address,
			sort: DESCENDING_ORDER
		});

		const driveTransactions = await this.gatewayApi.gqlRequest(gqlDriveQuery);

		if (!driveTransactions.edges || driveTransactions.edges.length === 0) {
			throw new Error(`No drive found with ID ${driveId} for owner ${address}`);
		}

		// Check if drive is public (we only support private drives here)
		const drivePrivacyFromTag = driveTransactions.edges[0].node.tags.find(
			(t) => t.name === gqlTagNameRecord.drivePrivacy
		);

		if (drivePrivacyFromTag?.value === 'public') {
			throw new Error('Drive is public');
		}

		// Get signature type (defaults to v1 if not specified)
		const driveSignatureTypeTagData = driveTransactions.edges[0].node.tags.find(
			(t) => t.name === gqlTagNameRecord.signatureType
		);

		const driveSignatureType = driveSignatureTypeTagData?.value
			? parseDriveSignatureType(driveSignatureTypeTagData.value)
			: DriveSignatureType.v1;

		// For v1 drives, fetch encrypted signature data if it exists
		let encryptedSignatureData: { cipherIV: string; encryptedData: Buffer } | undefined;

		if (driveSignatureType === DriveSignatureType.v1) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Entity-Type', value: 'drive-signature' },
					{ name: 'Drive-Id', value: `${driveId}` }
				],
				owner: address,
				sort: DESCENDING_ORDER
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);

			if (transactions.edges && transactions.edges.length > 0) {
				const txId = transactions.edges[0].node.id;
				const cipherIVTag = transactions.edges[0].node.tags.find((t) => t.name === gqlTagNameRecord.cipherIv);

				if (!cipherIVTag || !cipherIVTag.value) {
					console.warn('No Cipher-IV tag found for drive signature transaction');
				} else {
					// Fetch the encrypted signature data using gateway URL directly
					// Can't use getPublicDataStream because it requires arweave instance (null in browser)
					const gatewayUrl = new URL(txId, this.gatewayApi['gatewayUrl'] || 'https://arweave.net/');
					const dataUrl = gatewayUrl.href;
					const response = await fetch(dataUrl);
					if (!response.ok) {
						throw new Error(`Failed to fetch encrypted signature data: ${response.statusText}`);
					}
					const arrayBuffer = await response.arrayBuffer();
					const combined = new Uint8Array(arrayBuffer);

					// Validate the cipher IV is valid base64
					const cipherIVValue = cipherIVTag.value.trim();

					encryptedSignatureData = {
						cipherIV: cipherIVValue,
						encryptedData: Buffer.from(combined)
					};
				}
			}
		}

		return {
			driveSignatureType,
			encryptedSignatureData
		};
	}

	/**
	 * Get private drive with drive key
	 * Note: Simplified implementation without caching for browser
	 */
	async getPrivateDrive(driveId: DriveID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateDrive> {
		const driveSignatureInfo = await this.getDriveSignatureInfo(driveId, owner);
		return new ArFSPrivateDriveBuilder({
			entityId: driveId,
			key: driveKey,
			owner,
			gatewayApi: this.gatewayApi,
			driveSignatureType: driveSignatureInfo?.driveSignatureType ?? DriveSignatureType.v1
		}).build();
	}

	/**
	 * Get private folder with drive key
	 * Note: Simplified implementation without caching for browser
	 */
	async getPrivateFolder(folderId: FolderID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFolder> {
		return new ArFSPrivateFolderBuilder(folderId, this.gatewayApi, driveKey, owner).build();
	}

	/**
	 * Get private file with drive key
	 * Note: Simplified implementation without caching for browser
	 */
	async getPrivateFile(fileId: FileID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFile> {
		return new ArFSPrivateFileBuilder(fileId, this.gatewayApi, driveKey, owner).build();
	}

	/**
	 * Get all folders of a private drive
	 */
	async getAllFoldersOfPrivateDrive({
		driveId,
		driveKey,
		owner,
		latestRevisionsOnly = false
	}: {
		driveId: DriveID;
		driveKey: DriveKey;
		owner: ArweaveAddress;
		latestRevisionsOnly?: boolean;
	}): Promise<ArFSPrivateFolder[]> {
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

			const folderPromises: Promise<ArFSPrivateFolder | null>[] = edges.map(async (edge: GQLEdgeInterface) => {
				try {
					cursor = edge.cursor;
					const { node } = edge;
					const folderBuilder = ArFSPrivateFolderBuilder.fromArweaveNode(node, this.gatewayApi, driveKey);
					const folder = await folderBuilder.build(node);
					return folder;
				} catch (e) {
					// If the folder is broken, skip it
					if (e instanceof SyntaxError) {
						console.error(`Error building folder. Skipping... Error: ${e}`);
						return null;
					}
					throw e;
				}
			});

			const folders = await Promise.all(folderPromises);
			const validFolders = folders.filter((f) => f !== null) as ArFSPrivateFolder[];
			allFolders.push(...validFolders);
		}

		return latestRevisionsOnly ? allFolders.filter(latestRevisionFilter) : allFolders;
	}

	/**
	 * Get private files with specific parent folder IDs
	 */
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

			const files: Promise<ArFSPrivateFile | null>[] = edges.map(async (edge: GQLEdgeInterface) => {
				try {
					cursor = edge.cursor;
					const { node } = edge;
					const fileBuilder = ArFSPrivateFileBuilder.fromArweaveNode(node, this.gatewayApi, driveKey);
					const file = await fileBuilder.build(node);
					return file;
				} catch (e) {
					if (e instanceof InvalidFileStateException) {
						console.error(`Error building file. Skipping... Error: ${e}`);
						return null;
					}
					throw e;
				}
			});

			const validFiles = (await Promise.all(files)).filter((f) => f !== null) as ArFSPrivateFile[];
			allFiles.push(...validFiles);
		}

		return latestRevisionsOnly ? allFiles.filter(latestRevisionFilter) : allFiles;
	}

	/**
	 * Build a separated hierarchy of folders and files for a given folder
	 */
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

		// Deduplicate files by entityId - when a file is moved, it appears in multiple parent folders
		// Keep only the latest revision (highest unixTime) for each unique fileId
		const uniqueFiles = childFiles.filter(latestRevisionFilter);

		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(folder.entityId, maxDepth + 1);
		const childFolders = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.some((folderId) => `${folderId}` === `${folder.entityId}`)
		);

		return { hierarchy, childFiles: uniqueFiles, childFolders };
	}

	/**
	 * List private folder contents with full hierarchy support
	 */
	async listPrivateFolder({
		folderId,
		driveKey,
		maxDepth = 0,
		includeRoot = false,
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
}
