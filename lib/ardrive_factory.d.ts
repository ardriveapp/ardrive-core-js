import { Wallet } from './wallet';
import Arweave from 'arweave';
import { ArFSDAO } from './arfs/arfsdao';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import { CommunityOracle } from './community/community_oracle';
import { ArDrive } from './ardrive';
import { ArDriveAnonymous } from './ardrive_anonymous';
import { FeeMultiple } from './types';
import { WalletDAO } from './wallet_dao';
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
export declare function arDriveFactory({ arweave, priceEstimator, communityOracle, wallet, walletDao, dryRun, feeMultiple, arfsDao, appName, appVersion }: ArDriveSettings): ArDrive;
export declare function arDriveAnonymousFactory({ arweave, appName, appVersion }: ArDriveSettingsAnonymous): ArDriveAnonymous;
