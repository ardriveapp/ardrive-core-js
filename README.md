# ardrive-core-js

ArDrive Core is a TypeScript library that contains the essential back end application features to support the ArDrive CLI and Desktop apps, such as file management, Permaweb upload/download, wallet management, and other common functions.

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

## Quick Start

The recommended approach for integrating with ArDrive Core is through the `ArDrive` class, constructed using the `arDriveFactory` function:

```typescript
import { readJWKFile, arDriveFactory } from 'ardrive-core-js';

// Read wallet from file
const myWallet = readJWKFile('/path/to/wallet.json');

// Construct ArDrive class
const arDrive = arDriveFactory({ wallet: myWallet });

// Create a public drive and its root folder
const createDriveResult = await arDrive.createPublicDrive({ 
  driveName: 'My-Drive' 
});

console.log('Drive ID:', createDriveResult.driveId);
console.log('Root Folder ID:', createDriveResult.rootFolderId);
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