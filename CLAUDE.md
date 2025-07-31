# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build Commands
- `yarn build` - Clean and build the TypeScript library
- `yarn dev` - Build in watch mode for development
- `yarn typecheck` - Run TypeScript type checking without emitting files
- `yarn clean` - Remove build artifacts (lib/, coverage/, .nyc_output/)

### Testing Commands
- `yarn test` - Run all tests with code coverage (uses Mocha with parallel execution)
- `yarn test -g 'test name'` - Run specific tests matching the pattern
- `yarn coverage` - Generate detailed HTML coverage report
- `yarn power-assert -g 'test name'` - Debug specific test with detailed assertions (runs without parallel)
- `yarn arlocal-docker-test` - Run integration tests against local Arweave instance
- `yarn test:sync` - Run all incremental sync tests (no parallel)
- `yarn test:sync:unit` - Run unit tests for incremental sync features
- `yarn test:sync:integration` - Run integration tests for incremental sync

### Code Quality Commands
- `yarn lint` - Run ESLint on all TypeScript files
- `yarn lintfix` - Automatically fix linting issues
- `yarn format` - Format code with Prettier

## High-Level Architecture

### Core Design Patterns

1. **Factory Pattern**: The library uses factory functions (`arDriveFactory`, `arDriveAnonymousFactory`) to construct instances with proper dependency injection. This allows for easy testing and configuration.

2. **Inheritance Hierarchy**: 
   - `ArDriveAnonymous` - Base class for read-only operations
   - `ArDrive` extends `ArDriveAnonymous` - Adds authenticated write operations and sync methods
   - Similar pattern for `ArFSDAOAnonymous` → `ArFSDAO` → `ArFSDAOIncrementalSync`

3. **Type Safety**: Extensive use of branded types (e.g., `DriveID`, `FolderID`, `FileID`, `TransactionID`) to prevent mixing up different ID types at compile time.

4. **Separation of Concerns**:
   - **ArDrive Layer**: High-level API for users
   - **ArFS Layer**: File system operations and entity management
   - **DAO Layer**: Direct blockchain interactions (with incremental sync extensions)
   - **Oracle Layer**: External service integrations (pricing, community)
   - **Sync State Layer**: State management for incremental synchronization

### Key Architectural Components

1. **Entity System**: Everything is an entity (Drive, Folder, File) with metadata and data transactions. Private entities add encryption.

2. **Transaction Planning**: Before executing blockchain transactions, the system plans all operations, calculates costs, and resolves conflicts.

3. **Bundling Logic**: Multiple small transactions are automatically bundled for efficiency using ANS-104 data bundles.

4. **Streaming Architecture**: Large file operations use streams to avoid memory issues. Sync operations use cursor-based pagination for memory efficiency.

5. **Caching Strategy**: Multi-level caching with different TTLs:
   - Entity metadata caches (long-lived)
   - Sync state cache (5 minutes for session continuity)
   - Promise-based caching to avoid duplicate requests

### Testing Strategy

- **Unit Tests**: Test individual functions/classes in isolation (located next to source files as `*.test.ts`)
- **Integration Tests**: Test against real services (in `/tests` directory)
- **Test Helpers**: Extensive stubs and test utilities in `tests/stubs.ts` and `tests/test_helpers.ts`
- **Test Configuration**: Mocha configuration in `.mocharc.js`, tests run in parallel by default

### Important Patterns to Follow

1. **Error Handling**: Always throw typed errors with meaningful messages
2. **Async/Await**: All I/O operations should be Promise-based
3. **Dependency Injection**: Pass dependencies through constructors, not imports
4. **Immutability**: Prefer immutable data structures where possible
5. **Type Guards**: Use type guards for runtime type checking

### Key Files for Understanding the Codebase

- `src/exports.ts` - All public exports
- `src/ardrive.ts` - Main user-facing API (includes sync methods)
- `src/arfs/arfsdao.ts` - Blockchain interactions
- `src/arfs/arfsdao_incremental_sync.ts` - Incremental sync implementation
- `src/arfs/arfsdao_anonymous_incremental_sync.ts` - Public drive sync implementation
- `src/arfs/turbo.ts` - Turbo integration for optimized uploads
- `src/ardrive_factory.ts` - Factory functions with dependency injection
- `src/types/` - All type definitions
- `src/types/sync_types.ts` - Incremental sync type definitions
- `src/utils/constants.ts` - Important constants and limits
- `src/utils/sync_state.ts` - Sync state management utilities

### Incremental Drive Synchronization

The library provides efficient incremental sync capabilities:

1. **Block-Height Based**: Tracks changes using Arweave block heights for precise synchronization
2. **Change Detection**: Identifies added, modified, and unreachable entities
3. **State Persistence**: Sync state can be serialized/deserialized for cross-session continuity
4. **Progress Tracking**: Built-in progress callbacks for UI integration
5. **Optimizations**: 
   - Configurable batch sizes (default/max: 100)
   - Early termination after N consecutive known entities
   - Query optimization starting from last synced block + 1

Key methods:
- `ArDrive.syncPublicDrive()` - Sync public drives
- `ArDrive.syncPrivateDrive()` - Sync private drives with decryption
- `serializeSyncState()` / `deserializeSyncState()` - State persistence utilities

Sync Options:
```typescript
interface IncrementalSyncOptions {
  earlyTerminationConsecutiveEntityThreshold?: number; // Default: 25
  graphqlPageSize?: number; // Default: 100, Max: 100
  progressCallback?: (progress: IncrementalSyncProgress) => void;
}
```

Error Handling:
- `IncrementalSyncError` preserves partial results when sync fails mid-process
- Statistics tracking for monitoring sync performance

### Turbo Integration

The library supports Turbo for optimized uploads:

1. **Turbo Class**: Wrapper around @ardrive/turbo-sdk for uploads
2. **Factory Integration**: ArDrive factory accepts `turboSettings` parameter
3. **Automatic Bundling**: When Turbo is enabled, uploads are optimized through Turbo service
4. **Dry Run Support**: Turbo operations respect the `dryRun` flag for testing

### Environment Variables

- `ARDRIVE_PROGRESS_LOG=1` - Enable upload progress logging to stderr
- `ARDRIVE_CACHE_LOG=1` - Enable cache operation logging

### Node Version Requirements

- Node.js >= 18 (enforced in package.json)
- Use with nvm: `nvm install && nvm use`