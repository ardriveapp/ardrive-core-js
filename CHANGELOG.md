# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Bounded per-batch entity-fetch concurrency (CORE-9)**: turning a page of GraphQL
  edges into built entities does a per-entity metadata GET, and every fan-out site did
  so for the whole page at once (`Promise.all`/`Promise.allSettled(edges.map(...))`).
  After CORE-7 raised the page size 100 → 1000 that meant up to ~1000 concurrent
  metadata fetches per host per batch — a ~10x jump in peak parallelism that spikes
  memory and open connections and risks gateway rate-limits. Concurrency is now
  DECOUPLED from page size: a new bounded-concurrency helper (`src/utils/concurrency.ts`,
  `mapWithConcurrency` / `mapSettledWithConcurrency`) processes each batch in
  concurrency-limited waves capped at `MAX_CONCURRENT_ENTITY_FETCHES = 30`
  (`src/utils/constants.ts`). So a 1000-entity page still costs ~10x fewer GraphQL
  round-trips (CORE-7) while at most 30 entity fetches are ever in flight at once
  (~3x below the pre-CORE-7 worst case of 100). Applied at every per-entity-fetch
  fan-out: both incremental-sync DAOs' `processFolder/FileBatch`, the full-listing
  walks (`getAllDrivesForAddress`, `getPublic/PrivateFilesWithParentFolderIds`,
  `getAllFoldersOfPublic/PrivateDrive`, `getEntitiesInFolder`), the snapshot-tail
  builders (`buildPublic/PrivateFolders/FilesFromNodes` — snapshot nodes build from
  the seeded metadata cache with no fetch, only the live tail fetches), and the web
  authenticated DAO's private folder/file listings. The change is internal and
  additive: the helpers preserve input order, run each item exactly once, and keep the
  exact `Promise.all` (reject-on-any) vs `Promise.allSettled` + `failedEntities`
  semantics of the site they replace, so the entity SET returned is identical — only
  parallelism is bounded. Pagination, the CORE-7 `hasNextPage` safety and the #43
  per-type early-stop are unchanged. The inline CORE-8 "keep the file/folder incremental
  queries separate" note was also softened to clarify that only a NAIVE shared-counter
  merge would drop entities (a per-type-counter merge could be safe); the queries stay
  split because merging is a ~zero-latency win now that the two walks already run in
  parallel via `Promise.all`.
  - _Follow-up (CORE-10, not in this change):_ a failed per-entity metadata fetch in the
    incremental DAOs is still counted (`failedEntities`) and logged but not retried — a
    transient fetch failure can silently drop that entity from the batch. That is a
    pre-existing data-integrity concern, tracked separately as CORE-10; this change only
    bounds concurrency and does not add retry logic.

- **GraphQL page size 100 → 1000, now tunable (CORE-7)**: every paged
  `transactions(first: …)` GraphQL walk now requests the gateway maximum of 1000
  entities per page instead of 100. `GQL_PAGE_SIZE = 1000` (the documented ar.io
  default/max) stays in `src/utils/constants.ts`, but the per-page default is now a
  **process-global, tunable value** read through a new `getGqlPageSize()` /
  `setGqlPageSize(pageSize)` accessor pair (both exported from the package). This lets a
  consumer (e.g. the ArDrive desktop app) lower the default for a GraphQL gateway that
  caps `first:` **below** the 1000 ar.io max — Goldsky, for instance — with a single
  `setGqlPageSize(100)` call; `setGqlPageSize` validates its argument is an integer in
  `[1, 1000]` and throws `RangeError` otherwise. The default is read at CALL time by the
  query builders, so a `setGqlPageSize()` made after import takes effect on subsequent
  queries. It drives `buildQuery`'s default `first:` (used by all listing/drive/folder
  walks), the `batchSize` default in both incremental-sync DAOs
  (`arfsdao_incremental_sync`, `arfsdao_anonymous_incremental_sync`), and the
  snapshot-listing query (`buildSnapshotQuery`). Fetching a drive of N entities now
  costs `ceil(N/pageSize)` page requests (`ceil(N/1000)` at the default) rather than
  `ceil(N/100)` — roughly a 10x reduction in GraphQL round-trips at the default — with
  no change to the set of entities returned. Pagination remains strictly cursor +
  `pageInfo.hasNextPage` driven, so it stays correct even against a gateway that silently
  returns fewer than `first` entities for a page (or one capped below 1000): it keeps
  following the cursor until `hasNextPage` is false and never drops an entity. Explicit
  per-call overrides (`first`, `batchSize`) still win over the configured default (public
  API unchanged; a smaller value only changes round-trip count). The separate file/folder
  incremental queries were intentionally left un-consolidated to preserve their per-type
  early-stop correctness (see CORE-8 note in the DAOs).

