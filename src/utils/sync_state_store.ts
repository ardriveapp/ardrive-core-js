import { DriveID, EID } from '../types';
import { DriveSyncState } from '../types/sync_types';
import { serializeSyncState, deserializeSyncState, SerializedDriveSyncState } from './sync_state';

/**
 * Interface for persistent storage of sync states
 * Implementations can use any storage backend (file system, localStorage, SQLite, etc.)
 */
export interface SyncStateStore {
	/**
	 * Save a sync state for a specific drive
	 * @param driveId - The drive ID to save state for
	 * @param state - The sync state to save
	 */
	save(driveId: DriveID, state: DriveSyncState): Promise<void>;

	/**
	 * Load a sync state for a specific drive
	 * @param driveId - The drive ID to load state for
	 * @returns The sync state if found, undefined otherwise
	 */
	load(driveId: DriveID): Promise<DriveSyncState | undefined>;

	/**
	 * Delete a sync state for a specific drive
	 * @param driveId - The drive ID to clear state for
	 */
	clear(driveId: DriveID): Promise<void>;

	/**
	 * List all drive IDs that have stored sync states
	 * @returns Array of drive IDs
	 */
	list(): Promise<DriveID[]>;

	/**
	 * Clear all stored sync states
	 */
	clearAll(): Promise<void>;
}

/**
 * Abstract base class for sync state stores that handles serialization
 */
export abstract class BaseSyncStateStore implements SyncStateStore {
	protected abstract saveRaw(key: string, data: string): Promise<void>;
	protected abstract loadRaw(key: string): Promise<string | undefined>;
	protected abstract clearRaw(key: string): Promise<void>;
	protected abstract listKeys(): Promise<string[]>;
	protected abstract clearAllRaw(): Promise<void>;

	protected getKey(driveId: DriveID): string {
		return `sync-state-${driveId}`;
	}

	async save(driveId: DriveID, state: DriveSyncState): Promise<void> {
		const serialized = serializeSyncState(state);
		const data = JSON.stringify(serialized, null, 2);
		await this.saveRaw(this.getKey(driveId), data);
	}

	async load(driveId: DriveID): Promise<DriveSyncState | undefined> {
		const data = await this.loadRaw(this.getKey(driveId));
		if (!data) return undefined;

		try {
			const serialized = JSON.parse(data) as SerializedDriveSyncState;
			return deserializeSyncState(serialized);
		} catch (error) {
			console.error(`Failed to parse sync state for drive ${driveId}:`, error);
			return undefined;
		}
	}

	async clear(driveId: DriveID): Promise<void> {
		await this.clearRaw(this.getKey(driveId));
	}

	async list(): Promise<DriveID[]> {
		const keys = await this.listKeys();
		const prefix = 'sync-state-';
		return keys.filter((key) => key.startsWith(prefix)).map((key) => EID(key.substring(prefix.length)) as DriveID);
	}

	async clearAll(): Promise<void> {
		await this.clearAllRaw();
	}
}

/**
 * In-memory storage for testing or temporary storage
 */
export class MemorySyncStateStore extends BaseSyncStateStore {
	private store = new Map<string, string>();

	protected async saveRaw(key: string, data: string): Promise<void> {
		this.store.set(key, data);
	}

	protected async loadRaw(key: string): Promise<string | undefined> {
		return this.store.get(key);
	}

	protected async clearRaw(key: string): Promise<void> {
		this.store.delete(key);
	}

	protected async listKeys(): Promise<string[]> {
		return Array.from(this.store.keys());
	}

	protected async clearAllRaw(): Promise<void> {
		this.store.clear();
	}
}
