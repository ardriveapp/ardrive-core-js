import { Wallet } from './wallet';
import Arweave from 'arweave';
import { ArDriveCommunityOracle } from './community/ardrive_community_oracle';
import { ArFSDAO } from './arfs/arfsdao';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import { CommunityOracle } from './community/community_oracle';
import { ArFSDAOAnonymous } from './arfs/arfsdao_anonymous';
import {
	defaultGatewayHost,
	defaultGatewayPort,
	defaultGatewayProtocol,
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION
} from './utils/constants';
import { ArDrive } from './ardrive';
import { ArDriveAnonymous } from './ardrive_anonymous';
import { FeeMultiple } from './types';
import { WalletDAO } from './wallet_dao';
import { ArFSUploadPlanner, UploadPlanner } from './arfs/arfs_upload_planner';
import { ArFSTagSettings } from './arfs/arfs_tag_settings';
import { ARDataPriceNetworkEstimator } from './pricing/ar_data_price_network_estimator';
import { GatewayOracle } from './pricing/gateway_oracle';
import { gatewayUrlForArweave } from './utils/common';
import { ArFSCostCalculator, CostCalculator } from './arfs/arfs_cost_calculator';

export interface ArDriveSettingsAnonymous {
	arweave?: Arweave;
	/** @deprecated App Version is an unused parameter on anonymous ArDrive and will be removed in a future release */
	appVersion?: string;
	/** @deprecated App Name is an unused parameter on anonymous ArDrive and will be removed in a future release */
	appName?: string;
}
export interface ArDriveSettings extends ArDriveSettingsAnonymous {
	/** @deprecated App Version will be removed in a future release. Use ArFSTagSettings instead */
	appVersion?: string;
	/** @deprecated App Name will be removed in a future release. Use ArFSTagSettings instead */
	appName?: string;
	wallet: Wallet;
	walletDao?: WalletDAO;
	priceEstimator?: ARDataPriceEstimator;
	communityOracle?: CommunityOracle;
	feeMultiple?: FeeMultiple;
	dryRun?: boolean;
	arfsDao?: ArFSDAO;
	shouldBundle?: boolean;
	uploadPlanner?: UploadPlanner;
	costCalculator?: CostCalculator;
	arFSTagSettings?: ArFSTagSettings;
}

const defaultArweave = Arweave.init({
	host: defaultGatewayHost,
	port: defaultGatewayPort,
	protocol: defaultGatewayProtocol,
	timeout: 600000
});

export function arDriveFactory({
	wallet,
	arweave = defaultArweave,
	priceEstimator = new ARDataPriceNetworkEstimator(new GatewayOracle(gatewayUrlForArweave(arweave))),
	communityOracle = new ArDriveCommunityOracle(arweave),
	dryRun = false,
	feeMultiple = new FeeMultiple(1.0),
	appName = DEFAULT_APP_NAME,
	appVersion = DEFAULT_APP_VERSION,
	walletDao = new WalletDAO(arweave, appName, appVersion),
	shouldBundle = true,
	arFSTagSettings = new ArFSTagSettings({ appName, appVersion }),
	uploadPlanner = new ArFSUploadPlanner({
		shouldBundle,
		arFSTagSettings
	}),
	costCalculator = new ArFSCostCalculator({ priceEstimator, communityOracle, feeMultiple }),
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
		uploadPlanner,
		costCalculator
	);
}

export function arDriveAnonymousFactory({ arweave = defaultArweave }: ArDriveSettingsAnonymous): ArDriveAnonymous {
	return new ArDriveAnonymous(new ArFSDAOAnonymous(arweave));
}
