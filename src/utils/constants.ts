// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: DEFAULT_APP_VERSION } = require('../../package.json');
import { ByteCount, EID, JSON_CONTENT_TYPE, PRIVATE_CONTENT_TYPE, TxID } from '../types';
import { CipherType } from '../types/type_guards';

export const ENCRYPTED_DATA_PLACEHOLDER = 'ENCRYPTED';
export type ENCRYPTED_DATA_PLACEHOLDER_TYPE = 'ENCRYPTED';

export const ArFS_O_15 = '0.15';
export const CURRENT_ARFS_VERSION = ArFS_O_15;
export const DEFAULT_APP_NAME = 'ArDrive-Core';
export { DEFAULT_APP_VERSION };

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';

/** @deprecated use defaultTurboProdUploadUrl */
export const turboProdUrl = new URL('https://upload.ardrive.io/');

export const defaultTurboUploadUrl = new URL('https://upload.ardrive.io/');
export const defaultTurboPaymentUrl = new URL('https://payment.ardrive.io/');

export const defaultGatewayHost = 'ardrive.net';
export const defaultGatewayProtocol = 'https';
export const defaultGatewayPort = 443;
export const defaultArweaveGatewayPath = `${defaultGatewayProtocol}://${defaultGatewayHost}/`;
export const gatewayGqlEndpoint = 'graphql';

/**
 * Default number of transactions requested per GraphQL `transactions(first: …)` page.
 *
 * Arweave gateways cap `first` at 1000 and silently clamp anything larger (a request
 * for 1001 returns 1000, with no error), so 1000 is the largest useful page size. All
 * paged GraphQL walks in this library are cursor + `pageInfo.hasNextPage` driven, so
 * this is purely a request-count optimization: a larger page fetches the same entities
 * in ~10x fewer round-trips versus the previous default of 100, and pagination stays
 * correct even if a gateway returns fewer than `first` entities for a page (it keeps
 * following the cursor until `hasNextPage` is false — no entity is ever dropped).
 */
export const GQL_PAGE_SIZE = 1000;

/**
 * Maximum number of per-entity metadata/data fetches allowed in flight at once when
 * turning a page of GraphQL edges into built entities (folders/files/drives).
 *
 * This is deliberately DECOUPLED from {@link GQL_PAGE_SIZE}: a page can now carry up to
 * 1000 edges (CORE-7), but building an entity from an edge does a per-entity network GET
 * of its metadata tx. Firing all 1000 at once would put ~1000 concurrent requests on a
 * single gateway host — spiking memory and open connections and inviting rate-limits.
 * Instead every batch is processed in concurrency-limited waves so the request COUNT
 * still drops ~10x (fewer pages) while the peak PARALLELISM stays bounded here.
 *
 * 30 sits in the middle of the recommended 20–50 band: high enough that latency stays
 * dominated by network round-trip time rather than serialization, yet ~3x BELOW the old
 * page size of 100 (the pre-CORE-7 worst-case per-batch parallelism), so the larger page
 * size cannot increase peak concurrent fetches. It is an internal tuning constant; the
 * entity SET returned is identical regardless of its value — only parallelism changes.
 */
export const MAX_CONCURRENT_ENTITY_FETCHES = 30;

export const defaultCipher: CipherType = 'AES256-GCM';

export const fakeEntityId = EID('00000000-0000-0000-0000-000000000000');
export const fakeTxID = TxID('0000000000000000000000000000000000000000000');

/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://ardrive.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
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
	driveAuthMode: 'Drive-Auth-Mode',
	signatureType: 'Signature-Type'
} as const;

export const gqlTagNameArray = Object.values(gqlTagNameRecord);
export type GqlTagName = (typeof gqlTagNameArray)[number];
