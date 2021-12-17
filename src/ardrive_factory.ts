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
import { ARDataPriceChunkEstimator } from './pricing/ar_data_price_chunk_estimator';
import { ArFSCostEstimator } from './pricing/arfs_cost_estimator';
import { ArFSTagSettings } from './arfs/arfs_tag_settings';

export interface ArDriveSettingsAnonymous {
	arweave?: Arweave;
	appVersion?: string;
	appName?: string;
	arFSTagSettings?: ArFSTagSettings;
}
export interface ArDriveSettings extends ArDriveSettingsAnonymous {
	wallet: Wallet;
	walletDao?: WalletDAO;
	priceEstimator?: ARDataPriceEstimator;
	communityOracle?: CommunityOracle;
	feeMultiple?: FeeMultiple;
	dryRun?: boolean;
	arfsDao?: ArFSDAO;
	shouldBundle?: boolean;
	costEstimator?: ArFSCostEstimator;
}

const defaultArweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

export function arDriveFactory({
	wallet,
	arweave = defaultArweave,
	priceEstimator = new ARDataPriceChunkEstimator(true),
	communityOracle = new ArDriveCommunityOracle(arweave),
	dryRun = false,
	feeMultiple = new FeeMultiple(1.0),
	appName = DEFAULT_APP_NAME,
	appVersion = DEFAULT_APP_VERSION,
	walletDao = new WalletDAO(arweave, appName, appVersion),
	shouldBundle = true,
	arFSTagSettings = new ArFSTagSettings({ appName, appVersion }),
	costEstimator = new ArFSCostEstimator({
		shouldBundle,
		feeMultiple,
		priceEstimator,
		arFSTagSettings,
		communityOracle
	}),
	arfsDao = new ArFSDAO(wallet, arweave, dryRun, appName, appVersion, arFSTagSettings)
}: ArDriveSettings): ArDrive {
	return new ArDrive(
		wallet,
		walletDao,
		arfsDao,
		communityOracle,
		appName,
		appVersion,
		priceEstimator,
		feeMultiple,
		dryRun,
		arFSTagSettings,
		costEstimator
	);
}

export function arDriveAnonymousFactory({
	arweave = defaultArweave,
	appName = DEFAULT_APP_NAME,
	appVersion = DEFAULT_APP_VERSION,
	arFSTagSettings = new ArFSTagSettings({ appName, appVersion })
}: ArDriveSettingsAnonymous): ArDriveAnonymous {
	return new ArDriveAnonymous(new ArFSDAOAnonymous(arweave, appName, appVersion, arFSTagSettings));
}
