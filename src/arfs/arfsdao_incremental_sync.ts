import { ArFSDAO, ArFSCache, ArFSPrivateDriveCacheKey, ArFSPrivateFileCacheKey, ArFSTagSettings } from './arfsdao';
import {
	ArFSPrivateFile,
	ArFSPrivateFolder,
	ArFSPrivateFileKeyless,
	ArFSPrivateFolderKeyless,
	ArFSFileOrFolderEntity,
	ArFSPublicDrive,
	ArFSPublicFolder,
	ArFSPublicFile
} from './arfs_entities';
import { ArFSPrivateDrive } from './arfs_entities';
import { ArFSPrivateFileBuilder } from './arfs_builders/arfs_file_builders';
import { ArFSPrivateFolderBuilder } from './arfs_builders/arfs_folder_builders';
import {
	IncrementalSyncOptions,
	IncrementalSyncResult,
	DriveSyncState,
	EntitySyncState,
	SyncChangeSet,
	SyncStats,
	IncrementalSyncError,
	GQLEdgeInterface,
	DriveID,
	ArweaveAddress,
	UnixTime,
	DrivePrivacy,
	EntityID,
	DriveKey,
	EID,
	GQLNodeInterface
} from '../types';
import { NameConflictInfo } from '../utils/mapper_functions';
import { ArFSPublicFolderCacheKey } from './arfsdao_anonymous';
import { ArFSPrivateFolderCacheKey } from './arfsdao';
import { buildQuery } from '../utils/query';
import { DESCENDING_ORDER } from '../utils/query';
import { getGqlPageSize, MAX_CONCURRENT_ENTITY_FETCHES } from '../utils/constants';
import { mapWithConcurrency } from '../utils/concurrency';
import { incrementalMinBlock, selectLatestRevisions } from '../utils/sync_state';
import { PromiseCache } from '@ardrive/ardrive-promise-cache';
import { ArFSDAOAnonymousIncrementalSync, ArFSIncrementalSyncCache } from './arfsdao_anonymous_incremental_sync';
import { Wallet } from '../exports';
import Arweave from 'arweave';
import { defaultCacheParams } from './arfsdao_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
import { SyncStateStore } from '../utils/sync_state_store';

/**
 * Extended cache interface for private drive sync
 */
export interface ArFSPrivateIncrementalSyncCache extends ArFSCache, ArFSIncrementalSyncCache {}

/**
 * Default cache with sync state cache added
 */
export const defaultArFSPrivateIncrementalSyncCache: ArFSPrivateIncrementalSyncCache = {
	ownerCache: new PromiseCache<DriveID, ArweaveAddress>(defaultCacheParams),
	driveIdCache: new PromiseCache<EntityID, DriveID>(defaultCacheParams),
	publicDriveCache: new PromiseCache<{ driveId: DriveID; owner: ArweaveAddress }, ArFSPublicDrive>(
		defaultCacheParams
	),
	publicFolderCache: new PromiseCache<{ folderId: EntityID; owner: ArweaveAddress }, ArFSPublicFolder>(
		defaultCacheParams
	),
	publicFileCache: new PromiseCache<{ fileId: EntityID; owner: ArweaveAddress }, ArFSPublicFile>(defaultCacheParams),
	privateDriveCache: new PromiseCache<ArFSPrivateDriveCacheKey, ArFSPrivateDrive>(defaultCacheParams),
	privateFolderCache: new PromiseCache<ArFSPrivateFolderCacheKey, ArFSPrivateFolder>(defaultCacheParams),
	privateFileCache: new PromiseCache<ArFSPrivateFileCacheKey, ArFSPrivateFile>(defaultCacheParams),
	publicConflictCache: new PromiseCache<ArFSPublicFolderCacheKey, NameConflictInfo>(defaultCacheParams),
	privateConflictCache: new PromiseCache<ArFSPrivateFolderCacheKey, NameConflictInfo>(defaultCacheParams),
	syncStateCache: new PromiseCache<DriveID, DriveSyncState>({
		cacheCapacity: 100,
		cacheTTL: 1000 * 60 * 5 // 5 minutes for sync state
	})
};

/**
 * Extends ArFSDAO with incremental sync capabilities for private drives
 */
export class ArFSDAOIncrementalSync extends ArFSDAO {
	declare protected caches: ArFSPrivateIncrementalSyncCache;
	public anonymousIncSync: ArFSDAOAnonymousIncrementalSync;
	private syncStateStore?: SyncStateStore;

