import { CipherType } from './types/type_guards';

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';

export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.5.1';
export const arFSVersion = '0.11';
export const defaultCipher: CipherType = 'AES256-GCM';

/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
 *
 * Voted on by the ArDrive community (vote #82):
 * https://community.xyz/#-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ/votes/
 */
export const minArDriveCommunityARTip = 0.000_010_000_000;

// ArDrive Profit Sharing Community Smart Contract
export const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';

/** Estimated AR price for most metadata transactions */
export const assumedMetadataTxARPrice = 0.000_002_500_000;

//Note: Just to easily copy paste later where it's needed
//import {prodAppUrl,stagingAppUrl,gatewayURL,appName,webAppName,appVersion,arFSVersion,cipher} from './constants';
