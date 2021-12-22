import { Wallet } from './wallet';
import Arweave from 'arweave';
import { ArDriveCommunityOracle } from './community/ardrive_community_oracle';
import { ArFSDAO } from './arfs/arfsdao';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import { CommunityOracle } from './community/community_oracle';
import { ArFSDAOAnonymous } from './arfs/arfsdao_anonymous';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from './utils/constants';
import { ArDrive } from './ardrive';
import { ArDriveAnonymous } from './ardrive_anonymous';
import { FeeMultiple } from './types';
import { WalletDAO } from './wallet_dao';
import { ArDataPriceFallbackEstimator } from './pricing/ar_data_price_fallback_estimator';

// eslint-disable-next-line @typescript-eslint/no-var-requires

export interface ArDriveSettingsAnonymous {
	arweave?: Arweave;
	appVersion?: string;
	appName?: string;
}
export interface ArDriveSettings extends ArDriveSettingsAnonymous {
	wallet: Wallet;
	walletDao?: WalletDAO;
	priceEstimator?: ARDataPriceEstimator;
	communityOracle?: CommunityOracle;
	feeMultiple?: FeeMultiple;
	dryRun?: boolean;
	arfsDao?: ArFSDAO;
}

const defaultArweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

export function arDriveFactory({
	arweave = defaultArweave,
	priceEstimator = new ArDataPriceFallbackEstimator(),
	communityOracle = new ArDriveCommunityOracle(arweave),
	wallet,
	walletDao,
	dryRun,
	feeMultiple,
	arfsDao,
	appName = DEFAULT_APP_NAME,
	appVersion = DEFAULT_APP_VERSION
}: ArDriveSettings): ArDrive {
	return new ArDrive(
		wallet,
		walletDao ?? new WalletDAO(arweave, appName, appVersion),
		arfsDao ?? new ArFSDAO(wallet, arweave, dryRun, appName, appVersion),
		communityOracle,
		appName,
		appVersion,
		priceEstimator,
		feeMultiple,
		dryRun
	);
}

export function arDriveAnonymousFactory({
	arweave = defaultArweave,
	appName = DEFAULT_APP_NAME,
	appVersion = DEFAULT_APP_VERSION
}: ArDriveSettingsAnonymous): ArDriveAnonymous {
	return new ArDriveAnonymous(new ArFSDAOAnonymous(arweave, appName, appVersion));
}
