# ardrive-core-js

ArDrive Core is a TypeScript library that contains the essential back end application features to support the ArDrive CLI and Desktop apps, such as file management, Permaweb upload/download, wallet management, and other common functions.

**Key Features:**
- 📁 Complete file system operations on Arweave (drives, folders, files)
- 🔄 Incremental drive synchronization with change detection
- 💾 Persistent storage adapters for cross-session state management
- 🔐 End-to-end encryption for private drives
- 📦 Automatic bundling for efficient uploads
- ⚡ Turbo integration for optimized performance
- 💰 Cost estimation and community tipping

Engage with the community in [Discord](https://discord.gg/7RuTBckX) for more information.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [Drive Operations](#drive-operations)
  - [Folder Operations](#folder-operations)
  - [File Operations](#file-operations)
  - [Bulk Operations](#bulk-operations)
  - [Download Operations](#download-operations)
  - [Encryption & Security](#encryption--security)
  - [Pricing & Cost Estimation](#pricing--cost-estimation)
  - [Custom Metadata](#custom-metadata)
  - [Conflict Resolution](#conflict-resolution)
- [Advanced Features](#advanced-features)
  - [Incremental Drive Synchronization](#incremental-drive-synchronization)
  - [Persistent Storage for Sync State](#persistent-storage-for-sync-state)
  - [Turbo Integration](#turbo-integration)
  - [Bundle Support](#bundle-support)
  - [Manifest Creation](#manifest-creation)
  - [Progress Tracking](#progress-tracking)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)

## Installation

To add the ArDrive Core library to your project:

```shell
# Using yarn
yarn add ardrive-core-js

# Using npm
npm install ardrive-core-js
```

### Optional Dependencies

For additional features:

```shell
# SQLite storage adapter (for advanced sync state persistence)
yarn add better-sqlite3  # or npm install better-sqlite3
```

## Quick Start

The recommended approach for integrating with ArDrive Core is through the `ArDrive` class, constructed using the `arDriveFactory` function:

```typescript
import { readJWKFile, arDriveFactory } from 'ardrive-core-js';

// Read wallet from file
const myWallet = readJWKFile('/path/to/wallet.json');

// Construct ArDrive class
const arDrive = arDriveFactory({ 
  wallet: myWallet
});

// Create a public drive and its root folder
const createDriveResult = await arDrive.createPublicDrive({ 
  driveName: 'My-Drive' 
});

console.log('Drive ID:', createDriveResult.driveId);
console.log('Root Folder ID:', createDriveResult.rootFolderId);

// Sync drive to track changes (in-memory caching only)
const syncResult = await arDrive.syncPublicDrive(createDriveResult.driveId);
console.log('Total entities:', syncResult.entities.length);
```

## Core Concepts

### Entity Types

ArDrive uses a hierarchical structure:
- **Drives**: Top-level containers (public or private)
- **Folders**: Organize files within drives
- **Files**: Individual files stored on Arweave

Each entity has a unique ID (`DriveID`, `FolderID`, `FileID`) and can be either public (unencrypted) or private (encrypted).

### Wallet Management

```typescript
import { JWKWallet } from 'ardrive-core-js';

// Create wallet from JWK
const wallet = new JWKWallet(jwkKey);

// Check wallet balance
const balance = await wallet.getBalance();
```

### Entity IDs

Use the type-safe entity ID constructors:

```typescript
import { EID, DriveID, FolderID, FileID } from 'ardrive-core-js';

// Generic entity ID
const entityId = EID('10108b54a-eb5e-4134-8ae2-a3946a428ec7');

// Specific entity IDs
const driveId = new DriveID('12345674a-eb5e-4134-8ae2-a3946a428ec7');
const folderId = new FolderID('47162534a-eb5e-4134-8ae2-a3946a428ec7');
const fileId = new FileID('98765432a-eb5e-4134-8ae2-a3946a428ec7');
```

## API Reference

### Drive Operations

#### Creating Drives

```typescript
// Public drive
const publicDrive = await arDrive.createPublicDrive({
  driveName: 'My Public Drive'
});

// Private drive with password
const privateDrive = await arDrive.createPrivateDrive({
  driveName: 'My Private Drive',
  drivePassword: 'mySecretPassword'
});
```

#### Reading Drive Information

```typescript
// Get public drive
const publicDriveInfo = await arDrive.getPublicDrive({ 
  driveId 
});

// Get private drive (requires drive key)
const privateDriveInfo = await arDrive.getPrivateDrive({ 
  driveId, 
  driveKey 
});

// Get all drives for an address
const allDrives = await arDrive.getAllDrivesForAddress({ 
  address: walletAddress,
  privateKeyData: wallet.getPrivateKey() 
});
```

#### Renaming Drives

```typescript
// Rename public drive
await arDrive.renamePublicDrive({
  driveId,
  newName: 'Updated Drive Name'
});

// Rename private drive
await arDrive.renamePrivateDrive({
  driveId,
  driveKey,
  newName: 'Updated Private Name'
});
```

### Folder Operations

#### Creating Folders

```typescript
// Public folder
const publicFolder = await arDrive.createPublicFolder({
  folderName: 'Documents',
  driveId,
  parentFolderId
});

// Private folder
const privateFolder = await arDrive.createPrivateFolder({
  folderName: 'Secret Documents',
  driveId,
  driveKey,
  parentFolderId
});
```

#### Listing Folder Contents

```typescript
// List public folder
const publicContents = await arDrive.listPublicFolder({
  folderId,
  maxDepth: 2, // Optional: limit recursion depth
  includeRoot: true // Optional: include root folder in results
});

// List private folder
const privateContents = await arDrive.listPrivateFolder({
  folderId,
  driveKey,
  maxDepth: 1
});
```

#### Moving and Renaming Folders

```typescript
// Move folder
await arDrive.movePublicFolder({
  folderId,
  newParentFolderId
});

// Rename folder
await arDrive.renamePublicFolder({
  folderId,
  newName: 'New Folder Name'
});
```

### File Operations

#### Uploading Files

```typescript
import { wrapFileOrFolder } from 'ardrive-core-js';

// Wrap file for upload
const wrappedFile = wrapFileOrFolder('/path/to/file.pdf');

// Upload public file
const publicUpload = await arDrive.uploadPublicFile({
  parentFolderId,
  wrappedFile,
  conflictResolution: 'upsert' // skip, replace, upsert, or error
});

// Upload private file
const privateUpload = await arDrive.uploadPrivateFile({
  parentFolderId,
  driveKey,
  wrappedFile
});
```

#### Reading File Information

```typescript
// Get public file metadata
const publicFile = await arDrive.getPublicFile({ fileId });

// Get private file metadata
const privateFile = await arDrive.getPrivateFile({ 
  fileId, 
  driveKey 
});
```

#### Moving and Renaming Files

```typescript
// Move file
await arDrive.movePublicFile({
  fileId,
  newParentFolderId
});

// Rename file
await arDrive.renamePublicFile({
  fileId,
  newName: 'renamed-file.pdf'
});
```

### Bulk Operations

#### Upload Multiple Files and Folders

```typescript
import { wrapFileOrFolder, EntityKey } from 'ardrive-core-js';

// Prepare entities for upload
const folder1 = wrapFileOrFolder('/path/to/folder1');
const folder2 = wrapFileOrFolder('/path/to/folder2');
const file1 = wrapFileOrFolder('/path/to/file1.txt');

// Upload everything in one operation
const bulkUpload = await arDrive.uploadAllEntities({
  entitiesToUpload: [
    // Public folder
    {
      wrappedEntity: folder1,
      destFolderId: rootFolderId
    },
    // Private folder
    {
      wrappedEntity: folder2,
      destFolderId: rootFolderId,
      driveKey: privateDriveKey
    },
    // Public file
    {
      wrappedEntity: file1,
      destFolderId: someFolderId
    }
  ],
  conflictResolution: 'upsert'
});

// Results include all created entities
console.log('Created folders:', bulkUpload.created.length);
console.log('Total cost:', bulkUpload.totalCost.toString());
```

#### Create Folder and Upload Contents

```typescript
// Create folder and upload all children
const folderWithContents = await arDrive.createPublicFolderAndUploadChildren({
  parentFolderId,
  wrappedFolder: wrapFileOrFolder('/path/to/folder'),
  conflictResolution: 'skip'
});
```

### Download Operations

#### Download Files

```typescript
// Download public file
const publicData = await arDrive.downloadPublicFile({ 
  fileId 
});
// publicData is a Buffer/Uint8Array

// Download private file (automatically decrypted)
const privateData = await arDrive.downloadPrivateFile({ 
  fileId, 
  driveKey 
});
```

#### Download Folders

```typescript
// Download entire folder
const folderData = await arDrive.downloadPublicFolder({
  folderId,
  destFolderPath: '/local/download/path'
});

// Download private folder
const privateFolderData = await arDrive.downloadPrivateFolder({
  folderId,
  driveKey,
  destFolderPath: '/local/download/path'
});
```

### Encryption & Security

#### Key Derivation

```typescript
import { deriveDriveKey, deriveFileKey } from 'ardrive-core-js';

// Derive drive key from password
const driveKey = await deriveDriveKey(
  'myPassword',
  driveId.toString(),
  JSON.stringify(wallet.getPrivateKey())
);

// File keys are automatically derived from drive keys
const fileKey = await deriveFileKey(driveKey, fileId);
```

#### Manual Encryption/Decryption

```typescript
import { driveEncrypt, driveDecrypt } from 'ardrive-core-js';

// Encrypt data
const { cipher, cipherIV } = await driveEncrypt(driveKey, data);

// Decrypt data
const decrypted = await driveDecrypt(cipherIV, driveKey, cipher);
```

### Pricing & Cost Estimation

```typescript
// Get price estimator
const priceEstimator = arDrive.getArDataPriceEstimator();

// Estimate cost for data size
const cost = await priceEstimator.getARPriceForByteCount(
  new ByteCount(1024 * 1024) // 1MB
);

// Get base Winston price (without tips)
const basePrice = await priceEstimator.getBaseWinstonPriceForByteCount(
  new ByteCount(5 * 1024 * 1024) // 5MB
);
```

### Custom Metadata

Attach custom metadata to files:

```typescript
const fileWithMetadata = wrapFileOrFolder(
  '/path/to/file.txt',
  'text/plain',
  {
    metaDataJson: { 
      'Custom-Field': 'Custom Value',
      'Version': '1.0'
    },
    metaDataGqlTags: {
      'App-Name': ['MyApp'],
      'App-Version': ['1.0.0']
    },
    dataGqlTags: {
      'Content-Type': ['text/plain']
    }
  }
);

// Upload with custom metadata
await arDrive.uploadPublicFile({
  parentFolderId,
  wrappedFile: fileWithMetadata
});
```

### Conflict Resolution

Available strategies when uploading files/folders that already exist:

```typescript
// Skip existing files
await arDrive.uploadAllEntities({
  entitiesToUpload: [...],
  conflictResolution: 'skip'
});

// Replace all existing files
await arDrive.uploadAllEntities({
  entitiesToUpload: [...],
  conflictResolution: 'replace'
});

// Update only if content differs (default)
await arDrive.uploadAllEntities({
  entitiesToUpload: [...],
  conflictResolution: 'upsert'
});

// Rename conflicting files
await arDrive.uploadAllEntities({
  entitiesToUpload: [...],
  conflictResolution: 'rename'
});

// Throw error on conflicts
await arDrive.uploadAllEntities({
  entitiesToUpload: [...],
  conflictResolution: 'error'
});

// Interactive prompt (CLI only)
await arDrive.uploadAllEntities({
  entitiesToUpload: [...],
  conflictResolution: 'ask'
});
```

## Advanced Features

### Incremental Drive Synchronization

ArDrive Core provides efficient incremental synchronization capabilities for tracking changes in drives over time. This feature enables applications to sync only new or modified content rather than fetching entire drive structures repeatedly.

**Note:** The standard `arDriveFactory` creates an ArDrive instance with in-memory sync state caching (5-minute TTL). For persistent storage across sessions, see the [Persistent Storage](#persistent-storage-for-sync-state) section below.

#### Basic Sync Operations

```typescript
// Important: Requires ArFSDAOIncrementalSync for full functionality
// The standard arDriveFactory may not support all sync features

// For basic sync with in-memory caching, first create the DAO:
import { ArFSDAOIncrementalSync } from 'ardrive-core-js';

const arfsDao = new ArFSDAOIncrementalSync(
  wallet, arweave, false // dryRun
);

const arDrive = arDriveFactory({ wallet: myWallet, arfsDao });

// Now sync operations will work:
const syncResult = await arDrive.syncPublicDrive(driveId);

console.log(`Found ${syncResult.entities.length} total entities`);
console.log(`Added: ${syncResult.changes.added.length}`);
console.log(`Modified: ${syncResult.changes.modified.length}`);
console.log(`Unreachable: ${syncResult.changes.unreachable.length}`);

// Sync a private drive with decryption
const privateSyncResult = await arDrive.syncPrivateDrive(
  driveId,
  driveKey
);
```

#### Incremental Sync with Previous State

```typescript
// First sync - gets all entities
const initialSync = await arDrive.syncPublicDrive(driveId);

// Save the sync state for later
const syncState = initialSync.newSyncState;

// Later, sync only changes since last sync
const incrementalSync = await arDrive.syncPublicDrive(driveId, undefined, {
  syncState: syncState // Pass previous state
});

// Only new/modified entities since last sync
console.log(`New entities: ${incrementalSync.changes.added.length}`);
```

#### Progress Tracking

```typescript
// Track sync progress for large drives
const result = await arDrive.syncPublicDrive(driveId, undefined, {
  onProgress: (processed, total) => {
    console.log(`Progress: ${processed}/${total} entities`);
  }
});
```

#### Advanced Sync Options

```typescript
const syncOptions = {
  // Include all file revisions (not just latest)
  includeRevisions: true,
  
  // Batch size for GraphQL queries (default: 100, max: 100)
  batchSize: 50,
  
  // Stop early after finding N consecutive known entities (optimization)
  stopAfterKnownCount: 10,
  
  // Progress callback
  onProgress: (processed, total) => {
    console.log(`Syncing: ${processed}/${total}`);
  }
};

const result = await arDrive.syncPublicDrive(driveId, owner, syncOptions);
```

#### Working with Sync Results

```typescript
// Sync result structure
const result = await arDrive.syncPublicDrive(driveId);

// All entities in the drive (files and folders)
result.entities.forEach(entity => {
  console.log(`${entity.entityType}: ${entity.name} (${entity.entityId})`);
});

// Change detection
result.changes.added.forEach(entity => {
  console.log(`New: ${entity.name}`);
});

result.changes.modified.forEach(entity => {
  console.log(`Modified: ${entity.name} at block ${entity.blockHeight}`);
});

result.changes.unreachable.forEach(entity => {
  console.log(`No longer accessible: ${entity.name}`);
});

// Sync statistics
console.log(`Processed from cache: ${result.stats.fromCache}`);
console.log(`Fetched from network: ${result.stats.fromNetwork}`);
console.log(`Block range: ${result.stats.lowestBlockHeight} - ${result.stats.highestBlockHeight}`);
```

#### Error Handling

```typescript
import { IncrementalSyncError } from 'ardrive-core-js';

try {
  const result = await arDrive.syncPublicDrive(driveId);
} catch (error) {
  if (error instanceof IncrementalSyncError) {
    // Partial results are available even if sync failed
    console.log(`Sync failed but got ${error.partialResult.entities.length} entities`);
    console.log(`Error: ${error.message}`);
    
    // Can continue from partial state
    const partialState = error.partialResult.newSyncState;
  }
}
```

### Persistent Storage for Sync State

By default, sync state is only cached in memory for 5 minutes. To maintain sync state across application restarts, ArDrive Core provides storage adapters that automatically persist and restore sync state.

#### Available Storage Adapters

- **MemorySyncStateStore** - In-memory storage (default behavior)
- **FileSystemSyncStateStore** - Persists to disk (Node.js)
- **LocalStorageSyncStateStore** - Browser localStorage
- **IndexedDBSyncStateStore** - Browser IndexedDB for larger datasets
- **SQLiteSyncStateStore** - SQLite database (optional, see SQLite section below)

#### Quick Start: Persistent Sync (Node.js)

```typescript
import { 
  arDriveFactory, 
  ArFSDAOIncrementalSync,
  FileSystemSyncStateStore 
} from 'ardrive-core-js';

// 1. Create persistent storage adapter
const syncStateStore = new FileSystemSyncStateStore('./.ardrive-cache');

// 2. Create DAO with storage adapter
const arfsDao = new ArFSDAOIncrementalSync(
  wallet,
  arweave,
  false, // dryRun
  'MyApp',
  '1.0.0',
  undefined, // use default settings for these
  undefined,
  undefined,
  syncStateStore // ← Pass storage adapter here
);

// 3. Create ArDrive with the DAO
const arDrive = arDriveFactory({
  wallet,
  arfsDao
});

// 4. Sync operations now persist state automatically
const result = await arDrive.syncPublicDrive(driveId);
// State is saved to disk and will be reused on next run
```

**Important:** The storage adapter must be passed to `ArFSDAOIncrementalSync`, not to `arDriveFactory`.

#### Browser Storage Options

```typescript
import { LocalStorageSyncStateStore, IndexedDBSyncStateStore } from 'ardrive-core-js';

// Option 1: localStorage (simple, ~5-10MB limit)
const syncStateStore = new LocalStorageSyncStateStore('ardrive-sync-');

// Option 2: IndexedDB (for larger datasets)
const syncStateStore = new IndexedDBSyncStateStore('ardrive-sync-db');

// Use with ArFSDAOIncrementalSync same as Node.js example
const arfsDao = new ArFSDAOIncrementalSync(
  wallet, arweave, false, 'MyApp', '1.0.0',
  undefined, undefined, undefined,
  syncStateStore
);
```

#### Working Example

See `examples/persistent-sync-example.js` for a complete working example that demonstrates:
- Setting up persistent storage
- Performing initial full sync
- Simulating app restart
- Performing incremental sync from saved state
- Managing stored sync states

#### SQLite Storage (Optional)

The SQLite adapter provides advanced features like statistics, cleanup, and backups. To use it:

1. Install the peer dependency: `yarn add better-sqlite3`
2. Copy `src/utils/sync_state_store_sqlite.ts.optional` to your project
3. Import and use like other storage adapters

**Note:** SQLite adapter is not included in the default build to avoid forcing the peer dependency.

#### Storage Management Methods

All storage adapters implement these methods:

```typescript
// List all drives with cached state
const driveIds = await syncStateStore.list();

// Load specific drive state
const state = await syncStateStore.load(driveId);

// Clear specific drive
await syncStateStore.clear(driveId);

// Clear all cached states
await syncStateStore.clearAll();
```

#### Custom Storage Implementation

Create your own storage adapter by implementing the `SyncStateStore` interface:

```typescript
import { SyncStateStore, DriveSyncState, DriveID } from 'ardrive-core-js';

class CustomSyncStateStore implements SyncStateStore {
  async save(driveId: DriveID, state: DriveSyncState): Promise<void> {
    // Your storage logic
  }
  
  async load(driveId: DriveID): Promise<DriveSyncState | undefined> {
    // Your retrieval logic
  }
  
  async clear(driveId: DriveID): Promise<void> {
    // Your deletion logic
  }
  
  async list(): Promise<DriveID[]> {
    // Return all stored drive IDs
  }
  
  async clearAll(): Promise<void> {
    // Clear all stored states
  }
}
```

#### Serialization for External Storage

If you need to store sync state in an external system:

```typescript
import { serializeSyncState, deserializeSyncState } from 'ardrive-core-js';

// Serialize state for storage
const result = await arDrive.syncPublicDrive(driveId);
const serialized = serializeSyncState(result.newSyncState);
const jsonString = JSON.stringify(serialized);

// Store in your backend
await myAPI.saveSyncState(driveId, jsonString);

// Later, retrieve and deserialize
const stored = await myAPI.getSyncState(driveId);
const parsed = JSON.parse(stored);
const syncState = deserializeSyncState(parsed);

// Use restored state for incremental sync
const nextSync = await arDrive.syncPublicDrive(driveId, undefined, {
  syncState
});
```

### Turbo Integration

Enable Turbo for optimized uploads:

```typescript
// Enable Turbo
const arDriveWithTurbo = arDriveFactory({ 
  wallet: myWallet, 
  turboSettings: {} 
});

// Uploads will automatically use Turbo
const result = await arDriveWithTurbo.uploadAllEntities({
  entitiesToUpload: [{ wrappedEntity, destFolderId }]
});
```

### Bundle Support

Large uploads are automatically bundled for efficiency:

```typescript
// Bundling happens automatically for multiple files
const bulkResult = await arDrive.uploadAllEntities({
  entitiesToUpload: manyFiles,
  // Bundling is handled internally
});
```

### Manifest Creation

Create Arweave manifests for web hosting:

```typescript
// Create a manifest for a folder
const manifest = await arDrive.uploadPublicManifest({
  folderId,
  destManifestName: 'index.html',
  conflictResolution: 'upsert'
});

// Access: https://arweave.net/{manifestId}
```

### Progress Tracking

Enable upload progress logging:

```bash
# Set environment variable
export ARDRIVE_PROGRESS_LOG=1
```

Progress will be logged to stderr:
```
Uploading file transaction 1 of total 2 transactions...
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 0%
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 35%
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 66%
Transaction _GKQasQX194a364Hph8Oe-oku1AdfHwxWOw9_JC1yjc Upload Progress: 100%
```

### Caching

ArDrive Core maintains a metadata cache for improved performance:

```shell
# Cache locations
Windows: <os.homedir()>/ardrive-caches/metadata
Non-Windows: <os.homedir()>/.ardrive/caches/metadata
```

Enable cache logging:
```bash
export ARDRIVE_CACHE_LOG=1
```

### Anonymous Operations

Use ArDrive without a wallet for read-only operations:

```typescript
import { arDriveAnonymousFactory } from 'ardrive-core-js';

const anonymousArDrive = arDriveAnonymousFactory({});

// Read public data
const publicFile = await anonymousArDrive.getPublicFile({ fileId });
const folderContents = await anonymousArDrive.listPublicFolder({ folderId });
```

### Community Features

Send tips to the ArDrive community:

```typescript
// Send community tip
await arDrive.sendCommunityTip({
  tokenAmount: new Winston(1000000000000), // 1 AR
  walletAddress,
  communityWalletAddress
});
```

## Development

### Environment Setup

We use nvm and Yarn for development:

1. Install nvm [using their instructions][nvm-install]
2. Install correct Node version: `nvm install && nvm use`
3. Install Yarn 3.x: Follow [Yarn installation][yarn-install]
4. Enable git hooks: `yarn husky install`
5. Install dependencies: `yarn install --check-cache`

### Recommended VS Code Extensions

- [ESLint][eslint-vscode]
- [EditorConfig][editor-config-vscode]
- [Prettier][prettier-vscode]
- [ZipFS][zipfs-vscode]

### Building

```shell
# Build the library
yarn build

# Development mode with watch
yarn dev
```

### Linting and Formatting

```shell
# Run linter
yarn lint

# Fix linting issues
yarn lintfix

# Format code
yarn format

# Type checking
yarn typecheck
```

## Testing

This library uses [Mocha] with [Chai] and [Sinon] for testing.

### Running Tests

```shell
# Run all tests
yarn test

# Run specific tests
yarn test -g 'My specific test'

# Run incremental sync tests
yarn test:sync
yarn test:sync:unit  # Unit tests only
yarn test:sync:integration  # Integration tests only

# Run with coverage
yarn coverage

# Power assert for debugging
yarn power-assert -g 'My test case'
```

### Test Organization

- Unit tests: Located next to source files (`*.test.ts`)
- Integration tests: Located in `/tests` directory

### ArLocal Testing

For integration testing with a local Arweave instance:

```shell
yarn arlocal-docker-test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

AGPL-3.0-or-later

## Support

- [Discord Community](https://discord.gg/7RuTBckX)
- [GitHub Issues](https://github.com/ardriveapp/ardrive-core-js/issues)
- [ArDrive Website](https://ardrive.io)

[yarn-install]: https://yarnpkg.com/getting-started/install
[nvm-install]: https://github.com/nvm-sh/nvm#installing-and-updating
[editor-config-vscode]: https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig
[prettier-vscode]: https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode
[zipfs-vscode]: https://marketplace.visualstudio.com/items?itemName=arcanis.vscode-zipfs
[eslint-vscode]: https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint
[mocha]: https://github.com/mochajs/mocha
[chai]: https://github.com/chaijs/chai
[sinon]: https://github.com/sinonjs/sinon