	constructor(
		wallet: Wallet,
		arweave: Arweave,
		dryRun = false,
		appName?: string,
		appVersion?: string,
		arFSTagSettings?: ArFSTagSettings,
		caches?: ArFSPrivateIncrementalSyncCache,
		gatewayApi?: GatewayAPI,
		syncStateStore?: SyncStateStore
	) {
		super(wallet, arweave, dryRun, appName, appVersion, arFSTagSettings, caches, gatewayApi);
		this.syncStateStore = syncStateStore;

		// Create anonymous incremental sync instance with same gateway and storage
		this.anonymousIncSync = new ArFSDAOAnonymousIncrementalSync(
			arweave,
			appName,
			appVersion,
			caches as ArFSIncrementalSyncCache,
			gatewayApi,
			syncStateStore
		);
	}

	/**
	 * Performs an incremental sync of a private drive
	 *
	 * @param driveId - The drive to sync
	 * @param driveKey - The drive key for decryption
	 * @param owner - The drive owner
	 * @param options - Sync options including previous state
	 * @returns Sync results including entities and change detection
	 */
	async getPrivateDriveIncrementalSync(
		driveId: DriveID,
		driveKey: DriveKey,
		owner: ArweaveAddress,
		options: IncrementalSyncOptions = {}
	): Promise<IncrementalSyncResult> {
		const {
			syncState,
			includeRevisions = false,
			onProgress,
			batchSize = getGqlPageSize(),
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
			await this.getPrivateDrive(driveId, driveKey, owner);

			// Initialize or use provided sync state
			const currentSyncState: DriveSyncState = syncState || {
				driveId,
				drivePrivacy: 'private' as DrivePrivacy,
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
			// descending block order. Merging is not fundamentally unsafe — only a NAIVE
			// merge is: a single combined query with ONE shared early-stop counter (counting
			// known entities of EITHER type) trips sooner and could stop paginating before a
			// changed entity of one type that sits (in block order) just below a run of
			// >= stopAfterKnownCount known entities of the other type, silently dropping it.
			// A combined query that kept a SEPARATE per-type counter (only stopping once both
			// types have independently hit the threshold) would preserve the no-dropped-
			// entities invariant just as well. The queries stay split simply because merging
			// buys almost nothing: after CORE-7 the two walks already run in parallel via
			// `Promise.all`, so wall-clock latency is ~max(folders, files) not the sum, and
			// the ~10x round-trip reduction is already delivered by the 1000-entity page size.
			// Downstream selectLatestRevisions/detectChanges are order-independent, so a merge
			// would add per-type-counter/shared-cursor bookkeeping for a ~zero latency win.
			const [folders, files] = await Promise.all([
				this.getIncrementalPrivateFolders(
					driveId,
					driveKey,
					owner,
					minBlock,
					batchSize,
					onProgress,
					stats,
					stopAfterKnownCount,
					currentSyncState
				),
				this.getIncrementalPrivateFiles(
					driveId,
					driveKey,
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
	 * Fetches private folders incrementally with block height filtering
	 */
	private async getIncrementalPrivateFolders(
		driveId: DriveID,
		driveKey: DriveKey,
		owner: ArweaveAddress,
		minBlock: number | undefined,
		batchSize: number,
		onProgress: ((processed: number, total: number) => void) | undefined,
		stats: SyncStats,
		stopAfterKnownCount: number,
		currentSyncState: DriveSyncState
	): Promise<((ArFSPrivateFolder | ArFSPrivateFolderKeyless) & { blockHeight: number })[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFolders: ((ArFSPrivateFolder | ArFSPrivateFolderKeyless) & { blockHeight: number })[] = [];
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
			const batchFolders = await this.processPrivateFolderBatch(edges, driveKey, owner, stats);

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
	 * Fetches private files incrementally with block height filtering
	 */
	private async getIncrementalPrivateFiles(
		driveId: DriveID,
		driveKey: DriveKey,
		owner: ArweaveAddress,
		minBlock: number | undefined,
		batchSize: number,
		onProgress: ((processed: number, total: number) => void) | undefined,
		stats: SyncStats,
		stopAfterKnownCount: number,
		currentSyncState: DriveSyncState
	): Promise<((ArFSPrivateFile | ArFSPrivateFileKeyless) & { blockHeight: number })[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: ((ArFSPrivateFile | ArFSPrivateFileKeyless) & { blockHeight: number })[] = [];
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
			const batchFiles = await this.processPrivateFileBatch(edges, driveKey, owner, stats);

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
	 * Processes a batch of folder edges into ArFSPrivateFolder entities
	 */
	private async processPrivateFolderBatch(
		edges: GQLEdgeInterface[],
		driveKey: DriveKey,
		owner: ArweaveAddress,
		stats: SyncStats
	): Promise<((ArFSPrivateFolder | ArFSPrivateFolderKeyless) & { blockHeight: number })[]> {
		// Bounded fan-out: build at most MAX_CONCURRENT_ENTITY_FETCHES entities at a time so
		// a 1000-edge page (CORE-7) does not put ~1000 metadata GETs on the gateway at once
		// [CORE-9]. mapWithConcurrency preserves input order and Promise.all's reject-on-any-
		// failure semantics, so the returned batch is identical — only parallelism is capped.
		return mapWithConcurrency(edges, MAX_CONCURRENT_ENTITY_FETCHES, async (edge) => {
			const { node } = edge;

			// Update block height stats
			const blockHeight = node.block?.height || 0;
			stats.lowestBlockHeight = Math.min(stats.lowestBlockHeight, blockHeight);
			stats.highestBlockHeight = Math.max(stats.highestBlockHeight, blockHeight);

			// Check cache first. Only reuse the cached entity when it is the SAME
			// revision as this node (matching txId); reusing it for a different
			// revision would return stale metadata and mislabel latest-revision
			// selection. Block height is deterministic per txId.
			const folderId = this.extractEntityId(node, 'Folder-Id');
			const folderCacheKey = { folderId, owner, driveKey };
			const cached = this.caches.privateFolderCache.get(folderCacheKey);

			if (cached) {
				const cachedFolder = await cached;
				if (`${cachedFolder.txId}` === node.id) {
					stats.fromCache++;
					return Object.assign(cachedFolder, { blockHeight });
				}
			}

			// Build from network
			stats.fromNetwork++;
			const folderBuilder = ArFSPrivateFolderBuilder.fromArweaveNode(node, this.gatewayApi, driveKey);
			const folder = await folderBuilder.build(node);

			// Cache this revision (overwrites any older cached revision for the entity)
			this.caches.privateFolderCache.put(folderCacheKey, Promise.resolve(folder));

			// Add blockHeight to the entity
			return Object.assign(folder, { blockHeight });
		});
	}

	/**
	 * Processes a batch of file edges into ArFSPrivateFile entities
	 */
	private async processPrivateFileBatch(
		edges: GQLEdgeInterface[],
		driveKey: DriveKey,
		owner: ArweaveAddress,
		stats: SyncStats
	): Promise<((ArFSPrivateFile | ArFSPrivateFileKeyless) & { blockHeight: number })[]> {
		// Bounded fan-out: build at most MAX_CONCURRENT_ENTITY_FETCHES entities at a time so
		// a 1000-edge page (CORE-7) does not put ~1000 metadata GETs on the gateway at once
		// [CORE-9]. mapWithConcurrency preserves input order and Promise.all's reject-on-any-
		// failure semantics, so the returned batch is identical — only parallelism is capped.
		return mapWithConcurrency(edges, MAX_CONCURRENT_ENTITY_FETCHES, async (edge) => {
			const { node } = edge;

			// Update block height stats
			const blockHeight = node.block?.height || 0;
			stats.lowestBlockHeight = Math.min(stats.lowestBlockHeight, blockHeight);
			stats.highestBlockHeight = Math.max(stats.highestBlockHeight, blockHeight);

			// Check cache first
			const fileId = this.extractEntityId(node, 'File-Id');
			// For private files, we need the file key which we don't have yet
			// So we can't use the cache effectively here
			const cached = undefined;

			if (cached) {
				stats.fromCache++;
				return cached;
			}

			// Build from network
			stats.fromNetwork++;
			const fileBuilder = ArFSPrivateFileBuilder.fromArweaveNode(node, this.gatewayApi, driveKey);
			const file = await fileBuilder.build(node);

			// Cache the result if we have a file key
			if ('fileKey' in file && file.fileKey) {
				const cacheKey = { fileId, owner, fileKey: file.fileKey };
				this.caches.privateFileCache.put(cacheKey, Promise.resolve(file as ArFSPrivateFile));
			}

			// Add blockHeight to the entity
			const fileWithBlockHeight = Object.assign(file, { blockHeight });

			return fileWithBlockHeight;
		});
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
}
