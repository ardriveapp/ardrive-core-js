import { DriveSyncState, EntitySyncState, DriveID, EntityID, TransactionID } from '../types';

/**
 * Serializes a DriveSyncState to JSON string for persistence
 * Maps are converted to arrays for JSON compatibility
 */
export function serializeSyncState(syncState: DriveSyncState): string {
	const serializable = {
		driveId: syncState.driveId.toString(),
		lastSyncedBlockHeight: syncState.lastSyncedBlockHeight,
		lastSyncedTimestamp: syncState.lastSyncedTimestamp,
		entityStates: Array.from(syncState.entityStates.entries()).map(([key, value]) => ({
			key,
			value: {
				entityId: value.entityId.toString(),
				txId: value.txId.toString(),
				blockHeight: value.blockHeight,
				parentFolderId: value.parentFolderId?.toString(),
				name: value.name
			}
		}))
	};
	return JSON.stringify(serializable, null, 2);
}

/**
 * Deserializes a JSON string back to DriveSyncState
 * Reconstructs Maps and branded types from plain objects
 */
export function deserializeSyncState(json: string): DriveSyncState {
	const parsed = JSON.parse(json);
	const entityStates = new Map<string, EntitySyncState>();

	for (const { key, value } of parsed.entityStates) {
		entityStates.set(key, {
			entityId: value.entityId as EntityID,
			txId: value.txId as TransactionID,
			blockHeight: value.blockHeight,
			parentFolderId: value.parentFolderId ? (value.parentFolderId as EntityID) : undefined,
			name: value.name
		});
	}

	return {
		driveId: parsed.driveId as DriveID,
		lastSyncedBlockHeight: parsed.lastSyncedBlockHeight,
		lastSyncedTimestamp: parsed.lastSyncedTimestamp,
		entityStates
	};
}

/**
 * Creates an empty sync state for initial sync
 */
export function createInitialSyncState(driveId: DriveID): DriveSyncState {
	return {
		driveId,
		lastSyncedBlockHeight: 0,
		lastSyncedTimestamp: 0,
		entityStates: new Map()
	};
}

/**
 * Merges two sync states, keeping the most recent information
 * Useful for combining partial syncs or recovering from errors
 */
export function mergeSyncStates(state1: DriveSyncState, state2: DriveSyncState): DriveSyncState {
	if (!state1.driveId.equals(state2.driveId)) {
		throw new Error('Cannot merge sync states from different drives');
	}

	const mergedEntityStates = new Map<string, EntitySyncState>(state1.entityStates);

	// Add or update entities from state2
	for (const [entityId, entityState] of state2.entityStates) {
		const existing = mergedEntityStates.get(entityId);
		if (!existing || entityState.blockHeight > existing.blockHeight) {
			mergedEntityStates.set(entityId, entityState);
		}
	}

	return {
		driveId: state1.driveId,
		lastSyncedBlockHeight: Math.max(state1.lastSyncedBlockHeight, state2.lastSyncedBlockHeight),
		lastSyncedTimestamp: Math.max(state1.lastSyncedTimestamp, state2.lastSyncedTimestamp),
		entityStates: mergedEntityStates
	};
}

/**
 * Calculates the difference between two sync states
 * Returns entity IDs that have changed between states
 */
export function diffSyncStates(
	oldState: DriveSyncState,
	newState: DriveSyncState
): {
	added: string[];
	modified: string[];
	removed: string[];
} {
	const added: string[] = [];
	const modified: string[] = [];
	const removed: string[] = [];

	// Find added and modified entities
	for (const [entityId, newEntity] of newState.entityStates) {
		const oldEntity = oldState.entityStates.get(entityId);
		if (!oldEntity) {
			added.push(entityId);
		} else if (oldEntity.txId.toString() !== newEntity.txId.toString()) {
			modified.push(entityId);
		}
	}

	// Find removed entities
	for (const entityId of oldState.entityStates.keys()) {
		if (!newState.entityStates.has(entityId)) {
			removed.push(entityId);
		}
	}

	return { added, modified, removed };
}
