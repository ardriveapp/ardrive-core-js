import Arweave from 'arweave';
import { ArFSDAOAnonymous, ArFSAnonymousCache, defaultArFSAnonymousCache } from './arfsdao_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
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
import { DESCENDING_ORDER } from '../utils/query';
import { GQL_PAGE_SIZE } from '../utils/constants';
import { incrementalMinBlock, selectLatestRevisions } from '../utils/sync_state';
import { PromiseCache } from '@ardrive/ardrive-promise-cache';
import { SyncStateStore } from '../utils/sync_state_store';

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
	private syncStateStore?: SyncStateStore;

	constructor(
		arweave: Arweave,
		appName = 'ArDrive-Core',
		appVersion = '0.0.0',
		caches: ArFSIncrementalSyncCache = defaultArFSIncrementalSyncCache,
		gatewayApi?: GatewayAPI,
		syncStateStore?: SyncStateStore
	) {
		super(arweave, appName, appVersion, caches, gatewayApi);
		this.syncStateStore = syncStateStore;
	}

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
		const {
			syncState,
			includeRevisions = false,
			onProgress,
			batchSize = GQL_PAGE_SIZE,
			stopAfterKnownCount = 10
		} = options;

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

			// Set minimum block height for queries. Apply a reorg look-back window
			// (max(0, lastSyncedBlockHeight - 240)) so a chain reorganization or a
			// same-height/late revision near the previous tip is re-fetched and
			// reconciled rather than silently missed.
			const minBlock = incrementalMinBlock(syncState?.lastSyncedBlockHeight);

			// Fetch folders and files as two SEPARATE paged queries, run concurrently.
			//
			// These are deliberately NOT merged into one `Entity-Type: [file, folder]`
			// query [CORE-8]: each stream carries an independent `stopAfterKnownCount`
			// early-stop that counts CONSECUTIVE already-known entities OF ITS OWN TYPE in
			// descending block order. A single combined query would force one shared cursor,
			// one pagination loop and therefore one shared early-stop counting known
			// entities of EITHER type — which trips sooner and could stop paginating before
			// a changed entity of one type that sits (in block order) just below a run of
			// >= stopAfterKnownCount known entities of the other type, silently dropping it.
			// The per-type early-stop is what preserves the no-dropped-entities invariant,
			// so the query stays split. (Downstream selectLatestRevisions/detectChanges are
			// order-independent, so combining would not help correctness — only request
			// count, which the 1000-entity page size already reduces ~10x.) Running both in
			// parallel means wall-clock latency is already ~max(folders, files), not the sum.
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

			// Combine all entities (with blockHeight added)
			const allEntities = [...folders, ...files] as (ArFSFileOrFolderEntity<'file' | 'folder'> & {
				blockHeight: number;
			})[];

			// Apply revision filter if requested. selectLatestRevisions is
			// order-independent and reconciles the re-fetched look-back overlap,
			// keeping only the newest revision per entity (see reorg look-back).
			const entities = includeRevisions ? allEntities : selectLatestRevisions(allEntities);

			// Detect changes (minBlock scopes unreachable detection to the re-fetched window)
			const changes = this.detectChanges(entities, currentSyncState, minBlock);

			// Update sync state with new information
			const newSyncState = this.updateSyncState(currentSyncState, entities, stats);

			// Cache the new sync state
			await this.setCachedSyncState(driveId, newSyncState);

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
	): Promise<(ArFSPublicFolder & { blockHeight: number })[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFolders: (ArFSPublicFolder & { blockHeight: number })[] = [];
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
				sort: DESCENDING_ORDER, // Newest first: so the stopAfterKnownCount early-stop trips only after passing all recent changes
				first: batchSize
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges, pageInfo } = transactions;

			hasNextPage = pageInfo.hasNextPage;

			// Process batch
			const batchFolders = await this.processFolderBatch(edges, owner, stats);

			// Check for known entities (optimization)
			let addedUpToIndex = -1;
			for (let i = 0; i < batchFolders.length; i++) {
				const folder = batchFolders[i];
				const existing = currentSyncState.entityStates.get(`${folder.entityId}`);
				if (existing && existing.txId.equals(folder.txId)) {
					knownEntityCount++;
					if (knownEntityCount >= stopAfterKnownCount) {
						hasNextPage = false;
						// Only add folders up to and including this one
						addedUpToIndex = i;
						break;
					}
				} else {
					knownEntityCount = 0; // Reset counter when we find new/modified entity
				}
			}

			// Add folders based on whether we early stopped
			if (addedUpToIndex >= 0) {
				allFolders.push(...batchFolders.slice(0, addedUpToIndex + 1));
			} else {
				allFolders.push(...batchFolders);
			}
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
	): Promise<(ArFSPublicFile & { blockHeight: number })[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: (ArFSPublicFile & { blockHeight: number })[] = [];
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
				sort: DESCENDING_ORDER,
				first: batchSize
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges, pageInfo } = transactions;

			hasNextPage = pageInfo.hasNextPage;

			// Process batch
			const batchFiles = await this.processFileBatch(edges, owner, stats);

			// Check for known entities
			let addedUpToIndex = -1;
			for (let i = 0; i < batchFiles.length; i++) {
				const file = batchFiles[i];
				const existing = currentSyncState.entityStates.get(`${file.entityId}`);
				if (existing && existing.txId.equals(file.txId)) {
					knownEntityCount++;
					if (knownEntityCount >= stopAfterKnownCount) {
						hasNextPage = false;
						// Only add files up to and including this one
						addedUpToIndex = i;
						break;
					}
				} else {
					knownEntityCount = 0;
				}
			}

			// Add files based on whether we early stopped
			if (addedUpToIndex >= 0) {
				allFiles.push(...batchFiles.slice(0, addedUpToIndex + 1));
			} else {
				allFiles.push(...batchFiles);
			}
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
		const folders: Promise<ArFSPublicFolder & { blockHeight: number }>[] = edges.map(async (edge) => {
			const { node } = edge;

			// Update block height stats
			const blockHeight = node.block?.height || 0;
			stats.lowestBlockHeight = Math.min(stats.lowestBlockHeight, blockHeight);
			stats.highestBlockHeight = Math.max(stats.highestBlockHeight, blockHeight);

			// Check cache first. The cache is keyed by entityId and holds a single
			// revision, so it may ONLY be reused when it is the SAME revision as this
			// node (matching txId) — reusing it for a different revision would return
			// stale metadata and mislabel the latest-revision selection (a real reorg
			// / multi-revision correctness bug). Block height is deterministic per
			// txId, so the returned blockHeight is correct for a same-revision hit.
			const folderId = this.extractEntityId(node, 'Folder-Id');
			const cacheKey = { folderId, owner };
			const cached = this.caches.publicFolderCache.get(cacheKey);

			if (cached) {
				const cachedFolder = await cached;
				if (`${cachedFolder.txId}` === node.id) {
					stats.fromCache++;
					return Object.assign(cachedFolder, { blockHeight });
				}
			}

			// Build from network
			stats.fromNetwork++;
			const folderBuilder = ArFSPublicFolderBuilder.fromArweaveNode(node, this.gatewayApi);
			const folder = await folderBuilder.build(node);

			// Cache this revision (overwrites any older cached revision for the entity)
			this.caches.publicFolderCache.put(cacheKey, Promise.resolve(folder));

			// Add blockHeight to the entity
			return Object.assign(folder, { blockHeight });
		});

		const results = await Promise.allSettled(folders);
		const successfulFolders: (ArFSPublicFolder & { blockHeight: number })[] = [];

		for (const result of results) {
			if (result.status === 'fulfilled') {
				successfulFolders.push(result.value);
			} else {
				// Log error but continue processing other entities
				console.warn(`Failed to process folder: ${result.reason?.message || 'Unknown error'}`);
				stats.failedEntities = (stats.failedEntities || 0) + 1;
			}
		}

		return successfulFolders;
	}

	/**
	 * Processes a batch of file edges into ArFSPublicFile entities
	 */
	private async processFileBatch(
		edges: GQLEdgeInterface[],
		owner: ArweaveAddress,
		stats: SyncStats
	): Promise<ArFSPublicFile[]> {
		const files: Promise<ArFSPublicFile & { blockHeight: number }>[] = edges.map(async (edge) => {
			const { node } = edge;

			// Update block height stats
			const blockHeight = node.block?.height || 0;
			stats.lowestBlockHeight = Math.min(stats.lowestBlockHeight, blockHeight);
			stats.highestBlockHeight = Math.max(stats.highestBlockHeight, blockHeight);

			// Check cache first. The cache is keyed by entityId and holds a single
			// revision, so it may ONLY be reused when it is the SAME revision as this
			// node (matching txId) — reusing it for a different revision would return
			// stale metadata and mislabel the latest-revision selection (a real reorg
			// / multi-revision correctness bug). Block height is deterministic per
			// txId, so the returned blockHeight is correct for a same-revision hit.
			const fileId = this.extractEntityId(node, 'File-Id');
			const cacheKey = { fileId, owner };
			const cached = this.caches.publicFileCache.get(cacheKey);

			if (cached) {
				const cachedFile = await cached;
				if (`${cachedFile.txId}` === node.id) {
					stats.fromCache++;
					return Object.assign(cachedFile, { blockHeight });
				}
			}

			// Build from network
			stats.fromNetwork++;
			const fileBuilder = ArFSPublicFileBuilder.fromArweaveNode(node, this.gatewayApi);
			const file = await fileBuilder.build(node);

			// Cache this revision (overwrites any older cached revision for the entity)
			this.caches.publicFileCache.put(cacheKey, Promise.resolve(file));

			// Add blockHeight to the entity
			return Object.assign(file, { blockHeight });
		});

		const results = await Promise.allSettled(files);
		const successfulFiles: (ArFSPublicFile & { blockHeight: number })[] = [];

		for (const result of results) {
			if (result.status === 'fulfilled') {
				successfulFiles.push(result.value);
			} else {
				// Log error but continue processing other entities
				console.warn(`Failed to process file: ${result.reason?.message || 'Unknown error'}`);
				stats.failedEntities = (stats.failedEntities || 0) + 1;
			}
		}

		return successfulFiles;
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
	 * First checks persistent storage, then falls back to memory cache
	 */
	async getCachedSyncState(driveId: DriveID): Promise<DriveSyncState | undefined> {
		// Try persistent storage first
		if (this.syncStateStore) {
			const stored = await this.syncStateStore.load(driveId);
			if (stored) {
				// Also update memory cache for performance
				this.caches.syncStateCache.put(driveId, Promise.resolve(stored));
				return stored;
			}
		}

		// Fall back to memory cache
		return this.caches.syncStateCache.get(driveId);
	}

	/**
	 * Sets the cached sync state for a drive
	 * Saves to both memory cache and persistent storage if available
	 */
	async setCachedSyncState(driveId: DriveID, syncState: DriveSyncState): Promise<void> {
		// Save to memory cache
		this.caches.syncStateCache.put(driveId, Promise.resolve(syncState));

		// Save to persistent storage if available
		if (this.syncStateStore) {
			await this.syncStateStore.save(driveId, syncState);
		}
	}

	/**
	 * Detects changes between current entities and sync state
	 */
	private detectChanges(
		entities: (ArFSFileOrFolderEntity<'file' | 'folder'> & { blockHeight: number })[],
		syncState: DriveSyncState,
		minBlock?: number
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

		// Detect unreachable entities (e.g. reorged out, permissions changed,
		// ownership transferred). An incremental sync only re-queries the
		// [minBlock, tip] window, so a stored entity whose last-known revision
		// lives *below* that window was intentionally not re-fetched and MUST NOT
		// be reported unreachable — only entities that fell inside the re-fetched
		// window yet are now absent are genuinely unreachable. A full sync
		// (minBlock === undefined) evaluates every stored entity.
		//
		// Note: an entity that became hidden since last sync surfaces as a new
		// (modified) revision carrying `isHidden`, not as an unreachable entity.
		const unreachable: EntitySyncState[] = [];
		for (const [entityId, state] of syncState.entityStates) {
			if (entityIds.has(entityId)) {
				continue;
			}
			if (minBlock === undefined || state.blockHeight >= minBlock) {
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
		entities: (ArFSFileOrFolderEntity<'file' | 'folder'> & { blockHeight: number })[],
		stats: SyncStats
	): DriveSyncState {
		const newEntityStates = new Map(currentState.entityStates);

		// Update entity states. Collapse to the latest revision per entity first so
		// the stored state is order-independent (the fetch is newest-first and, with
		// includeRevisions, may carry several revisions of the same entity).
		for (const entity of selectLatestRevisions(entities)) {
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
