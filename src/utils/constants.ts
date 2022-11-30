// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: DEFAULT_APP_VERSION } = require('../../package.json');
import { ByteCount, EID, JSON_CONTENT_TYPE, PRIVATE_CONTENT_TYPE, TxID } from '../types';
import { CipherType } from '../types/type_guards';

export const ENCRYPTED_DATA_PLACEHOLDER = 'ENCRYPTED';
export type ENCRYPTED_DATA_PLACEHOLDER_TYPE = 'ENCRYPTED';

export const ArFS_O_11 = '0.11';
export const CURRENT_ARFS_VERSION = ArFS_O_11;
export const DEFAULT_APP_NAME = 'ArDrive-Core';
export { DEFAULT_APP_VERSION };

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';

export const turboProdBundlerUrl = new URL('https://upload.ardrive.io/');
export const freeArfsDataAllowLimit = new ByteCount(102_400); // 100 KiB

export const defaultGatewayHost = 'arweave.net';
export const defaultGatewayProtocol = 'https';
export const defaultGatewayPort = 443;
export const defaultArweaveGatewayPath = `${defaultGatewayProtocol}://${defaultGatewayHost}/`;
export const gatewayGqlEndpoint = 'graphql';

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

// ArDrive Profit Sharing Community Smart Contract // cspell:disable
export const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ'; // cspell:enable

export const publicJsonContentTypeTag = { name: 'Content-Type', value: JSON_CONTENT_TYPE };
export const privateOctetContentTypeTag = { name: 'Content-Type', value: PRIVATE_CONTENT_TYPE };

export const privateCipherTag = { name: 'Cipher', value: defaultCipher }; // cspell:disable
export const fakePrivateCipherIVTag = { name: 'Cipher-IV', value: 'qwertyuiopasdfgh' }; // Cipher-IV is always 16 characters // cspell:enable

export const authTagLength = 16;
export const defaultMaxConcurrentChunks = 32;

/**
 * Error delay for the first failed request for a transaction header post or chunk upload
 * Subsequent requests will delay longer with an exponential back off strategy
 */
export const INITIAL_ERROR_DELAY = 500; // 500ms

/**
 *  These are errors from the `/chunk` endpoint on an Arweave
 *  node that we should never try to continue on
 */
export const FATAL_CHUNK_UPLOAD_ERRORS = [
	'invalid_json',
	'chunk_too_big',
	'data_path_too_big',
	'offset_too_big',
	'data_size_too_big',
	'chunk_proof_ratio_not_attractive',
	'invalid_proof'
];

export const gqlTagNameRecord = {
	appName: 'App-Name',
	appVersion: 'App-Version',
	arFS: 'ArFS',
	tipType: 'Tip-Type',
	contentType: 'Content-Type',
	boost: 'Boost',
	bundleFormat: 'Bundle-Format',
	bundleVersion: 'Bundle-Version',
	entityType: 'Entity-Type',
	unitTime: 'Unix-Time',
	driveId: 'Drive-Id',
	folderId: 'Folder-Id',
	fileId: 'File-Id',
	parentFolderId: 'Parent-Folder-Id',
	drivePrivacy: 'Drive-Privacy',
	cipher: 'Cipher',
	cipherIv: 'Cipher-IV',
	driveAuthMode: 'Drive-Auth-Mode'
} as const;

export const gqlTagNameArray = Object.values(gqlTagNameRecord);
export type GqlTagName = typeof gqlTagNameArray[number];
