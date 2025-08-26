import { DriveSyncState, EntitySyncState, UnixTime, DrivePrivacy, EntityType, EID, TxID, DriveID } from '../types';

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
