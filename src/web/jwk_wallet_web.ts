/* eslint-disable @typescript-eslint/no-unused-vars */
import type { JWKInterface } from '@dha-team/arbundles';
import { ArweaveAddress } from '../types';

/**
 * Web-compatible JWK wallet wrapper that provides the same interface as the Node.js JWKWallet
 * This ensures compatibility between browser and Node.js implementations
 */
export class JWKWalletWeb {
	constructor(private readonly jwk: JWKInterface) {}

	getPublicKey(): Promise<string> {
		return Promise.resolve(this.jwk.n);
	}

	getPrivateKey(): JWKInterface {
		return this.jwk;
	}

	async getAddress(): Promise<ArweaveAddress> {
		// For browser compatibility, we'll use the Web Crypto API
		const publicKeyBuffer = new TextEncoder().encode(this.jwk.n);
		const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBuffer);
		const hashArray = new Uint8Array(hashBuffer);

		// Convert to base64url
		const base64 = btoa(String.fromCharCode(...hashArray));
		const addressString = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
		return new ArweaveAddress(addressString);
	}

	// Simplified signing for browser - this would need to be implemented with Web Crypto API
	// For now, we'll throw an error to indicate it's not implemented
	async sign(_data: Uint8Array): Promise<Uint8Array> {
		throw new Error(
			'Wallet signing is not yet implemented in the browser build. Use ArweaveSigner from @dha-team/arbundles instead.'
		);
	}
}
