/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArweaveAddress, Winston, W, AR, RewardSettings, GQLTagInterface, SeedPhrase } from '../types';
import { Wallet } from '../wallet';
import { IWalletDAO, ARTransferResult } from '../wallet_dao';
import { JWKWallet } from '../jwk_wallet';

/**
 * Browser-compatible WalletDAO that provides minimal functionality for web environments.
 * Methods that require Node.js-specific dependencies will throw errors.
 */
export class WalletDAOWeb implements IWalletDAO {
	// Note: appName and appVersion are accepted for API compatibility but not used in browser
	constructor(_appName: string, _appVersion: string) {
		// No-op: parameters accepted for compatibility with factory signature
	}

	async generateSeedPhrase(): Promise<never> {
		throw new Error(
			'generateSeedPhrase is not available in the browser build. Use a browser wallet extension instead.'
		);
	}

	async generateJWKWallet(_seedPhrase?: SeedPhrase): Promise<JWKWallet> {
		throw new Error(
			'generateJWKWallet is not available in the browser build. Use a browser wallet extension instead.'
		);
	}

	async getWalletWinstonBalance(_wallet: Wallet): Promise<Winston> {
		// In browser, balance checking would need to be done via gateway API
		// For now, return 0 to indicate this needs external implementation
		return Promise.resolve(W(0));
	}

	async getAddressWinstonBalance(_address: ArweaveAddress): Promise<Winston> {
		// In browser, balance checking would need to be done via gateway API
		// For now, return 0 to indicate this needs external implementation
		return Promise.resolve(W(0));
	}

	async walletHasBalance(_wallet: Wallet, _winstonPrice: Winston): Promise<boolean> {
		// In browser, we can't reliably check balance without external API calls
		// Return true to allow operations to proceed (they will fail at submission if insufficient)
		return Promise.resolve(true);
	}

	async sendARToAddress(
		_arAmount: AR,
		_fromWallet: Wallet,
		_toAddress: ArweaveAddress,
		_rewardSettings?: RewardSettings,
		_dryRun?: boolean,
		_tags?: GQLTagInterface[],
		_assertBalance?: boolean
	): Promise<ARTransferResult> {
		throw new Error(
			'sendARToAddress is not available in the browser build. Use bundlers or gateway APIs for transactions.'
		);
	}
}
