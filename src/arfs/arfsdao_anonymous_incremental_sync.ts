import { ArFSDAOAnonymous, ArFSAnonymousCache, defaultArFSAnonymousCache } from './arfsdao_anonymous';
import {
	IncrementalSyncOptions,
	IncrementalSyncResult,
	DriveSyncState,
	EntitySyncState,
	SyncChangeSet,
	SyncStats,
	IncrementalSyncError,
	GQLEdgeInterface,
	GQLNodeInterface,
	DriveID,
	ArweaveAddress,
	UnixTime,
	DrivePrivacy,
	EntityID,
	EID
} from '../types';
import { ArFSPublicFile, ArFSPublicFolder, ArFSFileOrFolderEntity } from './arfs_entities';
import { ArFSPublicFolderBuilder } from './arfs_builders/arfs_folder_builders';
import { ArFSPublicFileBuilder } from './arfs_builders/arfs_file_builders';
import { buildQuery } from '../utils/query';
import { ASCENDING_ORDER } from '../utils/query';
import { latestRevisionFilter } from '../utils/filter_methods';
import { PromiseCache } from '@ardrive/ardrive-promise-cache';

/**
 * Extended cache interface that includes sync state caching
 */
export interface ArFSIncrementalSyncCache extends ArFSAnonymousCache {
	syncStateCache: PromiseCache<DriveID, DriveSyncState>;
}

/**
 * Default cache with sync state cache added
 */
export const defaultArFSIncrementalSyncCache: ArFSIncrementalSyncCache = {
	...defaultArFSAnonymousCache,
	syncStateCache: new PromiseCache<DriveID, DriveSyncState>({
		cacheCapacity: 100,
		cacheTTL: 1000 * 60 * 5 // 5 minutes for sync state
	})
};

/**
 * Extends ArFSDAOAnonymous with incremental sync capabilities
 */
export class ArFSDAOAnonymousIncrementalSync extends ArFSDAOAnonymous {
	declare protected caches: ArFSIncrementalSyncCache;

	/**
	 * Performs an incremental sync of a public drive
	 *
	 * @param driveId - The drive to sync
	 * @param owner - The drive owner
	 * @param options - Sync options including previous state
	 * @returns Sync results including entities and change detection
	 */
	async getPublicDriveIncrementalSync(
		driveId: DriveID,
		owner: ArweaveAddress,
		options: IncrementalSyncOptions = {}
	): Promise<IncrementalSyncResult> {
		const { syncState, includeRevisions = false, onProgress, batchSize = 100, stopAfterKnownCount = 10 } = options;

		const stats: SyncStats = {
			totalProcessed: 0,
			fromCache: 0,
			fromNetwork: 0,
			lowestBlockHeight: Number.MAX_SAFE_INTEGER,
			highestBlockHeight: 0
		};

		try {
			// Fetch drive metadata first to ensure it exists
			await this.getPublicDrive(driveId, owner);

			// Initialize or use provided sync state
			const currentSyncState: DriveSyncState = syncState || {
				driveId,
				drivePrivacy: 'public' as DrivePrivacy,
				lastSyncedBlockHeight: 0,
				lastSyncedTimestamp: new UnixTime(0),
				entityStates: new Map()
			};

			// Set minimum block height for queries
			const minBlock = syncState?.lastSyncedBlockHeight
				? syncState.lastSyncedBlockHeight + 1 // Start from next block
				: undefined;

			// Fetch all entities with optional block height filter
			const [folders, files] = await Promise.all([
				this.getIncrementalFolders(
					driveId,
					owner,
					minBlock,
					batchSize,
					onProgress,
					stats,
					stopAfterKnownCount,
					currentSyncState
				),
				this.getIncrementalFiles(
					driveId,
					owner,
					minBlock,
					batchSize,
					onProgress,
					stats,
					stopAfterKnownCount,
					currentSyncState
				)
			]);

			// Combine all entities
			const allEntities: ArFSFileOrFolderEntity<'file' | 'folder'>[] = [...folders, ...files];

			// Apply revision filter if requested
			const entities = includeRevisions ? allEntities : allEntities.filter(latestRevisionFilter);

			// Detect changes
			const changes = this.detectChanges(entities, currentSyncState);

			// Update sync state with new information
			const newSyncState = this.updateSyncState(currentSyncState, entities, stats);

			// Cache the new sync state
			this.caches.syncStateCache.put(driveId, Promise.resolve(newSyncState));

			return {
				entities,
				changes,
				newSyncState,
				stats
			};
		} catch (error) {
			// If we have partial results, throw an IncrementalSyncError
			if (stats.totalProcessed > 0) {
				throw new IncrementalSyncError(
					`Incremental sync failed after processing ${stats.totalProcessed} entities: ${(error as Error).message}`,
					{
						stats,
						newSyncState: syncState
					}
				);
			}
			throw error;
		}
	}

