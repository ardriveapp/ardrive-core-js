# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
