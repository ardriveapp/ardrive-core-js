/**
 * Example: Using persistent storage for incremental sync state
 *
 * This example demonstrates how to use the storage adapters to persist
 * sync state across sessions, enabling efficient incremental synchronization.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import {
	arDriveFactory,
	FileSystemSyncStateStore,
	LocalStorageSyncStateStore,
	MemorySyncStateStore,
	DriveID,
	EID
} from '../src/exports';

// Example 1: Using file system storage (Node.js)
async function exampleWithFileStorage() {
	// Create a file system storage adapter
	const syncStateStore = new FileSystemSyncStateStore('./.ardrive-sync-cache');

	// Create ArDrive with the storage adapter
	const arDrive = arDriveFactory({
		wallet: myWallet, // Your wallet instance
		syncStateStore
	});

	const driveId = EID('your-drive-id-here') as DriveID;

	// First sync - will save state to disk automatically
	const result1 = await arDrive.syncPublicDrive(driveId);
	console.log(`Initial sync found ${result1.entities.length} entities`);

	// Later, in a new session, the state will be loaded from disk
	const result2 = await arDrive.syncPublicDrive(driveId);
	console.log(`Incremental sync found ${result2.changes.added.length} new entities`);
}

// Example 2: Using localStorage (Browser)
async function exampleWithLocalStorage() {
	// Create a localStorage adapter for browser environments
	const syncStateStore = new LocalStorageSyncStateStore('ardrive-sync-');

	const arDrive = arDriveFactory({
		wallet: myWallet,
		syncStateStore
	});

	const driveId = EID('your-drive-id-here') as DriveID;

	// Sync state persists in browser localStorage
	const result = await arDrive.syncPublicDrive(driveId);
	console.log(`Found ${result.entities.length} entities`);
}

// Example 3: Using memory storage (temporary)
async function exampleWithMemoryStorage() {
	// Memory storage is useful for testing or temporary sessions
	const syncStateStore = new MemorySyncStateStore();

	const arDrive = arDriveFactory({
		wallet: myWallet,
		syncStateStore
	});

	const driveId = EID('your-drive-id-here') as DriveID;

	// State only persists for the current session
	const result = await arDrive.syncPublicDrive(driveId);
	console.log(`Found ${result.entities.length} entities`);
}

// Example 4: Managing multiple drives
async function exampleMultipleDrives() {
	const syncStateStore = new FileSystemSyncStateStore('./.ardrive-sync-cache');

	const arDrive = arDriveFactory({
		wallet: myWallet,
		syncStateStore
	});

	// List all drives with cached sync state
	const cachedDriveIds = await syncStateStore.list();
	console.log(`Found ${cachedDriveIds.length} cached drive states`);

	// Sync each cached drive
	for (const driveId of cachedDriveIds) {
		const result = await arDrive.syncPublicDrive(driveId);
		console.log(`Drive ${driveId}: ${result.changes.added.length} new entities`);
	}

	// Clear old cache entries (older than 30 days)
	// Note: This is only available with SQLite storage
}

// Example 5: Manual state management
async function exampleManualStateManagement() {
	const syncStateStore = new FileSystemSyncStateStore();
	const driveId = EID('your-drive-id-here') as DriveID;

	// Load existing state
	const existingState = await syncStateStore.load(driveId);

	if (existingState) {
		console.log(`Last synced at block ${existingState.lastSyncedBlockHeight}`);
		console.log(`Tracking ${existingState.entityStates.size} entities`);
	}

	// Perform sync with existing state
	const arDrive = arDriveFactory({
		wallet: myWallet,
		syncStateStore
	});

	await arDrive.syncPublicDrive(driveId, undefined, {
		syncState: existingState
	});

	// State is automatically saved after successful sync
	console.log(`Sync complete. New state saved.`);

	// Clear state for a specific drive if needed
	await syncStateStore.clear(driveId);

	// Clear all cached states
	await syncStateStore.clearAll();
}

// Example 6: Using SQLite for advanced features (requires better-sqlite3)
async function exampleWithSQLite() {
	// Uncomment when better-sqlite3 is installed
	// import { SQLiteSyncStateStore } from '../src/utils/sync_state_store_sqlite';
	// const syncStateStore = new SQLiteSyncStateStore('./ardrive-sync.db');
	// // SQLite provides additional features
	// const stats = await syncStateStore.getStats();
	// console.log(`Total cached drives: ${stats.totalStates}`);
	// console.log(`Total entities tracked: ${stats.totalEntities}`);
	// // Find and clean up old states
	// const staleDrives = await syncStateStore.findStaleStates(30); // 30 days old
	// console.log(`Found ${staleDrives.length} stale drive states`);
	// const deleted = await syncStateStore.cleanupOldStates(30);
	// console.log(`Cleaned up ${deleted} old states`);
	// // Optimize the database
	// await syncStateStore.optimize();
	// // Create a backup
	// await syncStateStore.backup('./backup-sync.db');
}

// Example 7: Serializing state for external storage
async function exampleSerializeForExternalStorage() {
	import { serializeSyncState, deserializeSyncState } from '../src/utils/sync_state';

	const arDrive = arDriveFactory({ wallet: myWallet });
	const driveId = EID('your-drive-id-here') as DriveID;

	// Perform initial sync
	const result = await arDrive.syncPublicDrive(driveId);

	// Serialize the state for external storage (e.g., sending to API)
	const serialized = serializeSyncState(result.newSyncState);
	const jsonString = JSON.stringify(serialized);

	// Store in your external system
	await myAPI.saveSyncState(driveId, jsonString);

	// Later, retrieve and deserialize
	const retrievedJson = await myAPI.getSyncState(driveId);
	const retrievedSerialized = JSON.parse(retrievedJson);
	const syncState = deserializeSyncState(retrievedSerialized);

	// Use the retrieved state for next sync
	await arDrive.syncPublicDrive(driveId, undefined, {
		syncState
	});
}

// Note: Replace 'myWallet' with your actual wallet instance
// and 'your-drive-id-here' with actual drive IDs
