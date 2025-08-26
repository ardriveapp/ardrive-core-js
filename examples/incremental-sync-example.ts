/**
 * Example: Using ArDrive Core's Incremental Sync Feature
 *
 * This example demonstrates how to use the incremental sync functionality
 * to efficiently synchronize drive contents.
 */

import {
	arDriveFactory,
	readJWKFile,
	serializeSyncState,
	deserializeSyncState,
	DriveID,
	DriveSyncState,
	IncrementalSyncResult
} from '../src/exports';
import { promises as fs } from 'fs';
import path from 'path';

// Configuration
const WALLET_PATH = './wallet.json';
const SYNC_STATE_DIR = './sync-states';
const DRIVE_ID = new DriveID('your-drive-id-here');

/**
 * Load sync state from disk
 */
async function loadSyncState(driveId: DriveID): Promise<DriveSyncState | undefined> {
	try {
		const filePath = path.join(SYNC_STATE_DIR, `${driveId}.json`);
		const data = await fs.readFile(filePath, 'utf-8');
		return deserializeSyncState(data);
	} catch (error) {
		// No previous sync state exists
		return undefined;
	}
}

/**
 * Save sync state to disk
 */
async function saveSyncState(syncState: DriveSyncState): Promise<void> {
	await fs.mkdir(SYNC_STATE_DIR, { recursive: true });
	const filePath = path.join(SYNC_STATE_DIR, `${syncState.driveId}.json`);
	const data = serializeSyncState(syncState);
	await fs.writeFile(filePath, data, 'utf-8');
}

/**
 * Process sync results
 */
function processSyncResults(result: IncrementalSyncResult): void {
	console.log('\n📊 Sync Statistics:');
	console.log(`   Total entities processed: ${result.stats.totalProcessed}`);
	console.log(`   Block range: ${result.stats.lowestBlockHeight} - ${result.stats.highestBlockHeight}`);

	console.log('\n✨ Changes detected:');
	console.log(`   Added: ${result.changes.added.length} entities`);
	console.log(`   Modified: ${result.changes.modified.length} entities`);
	console.log(`   Unreachable: ${result.changes.unreachable.length} entities`);

	// Log details of changes
	if (result.changes.added.length > 0) {
		console.log('\n📁 New entities:');
		for (const entity of result.changes.added) {
			console.log(`   - ${entity.entityType}: ${entity.name}`);
		}
	}

	if (result.changes.modified.length > 0) {
		console.log('\n✏️  Modified entities:');
		for (const entity of result.changes.modified) {
			console.log(`   - ${entity.entityType}: ${entity.name}`);
		}
	}

	if (result.changes.unreachable.length > 0) {
		console.log('\n⚠️  Unreachable entities (permissions changed or ownership transferred):');
		for (const entity of result.changes.unreachable) {
			console.log(`   - ${entity.entityType}: ${entity.name} (${entity.entityId})`);
		}
	}
}

/**
 * Main sync function
 */
async function syncDrive(): Promise<void> {
	try {
		// Initialize ArDrive
		const wallet = readJWKFile(WALLET_PATH);
		const arDrive = arDriveFactory({ wallet });

		console.log('🔄 Starting drive synchronization...');

		// Load previous sync state
		const previousState = await loadSyncState(DRIVE_ID);

		if (previousState) {
			console.log(`📌 Resuming from block ${previousState.lastSyncedBlockHeight}`);
			const timeSinceLastSync = Date.now() - previousState.lastSyncedTimestamp;
			console.log(`   Last synced: ${Math.round(timeSinceLastSync / 1000 / 60)} minutes ago`);
		} else {
			console.log('🆕 First time sync - fetching all entities');
		}

		// Perform sync with progress tracking
		const result = await arDrive.syncPublicDrive(DRIVE_ID, {
			syncState: previousState,
			onProgress: (processed, total) => {
				const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
				process.stdout.write(`\r   Progress: ${processed}/${total} entities (${percentage}%)`);
			},
			batchSize: 50, // Adjust based on your needs
			stopAfterKnownCount: 10 // Optimization for large drives
		});

		console.log('\n✅ Sync completed!');

		// Process the results
		processSyncResults(result);

		// Save the new sync state
		await saveSyncState(result.newSyncState);
		console.log('\n💾 Sync state saved for next run');

		// Example: Process all entities
		console.log(`\n📚 Total entities in result: ${result.entities.length}`);

		// Group entities by type
		const drives = result.entities.filter((e) => e.entityType === 'drive');
		const folders = result.entities.filter((e) => e.entityType === 'folder');
		const files = result.entities.filter((e) => e.entityType === 'file');

		console.log(`   Drives: ${drives.length}`);
		console.log(`   Folders: ${folders.length}`);
		console.log(`   Files: ${files.length}`);
	} catch (error) {
		console.error('❌ Sync failed:', error);
		process.exit(1);
	}
}

/**
 * Sync a private drive example
 */
async function syncPrivateDrive(driveKey: string): Promise<void> {
	try {
		const wallet = readJWKFile(WALLET_PATH);
		const arDrive = arDriveFactory({ wallet });

		const previousState = await loadSyncState(DRIVE_ID);

		console.log('🔐 Syncing private drive...');

		const result = await arDrive.syncPrivateDrive(DRIVE_ID, driveKey, {
			syncState: previousState,
			onProgress: (processed, total) => {
				const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
				process.stdout.write(`\r   Progress: ${processed}/${total} entities (${percentage}%)`);
			}
		});

		console.log('\n✅ Private drive sync completed!');
		processSyncResults(result);
		await saveSyncState(result.newSyncState);
	} catch (error) {
		console.error('❌ Private drive sync failed:', error);
		process.exit(1);
	}
}

/**
 * Force full resync example
 */
async function forceFullResync(): Promise<void> {
	try {
		// Delete existing sync state
		const statePath = path.join(SYNC_STATE_DIR, `${DRIVE_ID}.json`);
		await fs.unlink(statePath).catch(() => {});

		console.log('🔄 Forcing full resync (sync state cleared)');
		await syncDrive();
	} catch (error) {
		console.error('❌ Force resync failed:', error);
		process.exit(1);
	}
}

// Run the example
if (require.main === module) {
	// Check command line arguments
	const args = process.argv.slice(2);

	if (args.includes('--force')) {
		forceFullResync();
	} else if (args.includes('--private')) {
		const driveKeyIndex = args.indexOf('--drive-key');
		if (driveKeyIndex !== -1 && args[driveKeyIndex + 1]) {
			syncPrivateDrive(args[driveKeyIndex + 1]);
		} else {
			console.error('❌ Please provide drive key with --drive-key flag');
			process.exit(1);
		}
	} else {
		syncDrive();
	}
}

export { syncDrive, syncPrivateDrive, forceFullResync };