## [4.1.0] - 2026-07-05

Additive minor over 4.0.1 (hide/unhide). Converges four independently-verified
listing-path improvements into one release; all re-verified together on the
combined build.

### Added

- **Snapshot-accelerated drive listing (CORE-3)**: `listPublicFolder` /
  `listPrivateFolder` consume on-chain ArFS snapshot transactions to reconstruct
  a drive's history, fetching only the live "tail" of blocks not covered by a
  snapshot instead of replaying the entire transaction history. Falls back
  transparently to full-history replay when a drive has no snapshots or any
  snapshot read fails. New `src/snapshots/` module (height-range algebra,
  snapshot query/model/parser, drive-history composite). Turns drives that
  previously timed out (e.g. 753-entity drive, 146 s+ / never completes) into
  ~2 s listings with far fewer GraphQL requests, and restores real on-chain
  entities that a mutable gateway index had dropped (a data-integrity fix, not
  just performance — see D-027 superset-with-verified-drops).
- **Incremental drive listing + reorg look-back (CORE-2)**: opt-in incremental
  sync DAOs (`arfsdao_incremental_sync`, `arfsdao_anonymous_incremental_sync`)
  and persistent sync-state adapters (`sync_state`, `sync_state_store*`) that
  resume a drive listing from the last synced block, re-scanning a 240-block
  look-back window to absorb chain reorgs and rebuilding the latest revision of
  each entity rather than reusing a stale cached one. An unchanged re-sync issues
  a small fraction of the metadata reads of a full listing.

### Fixed

- **Tolerate invalid entity unixTime (CORE-5)**: a single entity carrying a
  malformed `Unix-Time` tag (negative / non-integer / non-numeric) no longer
  aborts the entire drive listing with "Unix time must be a positive integer!".
  The value is clamped to the Unix epoch (skip-not-abort) so the drive still
  lists; the `UnixTime` invariant stays strict everywhere else.
- **Private-listing robustness (CORE-6)**: file builders throw a descriptive
  `InvalidFileStateException` (naming the missing required properties) instead of
  a plain `Error('Invalid file state')`, and the private file-listing path now
  skips `SyntaxError` (undecryptable/unparseable metadata) — mirroring the public
  path — so one incomplete or undecryptable private entity no longer aborts the
  whole private-drive reconstruction.
## [4.0.1] - 2026-07-05

Additive, backward-compatible release off `master` (all changes land after the
`v4.0.0` tag). No breaking changes; peer ranges (node/arweave/turbo) unchanged.

### Added

- **File & folder hide / unhide support** (#270, [CORE-4]): new `ArDrive` methods
  `hidePublicFile` / `unhidePublicFile`, `hidePublicFolder` / `unhidePublicFolder`,
  `hidePrivateFile` / `unhidePrivateFile`, `hidePrivateFolder` / `unhidePrivateFolder`,
  and `hidePublicDrive`. Entities are hidden via an ArFS metadata revision (`Hidden`
  state) rather than deletion, so the operation is reversible and preserves history.
  Adds the corresponding `Hide*Params` types to the public API.
- **`prepare` build hook** (#270): building `lib/` now runs automatically on install,
  so consumers can depend on a git commit ref (e.g. GitHub install) and still receive
  compiled output without a manual build step.

### Fixed

- **Clear error on empty drive GQL result** (#271): drive-metadata GraphQL queries that
  return zero edges now throw a descriptive error (via the extracted
  `assertDriveEdgesFound` helper) instead of failing later with an opaque
  undefined-access error. Improves diagnosability of transient gateway/404 responses.

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
