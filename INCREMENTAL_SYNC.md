# ArDrive Incremental Sync

This document describes the incremental sync feature added to ardrive-core-js, which enables efficient synchronization of drive contents by tracking changes since the last sync.

## Overview

Incremental sync uses Arweave block heights to track when entities were last synchronized, allowing subsequent syncs to fetch only new or modified content. This significantly reduces bandwidth and improves performance for large drives.

## Key Features

- **Block-Height Based Tracking**: Uses Arweave block heights for precise change tracking
- **Change Detection**: Identifies added, modified, and unreachable entities
- **State Persistence**: Sync state can be saved and restored across sessions
- **Progress Tracking**: Built-in callbacks for monitoring sync progress
- **Memory Efficient**: Uses streaming and batching for large drives
- **Cache Integration**: Leverages existing entity caches to minimize network requests

## Usage

### Basic Public Drive Sync

```typescript
import { arDriveFactory, EID, ADDR } from 'ardrive-core-js';

const arDrive = await arDriveFactory({ wallet });

// Initial sync
const result = await arDrive.syncPublicDrive(
  EID('your-drive-id'),
  ADDR('owner-address'),
  {
    onProgress: (processed, total) => {
      console.log(`Synced ${processed} entities`);
    }
  }
);

console.log(`Found ${result.changes.added.length} new entities`);
console.log(`Found ${result.changes.modified.length} modified entities`);

// Save sync state for next time
const savedState = JSON.stringify(result.newSyncState);
```

### Incremental Sync with Saved State

```typescript
// Load previous sync state
const previousState = JSON.parse(savedState);

// Sync only changes since last time
const incrementalResult = await arDrive.syncPublicDrive(
  EID('your-drive-id'),
  ADDR('owner-address'),
  {
    syncState: previousState,
    onProgress: (processed) => {
      console.log(`Processing entity ${processed}`);
    }
  }
);
```

### Private Drive Sync

```typescript
const driveKey = await derivateDriveKey('password', driveId, wallet);

const result = await arDrive.syncPrivateDrive(
  driveId,
  driveKey,
  ownerAddress,
  {
    includeRevisions: true,
    batchSize: 100
  }
);
```

### Advanced Options

```typescript
const options = {
  // Previous sync state to resume from
  syncState: previousSyncState,
  
  // Number of entities to fetch per batch (default: 100)
  batchSize: 50,
  
  // Stop after finding this many known entities (optimization)
  stopAfterKnownCount: 10,
  
  // Include file revisions in results
  includeRevisions: false,
  
  // Progress callback
  onProgress: (processed, total) => {
    // total is -1 if unknown
  }
};
```

## Sync State Management

### Serialization

```typescript
import { serializeSyncState, deserializeSyncState } from 'ardrive-core-js';

// Convert to JSON-safe format
const serialized = serializeSyncState(syncResult.newSyncState);

// Save to file/database
fs.writeFileSync('sync-state.json', JSON.stringify(serialized));

// Restore later
const saved = JSON.parse(fs.readFileSync('sync-state.json'));
const syncState = deserializeSyncState(saved);
```

### Caching

```typescript
// Store sync state in cache
await arDrive.setCachedSyncState(driveId, syncState);

// Retrieve from cache
const cached = await arDrive.getCachedSyncState(driveId);
```

## Architecture

### Components

1. **ArFSDAOAnonymousIncrementalSync**: Handles public drive sync
2. **ArFSDAOIncrementalSync**: Extends with private drive support
3. **DriveSyncState**: Tracks sync progress and entity states
4. **IncrementalSyncCache**: Manages entity and state caching

### How It Works

1. **Initial Sync**: Fetches all entities and builds initial state
2. **Change Detection**: Queries for entities with blockHeight > lastSyncedBlockHeight
3. **Entity Resolution**: Fetches full metadata for changed entities
4. **State Update**: Updates sync state with new block heights
5. **Cache Management**: Stores entities and state in cache

### Performance Optimizations

- **Batch Processing**: Fetches entities in configurable batches
- **Early Stop**: Stops when finding consecutive known entities
- **Cache First**: Checks cache before network requests
- **Minimal Queries**: Uses efficient GraphQL queries with block filters

## Migration Guide

### For Existing Code

The incremental sync feature is fully backward compatible. Existing code continues to work unchanged.

To add incremental sync to existing code:

```typescript
// Before (full sync every time)
const entities = await arDrive.getAllDriveEntities(driveId, owner);

// After (incremental sync)
const syncResult = await arDrive.syncPublicDrive(driveId, owner);
const entities = syncResult.entities;
```

### Factory Changes

The factory functions now support optional Ethereum signers for Turbo:

```typescript
const arDrive = await arDriveFactory({
  wallet: existingJWKWallet,
  
  // Optional: Use Ethereum signer for Turbo
  ethereumPrivateKey: '0x...',
  // OR
  turboSigner: customEthereumSigner
});
```

## Type Definitions

### Core Types

```typescript
interface DriveSyncState {
  driveId: DriveID;
  drivePrivacy: DrivePrivacy;
  lastSyncedBlockHeight: number;
  lastSyncedTimestamp: UnixTime;
  entityStates: Map<string, EntitySyncState>;
}

interface EntitySyncState {
  entityId: EntityID;
  txId: TransactionID;
  blockHeight: number;
  parentFolderId?: FolderID;
  name: string;
  entityType: 'drive' | 'folder' | 'file';
}

interface IncrementalSyncResult {
  entities: ArFSFileOrFolderEntity[];
  changes: {
    added: EntityID[];
    modified: EntityID[];
    unreachable: EntityID[];
  };
  newSyncState: DriveSyncState;
  stats: SyncStats;
}
```

## Error Handling

```typescript
try {
  const result = await arDrive.syncPublicDrive(driveId, owner);
} catch (error) {
  if (error.message.includes('Drive not found')) {
    // Handle missing drive
  } else if (error.message.includes('Network error')) {
    // Retry with exponential backoff
  }
}
```

## Best Practices

1. **Save Sync State**: Always persist sync state between sessions
2. **Handle Failures**: Implement retry logic for network errors
3. **Progress Feedback**: Use onProgress for user feedback
4. **Batch Size**: Adjust based on drive size and network speed
5. **Cache Management**: Periodically clear old cache entries

## Testing

The implementation includes comprehensive unit and integration tests:

```bash
# Run all incremental sync tests
npm run test:sync

# Run unit tests only
npm run test:sync:unit

# Run integration tests (requires test drive)
npm run test:sync:integration
```

## Limitations

- Cannot detect deletions with 100% certainty (marked as "unreachable" - could be permissions changed or ownership transferred)
- Requires tracking sync state between sessions
- Initial sync must fetch all entities
- Block height precision depends on Arweave network finality