import { DataItem } from 'arbundles';
import { Readable } from 'node:stream';

import {
	TurboUnauthenticatedClient,
	TurboAuthenticatedClient,
	TurboUploadDataItemResponse,
	TurboFactory,
	EthereumSigner,
	ArweaveSigner,
	TurboSigner
} from '@ardrive/turbo-sdk';
import { defaultTurboPaymentUrl, defaultTurboUploadUrl } from '../utils/constants';
import { Wallet } from '../wallet';
import { JWKInterface } from 'arweave/node/lib/wallet';

export interface TurboSettings {
	turboUploadUrl: URL;
	turboPaymentUrl: URL;
	/**
	 * Optional Ethereum private key for authenticated Turbo operations.
	 * SECURITY: This key is passed directly to the Turbo SDK and is never stored.
	 * Ensure you handle private keys securely in your application.
	 */
	ethereumPrivateKey?: string;
	/** Optional custom signer for authenticated Turbo operations */
	signer?: TurboSigner;
	/** Use authenticated client when signer or ethereum private key is provided */
	useAuthenticated?: boolean;
}

export interface TurboCachesResponse {
	dataCaches?: string[];
	fastFinalityIndexes?: string[];
}

// Note: this class is a wrapper of the TurboSDk - it's helpful for things like dry run and other tests, but could be removed in the future
export class Turbo {
	private isDryRun: boolean;
	private turbo: TurboUnauthenticatedClient | TurboAuthenticatedClient;
	private isAuthenticated: boolean;

	constructor({
		turboUploadUrl = defaultTurboUploadUrl,
		turboPaymentUrl = defaultTurboPaymentUrl,
		isDryRun = false,
		ethereumPrivateKey,
		signer,
		useAuthenticated = false
	}: Partial<TurboSettings> & { isDryRun?: boolean }) {
		this.isDryRun = isDryRun;
		this.isAuthenticated = useAuthenticated || !!ethereumPrivateKey || !!signer;

		// Validate Ethereum private key format if provided
		if (ethereumPrivateKey && !this.isValidEthereumPrivateKey(ethereumPrivateKey)) {
			throw new Error('Invalid Ethereum private key format. Expected hex string starting with 0x');
		}

		if (this.isAuthenticated) {
			// Create authenticated client
			const config: {
				uploadServiceConfig: { url: string };
				paymentServiceConfig: { url: string };
				privateKey?: string;
				signer?: TurboSigner;
				token?: 'ethereum' | 'arweave' | 'ario' | 'solana' | 'kyve' | 'matic' | 'pol' | 'base-eth';
			} = {
				uploadServiceConfig: {
					url: turboUploadUrl.origin
				},
				paymentServiceConfig: {
					url: turboPaymentUrl.origin
				}
			};

			if (signer) {
				config.signer = signer;
			} else if (ethereumPrivateKey) {
				config.privateKey = ethereumPrivateKey;
				config.token = 'ethereum'; // Specify ethereum token type for private key
			}

			try {
				this.turbo = TurboFactory.authenticated(config);
			} catch (error) {
				throw new Error(
					`Failed to create authenticated Turbo client: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		} else {
			// Create unauthenticated client
			try {
				this.turbo = TurboFactory.unauthenticated({
					uploadServiceConfig: {
						url: turboUploadUrl.origin
					},
					paymentServiceConfig: {
						url: turboPaymentUrl.origin
					}
				});
			} catch (error) {
				throw new Error(
					`Failed to create unauthenticated Turbo client: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	}

	async sendDataItem(dataItem: DataItem): Promise<TurboUploadDataItemResponse> {
		const defaultResponse: TurboUploadDataItemResponse = {
			id: dataItem.id,
			owner: dataItem.owner,
			dataCaches: [],
			fastFinalityIndexes: [],
			winc: '0' // Required field for TurboUploadDataItemResponse
		};
		if (this.isDryRun) {
			return defaultResponse;
		}

		// Store raw data to avoid calling getRaw() multiple times
		const rawData = dataItem.getRaw();

		// Convert the data item Buffer to a Readable stream
		return this.turbo.uploadSignedDataItem({
			dataItemStreamFactory: () => Readable.from(rawData),
			dataItemSizeFactory: () => rawData.length
		});
	}

	/**
	 * Validates if a string is a properly formatted Ethereum private key
	 * @param key - The key to validate
	 * @returns true if valid Ethereum private key format
	 */
	private isValidEthereumPrivateKey(key: string): boolean {
		// Ethereum private keys are 64 hex characters (32 bytes) with optional 0x prefix
		const regex = /^(0x)?[0-9a-fA-F]{64}$/;
		return regex.test(key);
	}

	/**
	 * Create an Ethereum signer from a private key
	 * @param privateKey - Ethereum private key (with or without 0x prefix)
	 * @returns EthereumSigner instance
	 * @throws Error if private key format is invalid
	 */
	static createEthereumSigner(privateKey: string): EthereumSigner {
		// Validate private key format
		const regex = /^(0x)?[0-9a-fA-F]{64}$/;
		if (!regex.test(privateKey)) {
			throw new Error('Invalid Ethereum private key format. Expected 64 hex characters with optional 0x prefix');
		}
		return new EthereumSigner(privateKey);
	}

	/**
	 * Create an Arweave signer from a JWK wallet
	 * @param wallet - Wallet instance (must be JWKWallet to access private key)
	 * @returns ArweaveSigner instance
	 * @throws Error if wallet doesn't have getPrivateKey method
	 */
	static createArweaveSigner(wallet: Wallet): ArweaveSigner {
		// Type guard to check if wallet has getPrivateKey method
		if (!('getPrivateKey' in wallet)) {
			throw new Error('Wallet must be a JWKWallet instance with getPrivateKey method');
		}
		// Type assertion is now safer after the check
		const jwkWallet = wallet as unknown as { getPrivateKey(): JWKInterface };
		return new ArweaveSigner(jwkWallet.getPrivateKey());
	}

	/**
	 * Check if the Turbo instance is using authenticated mode
	 * @returns true if using authenticated client, false otherwise
	 */
	getIsAuthenticated(): boolean {
		return this.isAuthenticated;
	}

	/**
	 * Get the underlying Turbo client instance
	 * @returns The Turbo client (authenticated or unauthenticated)
	 */
	getClient(): TurboUnauthenticatedClient | TurboAuthenticatedClient {
		return this.turbo;
	}
}
