import { DriveSyncState, EntitySyncState, UnixTime, DrivePrivacy, EntityType, EID, TxID, DriveID } from '../types';

/**
 * Number of blocks to re-scan below `lastSyncedBlockHeight` on a resumed
 * incremental sync. Guards against chain reorganizations and same-height /
 * late revisions that an exclusive `lastSyncedBlockHeight + 1` lower bound
 * would silently miss. Mirrors ardrive-web's `kBlockHeightLookBack` (240
 * blocks ≈ 8h at ~2 min/block).
 */
export const SYNC_BLOCK_HEIGHT_LOOK_BACK = 240;

/**
 * Computes the inclusive lower block bound (`min`) for an incremental sync
 * GraphQL query, applying the reorg look-back window. On a resumed sync we
 * re-query the last {@link SYNC_BLOCK_HEIGHT_LOOK_BACK} blocks so reorged or
 * late-arriving revisions in that range are re-fetched and reconciled.
 *
 * Returns `undefined` for a full sync (no prior synced height), which lists
 * the drive from genesis.
 *
 * @param lastSyncedBlockHeight - The highest block height synced previously
 * @returns The look-back lower bound, or undefined for a full listing
 */
export function incrementalMinBlock(lastSyncedBlockHeight: number | undefined): number | undefined {
	if (!lastSyncedBlockHeight || lastSyncedBlockHeight <= 0) {
		return undefined;
	}
	return Math.max(0, lastSyncedBlockHeight - SYNC_BLOCK_HEIGHT_LOOK_BACK);
}

/** Minimal shape required to pick the latest revision among entity revisions. */
interface RevisionLike {
	entityId: { toString(): string };
	blockHeight: number;
	unixTime: { valueOf(): number };
}

/**
 * De-duplicates a list of entity revisions down to the single latest revision
 * per `entityId`. "Latest" = highest block height; ties (multiple revisions in
 * one block, or a reorg producing a competing same-height revision) are broken
 * by the later ArFS `unixTime`, then by later position in the input array.
 *
 * Order-independent by design: correct whether the caller fetched ascending or
 * descending, and it correctly reconciles the re-fetched reorg look-back overlap
 * so a stale (older) revision is never returned in place of a newer one.
 *
 * NOTE: within a block-height-filtered incremental listing every revision is
 * mined (blockHeight > 0), so the block-height comparison is authoritative.
 *
 * @param entities - Entity revisions (may contain multiple per entityId)
 * @returns One entity per entityId — the latest revision
 */
export function selectLatestRevisions<T extends RevisionLike>(entities: T[]): T[] {
	const latest = new Map<string, T>();
	for (const entity of entities) {
		const key = entity.entityId.toString();
		const incumbent = latest.get(key);
		if (incumbent === undefined || isLaterRevision(entity, incumbent)) {
			latest.set(key, entity);
		}
	}
	return Array.from(latest.values());
}

function isLaterRevision(candidate: RevisionLike, incumbent: RevisionLike): boolean {
	if (candidate.blockHeight !== incumbent.blockHeight) {
		return candidate.blockHeight > incumbent.blockHeight;
	}
	// Same block height (reorg / multiple revisions per block): the later ArFS
	// timestamp wins; equal timestamps fall back to input order (a later element
	// replaces an earlier one).
	return candidate.unixTime.valueOf() >= incumbent.unixTime.valueOf();
}

/**
 * Serialized form of DriveSyncState for storage/transmission
 */
export interface SerializedDriveSyncState {
	driveId: string;
	drivePrivacy: string;
	lastSyncedBlockHeight: number;
	lastSyncedTimestamp: number;
	entityStates: Array<{
		entityId: string;
		txId: string;
		blockHeight: number;
		parentFolderId?: string;
		name: string;
		entityType: string;
	}>;
}

/**
 * Serializes a DriveSyncState to a JSON-safe format
 *
 * @param syncState - The sync state to serialize
 * @returns A serialized representation that can be stored or transmitted
 */
