import { ArDriveAnonymousWeb } from './ardrive_anonymous_web';
import { ArDriveWeb } from './ardrive_web';
import { JWKWalletWeb } from './jwk_wallet_web';
import type { JWKInterface } from '@dha-team/arbundles';

export interface ArDriveSettingsAnonymousWeb {
	gatewayUrl?: URL;
}

// Matches Node naming while targeting browser.
export function arDriveAnonymousFactory({
	gatewayUrl = new URL('https://arweave.net/')
}: ArDriveSettingsAnonymousWeb = {}) {
	return ArDriveAnonymousWeb.fromGatewayUrl(gatewayUrl);
}

// Wallet-backed factory for browser. Creates a wallet wrapper for Node.js compatibility.
export function arDriveFactory(settings: { gatewayUrl?: URL; wallet: JWKInterface }) {
	// Wrap the raw JWK in a wallet object that provides getPrivateKey() method for Node.js compatibility
	const walletWrapper = new JWKWalletWeb(settings.wallet);
	return new ArDriveWeb({ gatewayUrl: settings.gatewayUrl, wallet: walletWrapper });
}
