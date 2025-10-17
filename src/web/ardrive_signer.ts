/**
 * ArDriveSigner interface for browser wallet integration
 *
 * This interface abstracts the signing operations needed by ArDrive-Core
 * from the specific implementation details of browser wallets (Wander, etc.)
 *
 * The browser application should provide an implementation of this interface
 * that wraps the browser wallet's signing capabilities.
 */

import type { Signer } from '@dha-team/arbundles';

/**
 * DataItem structure for signing
 * Matches the format expected by browser wallet signDataItem methods
 */
export interface DataItemToSign {
	/** Raw data to be signed */
	data: Uint8Array;
	/** Owner's public key (base64url encoded) */
	owner: string;
	/** Optional target address */
	target?: string;
	/** Optional anchor for replay protection */
	anchor?: string;
	/** Tags to attach to the DataItem */
	tags?: Array<{ name: string; value: string }>;
}

/**
 * Options for DataItem signing
 */
export interface SignDataItemOptions {
	/**
	 * Salt length for RSA-PSS signature padding
	 * ArDrive uses saltLength: 0 for v2 drive signatures to match Node.js implementation
	 */
	saltLength?: number;
}

/**
 * ArDriveSigner interface
 *
 * Extends the arbundles Signer interface with additional methods needed
 * for ArDrive-specific operations (particularly drive key derivation)
 */
export interface ArDriveSigner extends Signer {
	/**
	 * Sign a DataItem with custom options
	 *
	 * This is required for v2 drive key derivation which needs saltLength: 0
	 * to match the Node.js implementation's signature format.
	 *
	 * @param dataItem - The DataItem structure to sign
	 * @param options - Signing options (e.g., saltLength)
	 * @returns Signed DataItem as Uint8Array (raw binary format)
	 *
	 * @example
	 * ```typescript
	 * const dataItem = {
	 *   data: new Uint8Array([...]),
	 *   owner: await wallet.getActivePublicKey(),
	 *   tags: [{ name: 'Action', value: 'Drive-Signature-V2' }]
	 * };
	 * const signed = await signer.signDataItem(dataItem, { saltLength: 0 });
	 * ```
	 */
	signDataItem(dataItem: DataItemToSign, options?: SignDataItemOptions): Promise<Uint8Array>;

	/**
	 * Get the active public key (owner)
	 *
	 * @returns Base64url encoded public key
	 */
	getActivePublicKey(): Promise<string>;
}

/**
 * Type guard to check if a Signer is an ArDriveSigner
 */
export function isArDriveSigner(signer: Signer): signer is ArDriveSigner {
	return (
		'signDataItem' in signer &&
		typeof (signer as ArDriveSigner).signDataItem === 'function' &&
		'getActivePublicKey' in signer &&
		typeof (signer as ArDriveSigner).getActivePublicKey === 'function'
	);
}
