declare const DEFAULT_APP_VERSION: any;
import { CipherType } from '../types/type_guards';
export declare const ArFS_O_11 = "0.11";
export declare const CURRENT_ARFS_VERSION = "0.11";
export declare const DEFAULT_APP_NAME = "ArDrive-Core";
export { DEFAULT_APP_VERSION };
export declare const prodAppUrl = "https://app.ardrive.io";
export declare const stagingAppUrl = "https://staging.ardrive.io";
export declare const gatewayURL = "https://arweave.net/";
export declare const graphQLURL = "https://arweave.net/graphql";
export declare const appName = "ArDrive-Desktop";
export declare const webAppName = "ArDrive-Web";
export declare const defaultCipher: CipherType;
export declare const fakeEntityId: import("../types").EntityID;
/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
 *
 * Voted on by the ArDrive community (vote #82):
 * https://community.xyz/#-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ/votes/
 */
export declare const minArDriveCommunityARTip = 0.00001;
export declare const communityTxId = "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ";
/** Estimated AR price for most metadata transactions */
export declare const assumedMetadataTxARPrice = 0.0000025;
