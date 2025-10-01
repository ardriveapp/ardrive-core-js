import { ArDriveAnonymous } from '../ardrive_anonymous';
import { ArFSDAOAnonymous, defaultArFSAnonymousCache } from '../arfs/arfsdao_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
import { ArDriveWeb } from './ardrive_web';
import { JWKWalletWeb } from './jwk_wallet_web';
import type { JWKInterface, ArweaveSigner } from '@dha-team/arbundles';
import { ArconnectSigner } from '@dha-team/arbundles';
import type Arweave from 'arweave';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from '../utils/constants';
import type { ArDriveSigner } from './ardrive_signer';

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

export interface ArDriveSettingsWeb {
	gatewayUrl?: URL;
	/** JWK wallet for browser (provide either wallet or signer) */
	wallet?: JWKInterface;
	/** ArDriveSigner, ArweaveSigner, or ArconnectSigner instance (provide either wallet or signer) */
	signer?: ArDriveSigner | ArweaveSigner | ArconnectSigner;
	appName?: string;
	appVersion?: string;
}

/**
 * Authenticated factory for browser
 * Returns ArDriveWeb with full read/write capabilities via signer
 *
 * @param settings - Configuration object
 * @param settings.wallet - JWK wallet (provide either wallet or signer)
 * @param settings.signer - ArDriveSigner, ArweaveSigner, or ArconnectSigner instance (provide either wallet or signer)
 * @param settings.gatewayUrl - Gateway URL (default: https://arweave.net/)
 * @param settings.appName - Application name
 * @param settings.appVersion - Application version
 *
 * @example Using ArDriveSigner (recommended for browser wallets)
 * ```typescript
 * const signer = new MyArConnectSigner(); // implements ArDriveSigner
 * const arDrive = arDriveFactory({ signer });
 * ```
 *
 * @example Using JWK wallet
 * ```typescript
 * const arDrive = arDriveFactory({ wallet: jwk });
 * ```
 */
export function arDriveFactory(settings: ArDriveSettingsWeb): ArDriveWeb {
	// Validate that either wallet or signer is provided
	if (!settings.wallet && !settings.signer) {
		throw new Error('Either wallet or signer must be provided to arDriveFactory');
	}

	// Return ArDriveWeb instance with authenticated DAO
	return new ArDriveWeb({
		gatewayUrl: settings.gatewayUrl,
		wallet: settings.wallet ? new JWKWalletWeb(settings.wallet) : undefined,
		signer: settings.signer,
		appName: settings.appName,
		appVersion: settings.appVersion
	});
}
