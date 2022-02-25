// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: DEFAULT_APP_VERSION } = require('../../package.json');
import { ByteCount, EID, JSON_CONTENT_TYPE, PRIVATE_CONTENT_TYPE, TxID } from '../types';
import { CipherType } from '../types/type_guards';

export const ArFS_O_11 = '0.11';
export const CURRENT_ARFS_VERSION = ArFS_O_11;
export const DEFAULT_APP_NAME = 'ArDrive-Core';
export { DEFAULT_APP_VERSION };

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';

export const graphQLURL = 'https://arweave.net/graphql';

export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';

export const defaultCipher: CipherType = 'AES256-GCM';

export const fakeEntityId = EID('00000000-0000-0000-0000-000000000000');
export const fakeTxID = TxID('0000000000000000000000000000000000000000000');

/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
 *
 * Voted on by the ArDrive community (vote #82):
 * https://community.xyz/#-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ/votes/
 */
export const minArDriveCommunityARTip = 0.000_010_000_000;

/** These limits are being chosen as a precaution due to potential gateway limitations */
export const MAX_BUNDLE_SIZE = new ByteCount(524_288_000); // 500 MiB
export const MAX_DATA_ITEM_LIMIT = 500; // 500 data items

// ArDrive Profit Sharing Community Smart Contract
export const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';

export const publicJsonContentTypeTag = { name: 'Content-Type', value: JSON_CONTENT_TYPE };
export const privateOctetContentTypeTag = { name: 'Content-Type', value: PRIVATE_CONTENT_TYPE };

export const privateCipherTag = { name: 'Cipher', value: defaultCipher };
export const fakePrivateCipherIVTag = { name: 'Cipher-IV', value: 'qwertyuiopasdfgh' }; // Cipher-IV is always 16 characters

export const authTagLength = 16;
