# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build Commands
- `yarn build` - Clean and build the TypeScript library
- `yarn dev` - Build in watch mode for development
- `yarn typecheck` - Run TypeScript type checking without emitting files

### Testing Commands
- `yarn test` - Run all tests with code coverage
- `yarn test -g 'test name'` - Run specific tests matching the pattern
- `yarn coverage` - Generate detailed HTML coverage report
- `yarn power-assert -g 'test name'` - Debug specific test with detailed assertions
- `yarn arlocal-docker-test` - Run integration tests against local Arweave instance

### Code Quality Commands
- `yarn lint` - Run ESLint on all TypeScript files
- `yarn lintfix` - Automatically fix linting issues
- `yarn format` - Format code with Prettier

## High-Level Architecture

### Core Design Patterns

1. **Factory Pattern**: The library uses factory functions (`arDriveFactory`, `arDriveAnonymousFactory`) to construct instances with proper dependency injection. This allows for easy testing and configuration.

2. **Inheritance Hierarchy**: 
   - `ArDriveAnonymous` - Base class for read-only operations
   - `ArDrive` extends `ArDriveAnonymous` - Adds authenticated write operations
   - Similar pattern for `ArFSDAOAnonymous` and `ArFSDAO`

3. **Type Safety**: Extensive use of branded types (e.g., `DriveID`, `FolderID`, `FileID`) to prevent mixing up different ID types at compile time.

4. **Separation of Concerns**:
   - **ArDrive Layer**: High-level API for users
   - **ArFS Layer**: File system operations and entity management
   - **DAO Layer**: Direct blockchain interactions
   - **Oracle Layer**: External service integrations (pricing, community)

### Key Architectural Components

1. **Entity System**: Everything is an entity (Drive, Folder, File) with metadata and data transactions. Private entities add encryption.

2. **Transaction Planning**: Before executing blockchain transactions, the system plans all operations, calculates costs, and resolves conflicts.

3. **Bundling Logic**: Multiple small transactions are automatically bundled for efficiency using ANS-104 data bundles.

4. **Streaming Architecture**: Large file operations use streams to avoid memory issues.

5. **Caching Strategy**: Immutable metadata is cached locally to reduce network requests.

### Testing Strategy

- **Unit Tests**: Test individual functions/classes in isolation (located next to source files)
- **Integration Tests**: Test against real services (in `/tests` directory)
- **Test Helpers**: Extensive stubs and test utilities in `tests/stubs.ts` and `tests/test_helpers.ts`

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
- `src/arfs/turbo.ts` - Turbo integration with Ethereum signer support
- `src/ardrive_factory.ts` - Factory functions with Ethereum options
- `src/types/` - All type definitions
- `src/utils/constants.ts` - Important constants and limits
- `src/utils/sync_state.ts` - Sync state management utilities

### Incremental Drive Synchronization

The library provides efficient incremental sync capabilities:

1. **Block-Height Based**: Tracks changes using Arweave block heights for precise synchronization
2. **Change Detection**: Identifies added, modified, and possibly deleted entities
3. **State Persistence**: Sync state can be serialized/deserialized for cross-session continuity
4. **Progress Tracking**: Built-in progress callbacks for UI integration
5. **Optimizations**: Configurable batch sizes and early-stop mechanisms for large drives

Key methods:
- `ArDrive.syncPublicDrive()` - Sync public drives
- `ArDrive.syncPrivateDrive()` - Sync private drives with decryption
- `serializeSyncState()` / `deserializeSyncState()` - State persistence utilities

### Turbo and Ethereum Integration

The library now supports Ethereum-based signers for Turbo operations:

1. **Turbo Class**: Enhanced to support both authenticated and unauthenticated clients
2. **Factory Integration**: ArDrive factory accepts `ethereumPrivateKey` and `turboSigner` parameters
3. **Authenticated Operations**: When Ethereum credentials are provided, Turbo uses authenticated client
4. **Type Safety**: Full TypeScript support for all Ethereum signer options
5. **Testing**: Comprehensive unit and integration tests for Ethereum functionality