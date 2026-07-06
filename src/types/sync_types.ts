import { ArFSFileOrFolderEntity } from '../arfs/arfs_entities';
import { DriveID, EntityID, TransactionID, UnixTime, EntityType, DrivePrivacy } from '.';

/**
 * Represents the sync state of a single entity (file/folder/drive)
 * Used to track what we've seen before and detect changes
 */
export interface EntitySyncState {
	/** The entity's unique identifier */
	entityId: EntityID;
	/** The transaction ID of the entity's metadata */
	txId: TransactionID;
	/** The Arweave block height when this entity was created/modified */
	blockHeight: number;
	/** Parent folder ID for files and folders (undefined for drives) */
	parentFolderId?: EntityID;
	/** The entity's name at the time of sync */
	name: string;
	/** Type of entity (file/folder/drive) */
	entityType: EntityType;
}

/**
 * Represents the complete sync state for a drive
 * Tracks all entities and the last sync point
 */
export interface DriveSyncState {
	/** The drive being synced */
	driveId: DriveID;
	/** Privacy setting of the drive */
	drivePrivacy: DrivePrivacy;
	/** The highest block height we've synced up to */
	lastSyncedBlockHeight: number;
	/** Unix timestamp of the last sync operation */
	lastSyncedTimestamp: UnixTime;
	/** Map of entityId -> entity state for all known entities */
	entityStates: Map<string, EntitySyncState>;
}

/**
 * Represents the changes detected during an incremental sync
 */
export interface SyncChangeSet {
	/** Entities that are new since last sync */
	added: EntitySyncState[];
	/** Entities that have been modified (new revision) since last sync */
	modified: EntitySyncState[];
	/** Entities that were in previous sync but are now unreachable (e.g. permissions changed, ownership transferred) */
	unreachable: EntitySyncState[];
}

/**
 * Options for controlling incremental sync behavior
 */
export interface IncrementalSyncOptions {
	/** Previous sync state to compare against. If not provided, performs full sync */
	syncState?: DriveSyncState;
	/** Whether to include revision history (default: false) */
	includeRevisions?: boolean;
	/** Progress callback for long-running syncs */
	onProgress?: (processed: number, total: number) => void;
	/** Number of entities to fetch per GraphQL query (default: 100, max: 100) */
	batchSize?: number;
	/** Stop sync after finding this many known entities (optimization for catching up) */
	stopAfterKnownCount?: number;
}

/**
 * Result of an incremental sync operation
 */
export interface IncrementalSyncResult {
	/** All entities fetched during sync (includes both new and existing) */
	entities: ArFSFileOrFolderEntity<'file' | 'folder'>[];
	/** Changes detected compared to previous sync state */
	changes: SyncChangeSet;
	/** Updated sync state to use for next sync */
	newSyncState: DriveSyncState;
	/** Statistics about the sync operation */
	stats: SyncStats;
}

/**
 * Statistics collected during sync operation
 */
export interface SyncStats {
	/** Total number of entities processed */
	totalProcessed: number;
	/** Number of entities retrieved from cache */
	fromCache: number;
	/** Number of entities fetched from network */
	fromNetwork: number;
	/** Lowest block height seen during sync */
	lowestBlockHeight: number;
	/** Highest block height seen during sync */
	highestBlockHeight: number;
	/** Number of entities that failed to process (optional) */
	failedEntities?: number;
}

/**
 * Error thrown when incremental sync partially completes
 */
export class IncrementalSyncError extends Error {
	constructor(
		message: string,
		public readonly partialResult?: Partial<IncrementalSyncResult>,
		public readonly lastSuccessfulCursor?: string
	) {
		super(message);
		this.name = 'IncrementalSyncError';
	}
}
