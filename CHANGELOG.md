# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.0] - 2025-10-21

### Added

- **Browser bundle support**: New `ardrive-core-js/web` export provides browser-compatible API via esbuild bundling with Node.js polyfills
- Web-specific implementations: `ArDriveWeb`, `ArFSDAOAuthenticatedWeb`, crypto operations (`aesGcmEncrypt`, `aesGcmDecrypt`, `deriveDriveKeyV2`), and `JWKWalletWeb`
- File wrapper utilities for browser: `wrapFile()` and `wrapFiles()` for `File`/`FileList` objects
- Factory functions: `arDriveFactory()` and `arDriveAnonymousFactory()` for web environment initialization
- Playwright test suite for cross-platform validation (22 tests covering crypto, file operations, anonymous/authenticated workflows)
- Support for Wander and custom signers via `ArDriveSigner` interface
- Public and private drive operations: create drives/folders, upload/list files, rename/move entities, upload manifests
- **Turbo-only uploads**: All authenticated uploads use Turbo SDK; traditional Arweave transaction uploads not supported in browser build
- TypeScript declaration generation via `tsconfig.web.json` for accurate browser API types

### Changed

- Refactored core classes to be browser-compatible: `ArDriveAnonymous`, `ArFSDAOAnonymous`, `GatewayAPI` now work in both Node.js and browser
- Extracted browser-compatible utilities to `common_browser.ts` module
- Updated `package.json` exports to include `./web` entry point with proper type definitions
- Build system: Added `build:web`, `build:all`, and `test:playwright` scripts
- Fixed content type fallback in `wrapFile()` to match core builder behavior (uses `||` instead of `??`)

### Limitations

- **No download operations**: File/folder download methods not implemented in browser build
- **Turbo-only**: Browser uploads require Turbo; no support for direct Arweave transaction submission
- **Wallet signing**: `JWKWalletWeb.sign()` not implemented; use `ArweaveSigner` or `ArconnectSigner` instead
- **Incomplete core parity**: Some Node.js-only features (e.g., `CommunityOracle`, certain pricing estimators) excluded from web bundle

## [3.0.5] - 2025-10-16

### Fixed

- Fixed contentType handling to use logical OR operator instead of nullish coalescing to properly fallback to MIME type detection from file extension

## [3.0.4] - 2025-10-13

### Fixed

- Fixed Unix-Time tag to use seconds instead of milliseconds since epoch

## [3.0.3] - 2025-08-01

### Fixed

- Fixed manifest timestamps to use milliseconds instead of seconds
- Fixed bug where lastModifiedDate was divided by 1000, causing dates to display as Jan 21, 1970

## [3.0.2] - 2025-06-24

### Changed

- Updated dependencies including turbo-sdk and axios
- Migrated to @ardrive/promise-cache instead of third party cache
- Refactored factory functions for backwards compatibility
- Changed Uint8ArrayToStr to BufferToString with Buffer input requirement

### Fixed

- Fixed dependency compatibility issues with axios Buffer handling

## [3.0.1] - 2025-06-20

### Changed

- Updated appVersion to be optional in ArFS entities

## [3.0.0] - 2025-06-16

### Added

- Implemented support for ArFS v0.15 (Drive Privacy Updates)
