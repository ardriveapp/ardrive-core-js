/**
 * Example: Using Persistent Storage for Incremental Sync
 * 
 * This example demonstrates how to use storage adapters to persist
 * sync state across application restarts, enabling efficient
 * incremental synchronization.
 */

const {
  arDriveFactory,
  readJWKFile,
  ArFSDAOIncrementalSync,
  FileSystemSyncStateStore,
  EID
} = require('../lib/exports');

const Arweave = require('arweave');

async function main() {
  // Initialize Arweave client
  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });

  // Load your wallet
  const wallet = readJWKFile('./test_wallet.json');

  // Create a persistent storage adapter
  // This will save sync state to the filesystem
  const syncStateStore = new FileSystemSyncStateStore('./.ardrive-sync-cache');

  // Create the incremental sync DAO with persistent storage
  const arfsDao = new ArFSDAOIncrementalSync(
    wallet,
    arweave,
    false, // dryRun - set to true for testing without transactions
    'MyApp',
    '1.0.0',
    undefined, // arFSTagSettings - use defaults
    undefined, // caches - use defaults
    undefined, // gatewayApi - use defaults
    syncStateStore // Our persistent storage adapter
  );

  // Create ArDrive instance with the DAO
  const arDrive = arDriveFactory({
    wallet: wallet,
    arfsDao: arfsDao
  });

  // Example drive ID to sync
  const driveId = EID('your-drive-id-here');

  console.log('Starting sync with persistent storage...\n');

  // First sync - will fetch all entities and save state
  console.log('First sync (full):');
  const firstSync = await arDrive.syncPublicDrive(driveId);
  console.log(`  Found ${firstSync.entities.length} total entities`);
  console.log(`  Synced up to block ${firstSync.newSyncState.lastSyncedBlockHeight}`);
  console.log('  State saved to disk\n');

  // Simulate application restart by creating new instances
  // but using the same storage location
  const newSyncStateStore = new FileSystemSyncStateStore('./.ardrive-sync-cache');
  const newArfsDao = new ArFSDAOIncrementalSync(
    wallet,
    arweave,
    false,
    'MyApp',
    '1.0.0',
    undefined,
    undefined,
    undefined,
    newSyncStateStore
  );
  
  const newArDrive = arDriveFactory({
    wallet: wallet,
    arfsDao: newArfsDao
  });

  // Second sync - will load saved state and only fetch new changes
  console.log('Second sync (incremental after restart):');
  const secondSync = await newArDrive.syncPublicDrive(driveId);
  console.log(`  Found ${secondSync.changes.added.length} new entities`);
  console.log(`  Found ${secondSync.changes.modified.length} modified entities`);
  console.log(`  Synced from block ${firstSync.newSyncState.lastSyncedBlockHeight} to ${secondSync.newSyncState.lastSyncedBlockHeight}`);

  // Managing stored states
  console.log('\nManaging stored sync states:');
  
  // List all cached drives
  const cachedDrives = await newSyncStateStore.list();
  console.log(`  ${cachedDrives.length} drives have cached sync state`);

  // Load specific drive state
  const loadedState = await newSyncStateStore.load(driveId);
  if (loadedState) {
    console.log(`  Drive ${driveId} last synced at block ${loadedState.lastSyncedBlockHeight}`);
  }

  // Optional: Clear state for a specific drive
  // await newSyncStateStore.clear(driveId);
  
  // Optional: Clear all cached states
  // await newSyncStateStore.clearAll();
}

// Run the example
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});