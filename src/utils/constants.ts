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
 * Process-global override for the default GraphQL page size, initialised to
 * {@link GQL_PAGE_SIZE}. Kept module-private; read via {@link getGqlPageSize} and
 * only mutated through {@link setGqlPageSize} so the [1, 1000] validation is always
 * enforced.
 */
let configuredGqlPageSize: number = GQL_PAGE_SIZE;

/**
 * The currently-configured default GraphQL page size used by every paged GraphQL
 * walk in this library (`transactions(first: …)`, incremental-sync `batchSize`,
 * snapshot listing). Returns {@link GQL_PAGE_SIZE} (1000, the ar.io gateway max)
 * unless a consumer has lowered it via {@link setGqlPageSize}.
 *
 * Read at CALL time by the query builders, so a later {@link setGqlPageSize} takes
 * effect for subsequent queries.
 */
export function getGqlPageSize(): number {
	return configuredGqlPageSize;
}

/**
 * Override the process-global default GraphQL page size.
 *
 * Intended for consumers (e.g. the ArDrive desktop app) whose configured GraphQL
 * gateway caps `first:` BELOW the 1000 ar.io maximum — Goldsky, for instance,
 * accepts fewer entities per page. Lowering the default keeps a single request
 * within such a gateway's per-page limit; pagination stays cursor + `hasNextPage`
 * driven, so no entity is ever dropped regardless of the value. Explicit per-call
 * overrides (`first`, `batchSize`) still win over this default.
 *
 * @param pageSize integer in `[1, {@link GQL_PAGE_SIZE}]` (1..1000). A gateway
 *   cannot page more than the 1000 ar.io max meaningfully, so larger values —
 *   and non-positive or non-integer values — are rejected.
 * @throws {RangeError} if `pageSize` is not an integer within `[1, 1000]`.
 */
export function setGqlPageSize(pageSize: number): void {
	if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > GQL_PAGE_SIZE) {
		throw new RangeError(`GraphQL page size must be an integer in [1, ${GQL_PAGE_SIZE}], got: ${pageSize}`);
	}
	configuredGqlPageSize = pageSize;
}

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
 * Maximum number of files downloaded in parallel when recursively downloading a
 * folder (public or private). Bounds resource usage (open sockets, file handles,
 * memory) while still being meaningfully faster than a fully sequential download.
 */
export const DEFAULT_DOWNLOAD_CONCURRENCY = 5;

/**
 * Error delay for the first failed request for a transaction header post or chunk upload
 * Subsequent requests will delay longer with an exponential back off strategy
 */
export const INITIAL_ERROR_DELAY = 500; // 500ms

/**
 * Default per-request timeout (in ms) applied to the GatewayAPI's default axios
 * instance. A hung or unresponsive gateway connection fails cleanly after this
 * window (the resulting network error flows into the normal retry/backoff path)
 * instead of waiting forever, which previously presented to users as an
 * indefinite upload "hang". Callers can override via the `requestTimeoutMs`
 * GatewayAPI constructor option, or by supplying their own `axiosInstance`.
 */
export const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Default pause (in ms) applied after a gateway returns an HTTP 429 (rate limit)
 * before the next request is attempted. Overridable via the GatewayAPI
 * `rateLimitThrottleMS` constructor option (primarily to keep tests fast).
 */
export const DEFAULT_RATE_LIMIT_THROTTLE_MS = 60_000; // 60 seconds

/**
 * Default maximum number of times a persistent HTTP 429 (rate limit) response is
 * waited out before the request gives up with a clear, actionable error.
 *
 * This bounds the rate-limit throttle loop: a gateway that returns 429 on EVERY
 * request (e.g. arweave.net now rate-limits CLI traffic) would otherwise pause
 * for {@link DEFAULT_RATE_LIMIT_THROTTLE_MS} and `continue` forever — the actual
 * "CLI hangs / upload times out" bug. With this budget the throttle is finite
 * (default 5 waits ≈ 5 minutes of tolerance) yet a transient throttle that
 * clears within the budget still succeeds.
 *
 * NOTE: this budget is SEPARATE from `maxRetriesPerRequest` — a 429 does not
 * consume an error retry, and a non-429 error does not consume a rate-limit
 * retry. The two counters are intentionally independent.
 */
export const DEFAULT_MAX_RATE_LIMIT_RETRIES = 5;

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
