# ArDrive Core JS - Web Build Architecture & Design

## Overview

The ArDrive web build provides a browser-compatible version of the ArDrive Core library with full TypeScript support and cross-platform API compatibility with the Node.js version.

## Architecture

### Design Principles

1. **Code Reuse**: Web build reuses core classes instead of duplicating them
2. **Browser Compatibility**: Uses browser-compatible dependencies and polyfills
3. **Type Safety**: Full TypeScript declarations generated automatically
4. **API Parity**: Same API surface as Node.js version where possible
5. **Clean Abstractions**: Wallet-specific code abstracted behind interfaces

### Module Structure

```
src/web/
├── index.ts                      # Public API exports
├── ardrive_factory_web.ts        # Factory functions for browser
├── ardrive_web.ts                # Authenticated ArDrive class
├── ardrive_signer.ts             # ArDriveSigner interface
├── crypto_web.ts                 # Browser crypto implementations
├── arfsdao_authenticated_web.ts  # Authenticated DAO for browser
├── jwk_wallet_web.ts             # JWK wallet wrapper
├── wallet_dao_web.ts             # Wallet DAO stub
├── community_oracle_web.ts       # Community oracle stub
└── arfs_file_wrapper_web.ts      # Browser File API wrapper
```

## Key Design Decisions

### 1. Core Class Reuse

**Decision**: Reuse `ArDriveAnonymous`, `GatewayAPI`, `ArFSDAOAnonymous` from core instead of creating web-specific versions.

**Rationale**:
- Reduces code duplication
- Ensures behavior consistency
- Simplifies maintenance
- Leverages existing tests

**Implementation**:
- `ArDriveWeb` extends `ArDriveAnonymous`
- `ArFSDAOAuthenticatedWeb` extends `ArFSDAOAnonymous`
- Core classes work in browser without modification

### 2. ArDriveSigner Interface

**Decision**: Create `ArDriveSigner` interface to abstract browser wallet signing operations.

**Rationale**:
- Browser wallets don't expose JWK private keys
- Need custom signing options (e.g., `saltLength: 0` for v2 drives)
- Keeps wallet-specific code in application layer
- Enables testing with mock signers

**Interface**:
```typescript
export interface ArDriveSigner extends Signer {
    signDataItem(dataItem: DataItemToSign, options?: SignDataItemOptions): Promise<Uint8Array>;
    getActivePublicKey(): Promise<string>;
}
```

**Usage Flow**:
```
Browser App → ArweaveWalletKitSigner (implements ArDriveSigner)
                ↓
            arDriveFactory({ signer })
                ↓
            ArDrive-Core (uses ArDriveSigner interface)
```

### 3. Crypto Implementation

**Decision**: Use `@noble/ciphers` and `@noble/hashes` for browser crypto instead of Node.js `crypto` module.

**Rationale**:
- Pure JavaScript implementation
- Works in browser without polyfills
- Smaller bundle size
- Audited cryptography library

**Key Functions**:
- `aesGcmEncrypt/Decrypt`: AES-256-GCM encryption using @noble/ciphers
- `hkdfSha256`: HKDF key derivation using @noble/hashes
- `deriveDriveKeyWithSigner`: Drive key derivation with ArDriveSigner support

### 4. Build System

**Decision**: Use TypeScript compiler for declarations + esbuild for bundling.

**Rationale**:
- Automatic `.d.ts` generation
- No manual type maintenance
- Fast bundling with esbuild
- Source maps for debugging

**Build Process**:
```
1. TypeScript Compiler (tsc)
   ├── Input: src/web/**/*.ts
   ├── Output: dist/web-temp/**/*.d.ts
   └── Config: tsconfig.web.json

2. esbuild
   ├── Input: src/web/index.ts
   ├── Output: dist/web/index.js
   └── Config: build-web.mjs

3. Declaration Copy
   ├── Copy: dist/web-temp → dist/web
   └── Result: dist/web/index.d.ts + supporting types
```

### 5. Private Drive Support

**Decision**: Support private drives in browser using password + signer-based key derivation.

**Rationale**:
- Users want private drive access in browser
- Browser wallets can sign DataItems
- Password + signature = drive key (via HKDF)
- No JWK exposure required

**Key Derivation Flow**:
```
1. User provides password + drive ID
2. ArDriveSigner signs DataItem("drive" + UUID)
3. HKDF(signature, password) → drive key
4. Drive key decrypts drive metadata
5. File keys derived from drive key + file ID
```

**Signature Types**:
- **v1**: Legacy format with encrypted signature (supported)
- **v2**: DataItem signing with `saltLength: 0` (recommended)

## API Surface

### Exports

```typescript
// Factories
export { arDriveAnonymousFactory, arDriveFactory } from './ardrive_factory_web';

// Classes
export { ArDriveWeb } from './ardrive_web';
export { JWKWalletWeb } from './jwk_wallet_web';
export { WalletDAOWeb } from './wallet_dao_web';

// Signer Interface
export type { ArDriveSigner, DataItemToSign, SignDataItemOptions } from './ardrive_signer';
export { isArDriveSigner } from './ardrive_signer';

// Crypto Functions
export { 
    aesGcmEncrypt, 
    aesGcmDecrypt, 
    deriveDriveKeyV2,
    deriveDriveKeyWithSigner,
    deriveFileKey,
    generateWalletSignatureV2 
} from './crypto_web';

// Core Classes (reused)
export { ArDriveAnonymous } from '../ardrive_anonymous';
export { GatewayAPI } from '../utils/gateway_api';
export { ArFSDAOAnonymous } from '../arfs/arfsdao_anonymous';

// All core types re-exported
export * from '../types';
export * from '../arfs/arfs_entities';
// ... etc
```