export function serializeSyncState(syncState: DriveSyncState): SerializedDriveSyncState {
	const entityStates: SerializedDriveSyncState['entityStates'] = [];

	for (const [, state] of syncState.entityStates) {
		entityStates.push({
			entityId: state.entityId.toString(),
			txId: state.txId.toString(),
			blockHeight: state.blockHeight,
			parentFolderId: state.parentFolderId?.toString(),
			name: state.name,
			entityType: state.entityType
		});
	}

	return {
		driveId: syncState.driveId.toString(),
		drivePrivacy: syncState.drivePrivacy,
		lastSyncedBlockHeight: syncState.lastSyncedBlockHeight,
		lastSyncedTimestamp: syncState.lastSyncedTimestamp.valueOf(),
		entityStates
	};
}

/**
 * Deserializes a DriveSyncState from its serialized form
 *
 * @param serialized - The serialized sync state
 * @returns A DriveSyncState instance
 */
export function deserializeSyncState(serialized: SerializedDriveSyncState): DriveSyncState {
	const entityStates = new Map<string, EntitySyncState>();

	for (const state of serialized.entityStates) {
		const entityState: EntitySyncState = {
			entityId: EID(state.entityId),
			txId: TxID(state.txId),
			blockHeight: state.blockHeight,
			parentFolderId: state.parentFolderId ? EID(state.parentFolderId) : undefined,
			name: state.name,
			entityType: state.entityType as EntityType
		};
		entityStates.set(state.entityId, entityState);
	}

	return {
		driveId: EID(serialized.driveId),
		drivePrivacy: serialized.drivePrivacy as DrivePrivacy,
		lastSyncedBlockHeight: serialized.lastSyncedBlockHeight,
		lastSyncedTimestamp: new UnixTime(serialized.lastSyncedTimestamp),
		entityStates
	};
}

/**
 * Converts sync state to a JSON string for storage
 *
 * @param syncState - The sync state to convert
 * @returns JSON string representation
 */
export function syncStateToJSON(syncState: DriveSyncState): string {
	return JSON.stringify(serializeSyncState(syncState), null, 2);
}

/**
 * Parses sync state from a JSON string
 *
 * @param json - The JSON string to parse
 * @returns DriveSyncState instance
 */
export function syncStateFromJSON(json: string): DriveSyncState {
	const serialized = JSON.parse(json) as SerializedDriveSyncState;
	return deserializeSyncState(serialized);
}

/**
 * Merges two sync states, keeping the most recent information
 *
 * @param state1 - First sync state
 * @param state2 - Second sync state
 * @returns Merged sync state with latest information
 */
export function mergeSyncStates(state1: DriveSyncState, state2: DriveSyncState): DriveSyncState {
	if (!state1.driveId.equals(state2.driveId)) {
		throw new Error('Cannot merge sync states for different drives');
	}

	// Use the higher block height
	const lastSyncedBlockHeight = Math.max(state1.lastSyncedBlockHeight, state2.lastSyncedBlockHeight);

	// Use the more recent timestamp
	const lastSyncedTimestamp =
		state1.lastSyncedTimestamp.valueOf() > state2.lastSyncedTimestamp.valueOf()
			? state1.lastSyncedTimestamp
			: state2.lastSyncedTimestamp;

	// Merge entity states, keeping the one with higher block height for each entity
	const mergedEntityStates = new Map<string, EntitySyncState>(state1.entityStates);

	for (const [entityId, state2Entity] of state2.entityStates) {
		const state1Entity = mergedEntityStates.get(entityId);

		if (!state1Entity || state2Entity.blockHeight > state1Entity.blockHeight) {
			mergedEntityStates.set(entityId, state2Entity);
		}
	}

	return {
		driveId: state1.driveId,
		drivePrivacy: state1.drivePrivacy,
		lastSyncedBlockHeight,
		lastSyncedTimestamp,
		entityStates: mergedEntityStates
	};
}

/**
 * Creates an empty sync state for a drive
 *
 * @param driveId - The drive ID
 * @param drivePrivacy - The drive privacy setting
 * @returns Empty sync state
 */
export function createEmptySyncState(driveId: DriveID, drivePrivacy: DrivePrivacy): DriveSyncState {
	return {
		driveId,
		drivePrivacy,
		lastSyncedBlockHeight: 0,
		lastSyncedTimestamp: new UnixTime(0),
		entityStates: new Map()
	};
}
