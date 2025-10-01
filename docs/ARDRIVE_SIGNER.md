# ArDriveSigner Interface

## Overview

The `ArDriveSigner` interface abstracts the signing operations needed by ArDrive-Core from the specific implementation details of browser wallets (ArConnect, ArweaveWalletKit, etc.). This allows the library to define a clean interface while browser applications provide their own implementations.

## Why ArDriveSigner?

During development, we discovered that the standard `Signer` interface from `@dha-team/arbundles` is not sufficient for ArDrive's needs, particularly for:

1. **Private Drive Key Derivation (v2)**: Requires `signDataItem()` with `saltLength: 0` to match the Node.js implementation's signature format
2. **Browser Wallet Integration**: Need to access wallet-specific methods like `getActivePublicKey()` and custom signing options
3. **Abstraction**: Keeps ArweaveWalletKit implementation details out of the core library

## Interface Definition

```typescript
export interface ArDriveSigner extends Signer {
    /**
     * Sign a DataItem with custom options
     * Required for v2 drive key derivation which needs saltLength: 0
     */
    signDataItem(dataItem: DataItemToSign, options?: SignDataItemOptions): Promise<Uint8Array>;

    /**
     * Get the active public key (owner)
     */
    getActivePublicKey(): Promise<string>;
}
```

## Implementation Example

Here's how to implement `ArDriveSigner` in a browser application using ArweaveWalletKit:

```typescript
import { ArDriveSigner, DataItemToSign, SignDataItemOptions } from '@ardrive/ardrive-core-js/web';
import type { Signer } from '@dha-team/arbundles';

export class ArweaveWalletKitSigner implements ArDriveSigner {
    constructor(private walletKit: any) {}

    // Implement ArDriveSigner.signDataItem()
    async signDataItem(
        dataItem: DataItemToSign,
        options?: SignDataItemOptions
    ): Promise<Uint8Array> {
        // Use the browser wallet's signDataItem method
        const signedDataItem = await window.arweaveWallet.signDataItem(
            dataItem,
            options
        );
        return new Uint8Array(signedDataItem);
    }

    // Implement ArDriveSigner.getActivePublicKey()
    async getActivePublicKey(): Promise<string> {
        return await window.arweaveWallet.getActivePublicKey();
    }

    // Implement Signer.publicKey (required by base Signer interface)
    get publicKey(): Buffer {
        // This should be set during initialization
        // You may need to fetch it from the wallet
        throw new Error('publicKey must be set during initialization');
    }

    // Implement Signer.sign() (required by base Signer interface)
    async sign(message: Uint8Array): Promise<Uint8Array> {
        // Use the wallet's signature method
        const signature = await window.arweaveWallet.signature(
            message,
            { hashAlgorithm: 'SHA-256' }
        );
        return new Uint8Array(signature);
    }

    // Implement Signer.signatureType (required by base Signer interface)
    get signatureType(): number {
        return 1; // Arweave signature type
    }

    // Implement Signer.ownerLength (required by base Signer interface)
    get ownerLength(): number {
        return 512; // Arweave public key length
    }

    // Implement Signer.signatureLength (required by base Signer interface)
    get signatureLength(): number {
        return 512; // Arweave signature length
    }
}
```

## Usage in Browser Application

### 1. Create ArDriveSigner Implementation

```typescript
import { ArweaveWalletKitSigner } from './lib/walletKitSigner';

// Initialize your wallet
const wallet = await initializeWallet();

// Create signer
const signer = new ArweaveWalletKitSigner(wallet);
```

### 2. Use with ArDrive Factory

```typescript
import { arDriveFactory } from '@ardrive/ardrive-core-js/web';

// Create ArDrive instance with your signer
const arDrive = arDriveFactory({ signer });

// Now you can use private drive features
const privateDrive = await arDrive.getPrivateDrive({
    driveId: 'your-drive-id',
    password: 'your-password'
});
```

## Key Benefits

1. **Abstraction**: ArweaveWalletKit details stay in your application code, not in the library
2. **Flexibility**: Easy to support different wallet implementations (ArConnect, ArweaveWalletKit, etc.)
3. **Type Safety**: Clear interface contract with TypeScript support
4. **Compatibility**: Works with both v1 and v2 private drives
5. **Testing**: Easy to mock for unit tests

## DataItem Signing

The `signDataItem()` method is crucial for v2 drive key derivation. It must:

1. Accept a `DataItemToSign` structure with data, owner, tags, etc.
2. Support custom signing options (particularly `saltLength: 0`)
3. Return the signed DataItem as a `Uint8Array`

Example DataItem structure:

```typescript
const dataItem = {
    data: new Uint8Array([...]),
    owner: await signer.getActivePublicKey(),
    tags: [{ name: 'Action', value: 'Drive-Signature-V2' }]
};

const signed = await signer.signDataItem(dataItem, { saltLength: 0 });
```

## Fallback Behavior

If you provide a standard `Signer` (like `ArweaveSigner` from JWK), the library will:

1. Use `createData()` and `dataItem.sign()` for v2 signatures (standard arbundles flow)
2. This works for JWK-based signing but won't work for browser wallets that don't expose the private key

For browser wallets, you **must** provide an `ArDriveSigner` implementation to support private drives.

## Type Guard

Use the `isArDriveSigner()` type guard to check if a signer implements the full interface:

```typescript
import { isArDriveSigner } from '@ardrive/ardrive-core-js/web';

if (isArDriveSigner(signer)) {
    // Can use signDataItem() and getActivePublicKey()
    const publicKey = await signer.getActivePublicKey();
} else {
    // Standard Signer only - limited functionality
}
```

## Related Files

- `/src/web/ardrive_signer.ts` - Interface definition
- `/src/web/crypto_web.ts` - Uses ArDriveSigner for drive key derivation
- `/src/web/ardrive_factory_web.ts` - Accepts ArDriveSigner in factory
- `/src/web/ardrive_web.ts` - ArDriveWeb class uses ArDriveSigner
- `/src/web/arfsdao_authenticated_web.ts` - DAO uses ArDriveSigner

## Migration Guide

If you were previously using direct `window.arweaveWallet` calls:

**Before:**
```typescript
// Library code directly accessing window.arweaveWallet
const signed = await window.arweaveWallet.signDataItem(dataItem, { saltLength: 0 });
```

**After:**
```typescript
// Application provides ArDriveSigner implementation
class MyWalletSigner implements ArDriveSigner {
    async signDataItem(dataItem, options) {
        return await window.arweaveWallet.signDataItem(dataItem, options);
    }
    // ... other methods
}

// Pass to library
const arDrive = arDriveFactory({ signer: new MyWalletSigner() });
```

This keeps wallet-specific code in your application where it belongs!