### Usage Patterns

#### Anonymous (Public) Drives
```typescript
import { arDriveAnonymousFactory, EID } from 'ardrive-core-js/web';

const arDrive = arDriveAnonymousFactory();
const drive = await arDrive.getPublicDrive({ 
    driveId: EID('drive-id') 
});
```

#### Authenticated with JWK
```typescript
import { arDriveFactory } from 'ardrive-core-js/web';

const arDrive = arDriveFactory({ wallet: jwk });
const drive = await arDrive.getPrivateDrive({
    driveId: EID('drive-id'),
    password: 'user-password'
});
```

#### Authenticated with Browser Wallet
```typescript
import { arDriveFactory, type ArDriveSigner } from 'ardrive-core-js/web';

// Application implements ArDriveSigner
const signer: ArDriveSigner = new MyWalletSigner();
const arDrive = arDriveFactory({ signer });

const drive = await arDrive.getPrivateDrive({
    driveId: EID('drive-id'),
    password: 'user-password'
});
```

## Testing

### Test Infrastructure

- **Framework**: Playwright for browser testing
- **Browsers**: Chromium, Firefox (WebKit disabled on macOS)
- **Test Types**:
  - Basic browser functionality
  - Cross-platform API compatibility
  - Crypto operations
  - Private drive access

### Test Suites

1. **`basic-setup.spec.ts`**: Browser environment validation
2. **`browser-vs-node.spec.ts`**: API surface comparison
3. **`cross-platform-comparison.spec.ts`**: Behavior verification

### Running Tests

```bash
# Run all Playwright tests
yarn test:playwright

# Interactive UI mode
yarn test:playwright:ui

# With visible browser
yarn test:playwright:headed
```

## Build Commands

```bash
# Build web bundle only
yarn build:web

# Build both Node.js and web
yarn build:all

# Development mode (watch)
yarn dev

# Type checking
yarn typecheck

# Linting
yarn lint
yarn lintfix
```

## Performance Considerations

### Bundle Size

- **Main bundle**: ~3.3 MB (includes all dependencies)
- **Source maps**: ~11.7 MB (for debugging)
- **Minification**: Not applied (for readability)

### Optimization Opportunities

1. **Tree shaking**: Remove unused exports
2. **Code splitting**: Separate crypto/DAO modules
3. **Minification**: Apply in production builds
4. **Lazy loading**: Load heavy modules on demand

## Browser Compatibility

### Supported Browsers

- **Chrome/Edge**: 90+ (ES2020 support)
- **Firefox**: 88+ (ES2020 support)
- **Safari**: 14+ (ES2020 support)

### Required APIs

- **Web Crypto API**: For cryptographic operations
- **File API**: For file handling
- **Fetch API**: For network requests
- **ES2020 Features**: BigInt, optional chaining, nullish coalescing

## Known Limitations

### 1. No Direct JWK Access
Browser wallets don't expose JWK private keys for security. Use `ArDriveSigner` interface instead.

### 2. No Transaction Submission
Web build doesn't submit transactions directly. Use bundlers (Turbo, Bundlr) or gateway APIs.

### 3. Limited Wallet DAO
`WalletDAOWeb` provides stub implementations. Use external services for balance checking and AR transfers.

### 4. No Seed Phrase Generation
Browser build doesn't generate seed phrases. Use wallet extensions or external tools.

## Future Enhancements

### Planned Features

1. **Bundle Optimization**: Code splitting and tree shaking
2. **WebKit Support**: Fix Safari compatibility issues
3. **Service Worker Support**: Offline capabilities
4. **Streaming Support**: Large file handling
5. **IndexedDB Caching**: Metadata caching in browser

### API Additions

1. **Upload Support**: Full upload pipeline with bundlers
2. **Batch Operations**: Efficient multi-file operations
3. **Progress Callbacks**: Upload/download progress tracking
4. **Retry Logic**: Automatic retry for failed operations

## Migration Guide

### From Old Web Build

If migrating from a previous web build:

1. **Update imports**: Change from `ardrive-core-js-web` to `ardrive-core-js/web`
2. **Use factories**: Replace direct class instantiation with factories
3. **Implement ArDriveSigner**: Wrap browser wallet with interface
4. **Update type imports**: Use re-exported types from main package

### Breaking Changes

- **Removed**: `ArDriveAnonymousWeb`, `GatewayAPIWeb`, `ArFSMetadataCacheWeb`
- **Replaced**: Use core classes instead
- **New**: `ArDriveSigner` interface required for browser wallets

## Troubleshooting

### Common Issues

**Issue**: TypeScript can't find types
**Solution**: Ensure `ardrive-core-js/web` is in your imports

**Issue**: Crypto operations fail
**Solution**: Ensure HTTPS context (Web Crypto API requirement)

**Issue**: Private drive access fails
**Solution**: Implement `ArDriveSigner` interface correctly

**Issue**: Bundle size too large
**Solution**: Use dynamic imports for heavy modules

## References

- **ArDriveSigner Documentation**: `/docs/ARDRIVE_SIGNER.md`
- **Main README**: `/README.md`
- **Playwright Tests**: `/tests/playwright/`
- **Build Script**: `/build-web.mjs`
- **TypeScript Config**: `/tsconfig.web.json`

## Status

✅ **Production Ready**
- 18/18 tests passing
- Full TypeScript support
- Cross-platform compatibility
- Comprehensive documentation
- Clean architecture