	/**
	 * Fetches folders incrementally with block height filtering
	 */
	private async getIncrementalFolders(
		driveId: DriveID,
		owner: ArweaveAddress,
		minBlock: number | undefined,
		batchSize: number,
		onProgress: ((processed: number, total: number) => void) | undefined,
		stats: SyncStats,
		stopAfterKnownCount: number,
		currentSyncState: DriveSyncState
	): Promise<ArFSPublicFolder[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFolders: ArFSPublicFolder[] = [];
		let knownEntityCount = 0;

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Entity-Type', value: 'folder' }
				],
				cursor,
				owner,
				minBlock,
				sort: ASCENDING_ORDER, // Process oldest first for consistent state
				first: batchSize
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges, pageInfo } = transactions;

			hasNextPage = pageInfo.hasNextPage;

			// Process batch
			const batchFolders = await this.processFolderBatch(edges, owner, stats);

			// Check for known entities (optimization)
			for (const folder of batchFolders) {
				const existing = currentSyncState.entityStates.get(`${folder.entityId}`);
				if (existing && existing.txId.equals(folder.txId)) {
					knownEntityCount++;
					if (knownEntityCount >= stopAfterKnownCount) {
						hasNextPage = false;
						break;
					}
				} else {
					knownEntityCount = 0; // Reset counter when we find new/modified entity
				}
			}

			allFolders.push(...batchFolders);
			stats.totalProcessed += edges.length;

			// Report progress
			onProgress?.(stats.totalProcessed, -1); // Total unknown during streaming

			if (edges.length > 0) {
				cursor = edges[edges.length - 1].cursor;
			}
		}

		return allFolders;
	}

	/**
	 * Fetches files incrementally with block height filtering
	 */
	private async getIncrementalFiles(
		driveId: DriveID,
		owner: ArweaveAddress,
		minBlock: number | undefined,
		batchSize: number,
		onProgress: ((processed: number, total: number) => void) | undefined,
		stats: SyncStats,
		stopAfterKnownCount: number,
		currentSyncState: DriveSyncState
	): Promise<ArFSPublicFile[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: ArFSPublicFile[] = [];
		let knownEntityCount = 0;

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Entity-Type', value: 'file' }
				],
				cursor,
				owner,
				minBlock,
				sort: ASCENDING_ORDER,
				first: batchSize
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges, pageInfo } = transactions;

			hasNextPage = pageInfo.hasNextPage;

			// Process batch
			const batchFiles = await this.processFileBatch(edges, owner, stats);

			// Check for known entities
			for (const file of batchFiles) {
				const existing = currentSyncState.entityStates.get(`${file.entityId}`);
				if (existing && existing.txId.equals(file.txId)) {
					knownEntityCount++;
					if (knownEntityCount >= stopAfterKnownCount) {
						hasNextPage = false;
						break;
					}
				} else {
					knownEntityCount = 0;
				}
			}

			allFiles.push(...batchFiles);
			stats.totalProcessed += edges.length;

			onProgress?.(stats.totalProcessed, -1);

			if (edges.length > 0) {
				cursor = edges[edges.length - 1].cursor;
			}
		}

		return allFiles;
	}

	/**
	 * Processes a batch of folder edges into ArFSPublicFolder entities
	 */
	private async processFolderBatch(
		edges: GQLEdgeInterface[],
		owner: ArweaveAddress,
		stats: SyncStats
	): Promise<ArFSPublicFolder[]> {
		const folders: Promise<ArFSPublicFolder>[] = edges.map(async (edge) => {
			const { node } = edge;

			// Update block height stats
			const blockHeight = node.block?.height || 0;
			stats.lowestBlockHeight = Math.min(stats.lowestBlockHeight, blockHeight);
			stats.highestBlockHeight = Math.max(stats.highestBlockHeight, blockHeight);

			// Check cache first
			const folderId = this.extractEntityId(node, 'Folder-Id');
			const cacheKey = { folderId, owner };
			const cached = this.caches.publicFolderCache.get(cacheKey);

			if (cached) {
				stats.fromCache++;
				return cached;
			}

			// Build from network
			stats.fromNetwork++;
			const folderBuilder = ArFSPublicFolderBuilder.fromArweaveNode(node, this.gatewayApi);
			const folder = await folderBuilder.build(node);

			// Cache the result
			this.caches.publicFolderCache.put(cacheKey, Promise.resolve(folder));

			return folder;
		});

		return Promise.all(folders);
	}

	/**
	 * Processes a batch of file edges into ArFSPublicFile entities
	 */
	private async processFileBatch(
		edges: GQLEdgeInterface[],
		owner: ArweaveAddress,
		stats: SyncStats
	): Promise<ArFSPublicFile[]> {
		const files: Promise<ArFSPublicFile>[] = edges.map(async (edge) => {
			const { node } = edge;

			// Update block height stats
			const blockHeight = node.block?.height || 0;
			stats.lowestBlockHeight = Math.min(stats.lowestBlockHeight, blockHeight);
			stats.highestBlockHeight = Math.max(stats.highestBlockHeight, blockHeight);

			// Check cache first
			const fileId = this.extractEntityId(node, 'File-Id');
			const cacheKey = { fileId, owner };
			const cached = this.caches.publicFileCache.get(cacheKey);

			if (cached) {
				stats.fromCache++;
				return cached;
			}

			// Build from network
			stats.fromNetwork++;
			const fileBuilder = ArFSPublicFileBuilder.fromArweaveNode(node, this.gatewayApi);
			const file = await fileBuilder.build(node);

			// Cache the result
			this.caches.publicFileCache.put(cacheKey, Promise.resolve(file));

			return file;
		});

		return Promise.all(files);
	}

	/**
	 * Extracts entity ID from node tags
	 */
	private extractEntityId(node: GQLNodeInterface, tagName: string): EntityID {
		const tag = node.tags.find((t) => t.name === tagName);
		if (!tag) {
			throw new Error(`${tagName} tag not found in transaction ${node.id}`);
		}
		return EID(tag.value);
	}

	/**
	 * Gets the cached sync state for a drive
	 */
	async getCachedSyncState(driveId: DriveID): Promise<DriveSyncState | undefined> {
		return this.caches.syncStateCache.get(driveId);
	}

	/**
	 * Sets the cached sync state for a drive
	 */
	setCachedSyncState(driveId: DriveID, syncState: DriveSyncState): void {
		this.caches.syncStateCache.put(driveId, Promise.resolve(syncState));
	}

	/**
	 * Detects changes between current entities and sync state
	 */
	private detectChanges(
		entities: ArFSFileOrFolderEntity<'file' | 'folder'>[],
		syncState: DriveSyncState
	): SyncChangeSet {
		const added: EntitySyncState[] = [];
		const modified: EntitySyncState[] = [];
		const entityIds = new Set<string>();

		for (const entity of entities) {
			const entityKey = `${entity.entityId}`;
			entityIds.add(entityKey);

			const prevState = syncState.entityStates.get(entityKey);
			const currentState: EntitySyncState = {
				entityId: entity.entityId,
				txId: entity.txId,
				blockHeight: entity.blockHeight,
				parentFolderId: entity.parentFolderId,
				name: entity.name,
				entityType: entity.entityType
			};

			if (!prevState) {
				added.push(currentState);
			} else if (!prevState.txId.equals(entity.txId)) {
				modified.push(currentState);
			}
		}

		// Detect unreachable entities (e.g. permissions changed, ownership transferred)
		const unreachable: EntitySyncState[] = [];
		for (const [entityId, state] of syncState.entityStates) {
			if (!entityIds.has(entityId)) {
				unreachable.push(state);
			}
		}

		return { added, modified, unreachable };
	}

	/**
	 * Updates sync state with new entity information
	 */
	private updateSyncState(
		currentState: DriveSyncState,
		entities: ArFSFileOrFolderEntity<'file' | 'folder'>[],
		stats: SyncStats
	): DriveSyncState {
		const newEntityStates = new Map(currentState.entityStates);

		// Update entity states
		for (const entity of entities) {
			const entityState: EntitySyncState = {
				entityId: entity.entityId,
				txId: entity.txId,
				blockHeight: entity.blockHeight,
				parentFolderId: entity.parentFolderId,
				name: entity.name,
				entityType: entity.entityType
			};
			newEntityStates.set(`${entity.entityId}`, entityState);
		}

		// Update sync metadata
		const newSyncState: DriveSyncState = {
			driveId: currentState.driveId,
			drivePrivacy: currentState.drivePrivacy,
			lastSyncedBlockHeight:
				stats.highestBlockHeight === 0 ? currentState.lastSyncedBlockHeight : stats.highestBlockHeight,
			lastSyncedTimestamp: new UnixTime(Date.now()),
			entityStates: newEntityStates
		};

		return newSyncState;
	}
}
