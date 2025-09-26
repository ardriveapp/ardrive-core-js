import { ArDriveAnonymous } from '../ardrive_anonymous';
import { ArFSDAOAnonymous, defaultArFSAnonymousCache } from '../arfs/arfsdao_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
import { ArDriveWeb } from './ardrive_web';
import { JWKWalletWeb } from './jwk_wallet_web';
import type { JWKInterface } from '@dha-team/arbundles';
import type Arweave from 'arweave';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from '../utils/constants';

export interface ArDriveSettingsAnonymousWeb {
	gatewayUrl?: URL;
}

// Matches Node naming while targeting browser - now uses core classes!
export function arDriveAnonymousFactory({
	gatewayUrl = new URL('https://arweave.net/')
}: ArDriveSettingsAnonymousWeb = {}) {
	// Create GatewayAPI for web
	const gatewayApi = new GatewayAPI({ gatewayUrl });

	// Create ArFSDAOAnonymous with minimal dependencies
	// We pass null for arweave since web doesn't use Node.js-specific methods
	const dao = new ArFSDAOAnonymous(
		null as unknown as Arweave, // arweave - not used by web methods
		DEFAULT_APP_NAME,
		DEFAULT_APP_VERSION,
		defaultArFSAnonymousCache,
		gatewayApi
	);

	// Return core ArDriveAnonymous (works in browser!)
	return new ArDriveAnonymous(dao);
}

// Wallet-backed factory for browser. Creates a wallet wrapper for Node.js compatibility.
export function arDriveFactory(settings: { gatewayUrl?: URL; wallet: JWKInterface }) {
	// Wrap the raw JWK in a wallet object that provides getPrivateKey() method for Node.js compatibility
	const walletWrapper = new JWKWalletWeb(settings.wallet);
	return new ArDriveWeb({ gatewayUrl: settings.gatewayUrl, wallet: walletWrapper });
}
