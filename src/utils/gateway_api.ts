import type Transaction from 'arweave/node/lib/transaction';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ArFSMetadataCache } from '../arfs/arfs_metadata_cache';
import { Chunk } from '../arfs/multi_chunk_tx_uploader';
import { TransactionID } from '../types';
import GQLResultInterface, { GQLTransactionsResultInterface } from '../types/gql_Types';
import {
	DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
	DEFAULT_MAX_RATE_LIMIT_RETRIES,
	DEFAULT_RATE_LIMIT_THROTTLE_MS,
	FATAL_CHUNK_UPLOAD_ERRORS,
	INITIAL_ERROR_DELAY
} from './constants';
import { GQLQuery } from './query';

interface GatewayAPIConstParams {
	gatewayUrl: URL;
	maxRetriesPerRequest?: number;
	initialErrorDelayMS?: number;
	fatalErrors?: string[];
	validStatusCodes?: number[];
	/**
	 * Per-request timeout (ms) applied ONLY when this class creates its own default
	 * axios instance. When a caller supplies their own `axiosInstance`, that instance
	 * is used as-is and this value is ignored (the caller owns its timeout config).
	 */
	requestTimeoutMs?: number;
	/**
	 * Maximum number of times a persistent HTTP 429 (rate limit) response is waited
	 * out before failing with a clear error. Bounds the rate-limit throttle loop so
	 * a gateway that 429s every request fails cleanly instead of pausing forever.
	 * Independent of `maxRetriesPerRequest`. Defaults to
	 * {@link DEFAULT_MAX_RATE_LIMIT_RETRIES}.
	 */
	maxRateLimitRetries?: number;
	/**
	 * Pause (ms) after a 429 before retrying. Overridable primarily to keep tests
	 * fast. Defaults to {@link DEFAULT_RATE_LIMIT_THROTTLE_MS} (60s).
	 */
	rateLimitThrottleMS?: number;
	axiosInstance?: AxiosInstance;
}

const rateLimitStatus = 429;

// With the current default error delay and max retries, we expect the following wait times after each request sent:

// 1st request attempt
// Retry wait 1: 500ms
// 2nd request attempt
// Retry wait 2: 1,000ms
// 3rd request attempt
// Retry wait 3: 2,000ms
// 4th request attempt
// Retry wait 4: 4,000ms
// 5th request attempt
// Retry wait 5: 8,000ms
// 6th request attempt
// Retry wait 6: 16,000ms
// 7th request attempt
// Retry wait 7: 32,000ms
// 8th request attempt
// Retry wait 8: 64,000ms
// 9th request attempt
// Throw error if 9th request failure

// Total wait time:
// 127,500ms / 2 minutes and 7.5 seconds

export class GatewayAPI {
	private gatewayUrl: URL;
	private maxRetriesPerRequest: number;
	private initialErrorDelayMS: number;
	private fatalErrors: string[];
	private validStatusCodes: number[];
	private maxRateLimitRetries: number;
	private rateLimitThrottleMS: number;
	private axiosInstance: AxiosInstance;

	constructor({
		gatewayUrl,
		maxRetriesPerRequest = 8,
		initialErrorDelayMS = INITIAL_ERROR_DELAY,
		fatalErrors = FATAL_CHUNK_UPLOAD_ERRORS,
		validStatusCodes = [200, 202],
		maxRateLimitRetries = DEFAULT_MAX_RATE_LIMIT_RETRIES,
		rateLimitThrottleMS = DEFAULT_RATE_LIMIT_THROTTLE_MS,
		// NOTE: `requestTimeoutMs` is destructured BEFORE `axiosInstance` so its
		// resolved default is available to the `axiosInstance` default initializer
		// below. The timeout is therefore applied only to the default instance we
		// create — a caller-supplied `axiosInstance` is used unmodified.
		requestTimeoutMs = DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
		axiosInstance = axios.create({ validateStatus: undefined, timeout: requestTimeoutMs })
	}: GatewayAPIConstParams) {
		this.gatewayUrl = gatewayUrl;
		this.maxRetriesPerRequest = maxRetriesPerRequest;
		this.initialErrorDelayMS = initialErrorDelayMS;
		this.fatalErrors = fatalErrors;
		this.validStatusCodes = validStatusCodes;
		this.maxRateLimitRetries = maxRateLimitRetries;
		this.rateLimitThrottleMS = rateLimitThrottleMS;
		this.axiosInstance = axiosInstance;
	}

	private lastError = 'unknown error';
	private lastRespStatus = 0;

	/**
	 * In-memory, per-instance metadata cache populated by the snapshot-accelerated
	 * listing path. A snapshot body embeds each captured entity's metadata bytes,
	 * so seeding this cache lets the entity builders resolve metadata WITHOUT any
	 * network data-tx GET (mirrors ardrive-web's snapshot "cache-before-fetch"
	 * handoff in `arweave_service.dart`). For public drives the bytes are plaintext
	 * JSON; for private drives they are the raw on-chain ciphertext (the builder
	 * still decrypts them with the drive key, exactly like a network-fetched tx).
	 *
	 * It is scoped to this GatewayAPI instance (i.e. per drive-listing operation),
	 * checked BEFORE the persistent on-disk {@link ArFSMetadataCache}, and is a
	 * no-op when empty — so it never changes behavior for the non-snapshot path.
	 */
	private snapshotMetadataCache = new Map<string, Buffer>();

	/** Seed the in-memory metadata cache with an entity's metadata bytes (from a snapshot body). */
	public cacheMetadataForTxId(txId: TransactionID, data: Buffer): void {
		this.snapshotMetadataCache.set(`${txId}`, data);
	}

	public async postChunk(chunk: Chunk): Promise<void> {
		await this.postToEndpoint('chunk', chunk);
	}

	public async postTxHeader(transaction: Transaction): Promise<void> {
		await this.postToEndpoint('tx', transaction);
	}

	public async gqlRequest(query: GQLQuery): Promise<GQLTransactionsResultInterface> {
		try {
			const { data } = await this.postToEndpoint<GQLResultInterface>('graphql', query);

			if (data.errors) {
				data.errors.forEach((error) => {
					console.error(`GQL Error: ${error.message}`);
				});
			}

			if (!data.data) {
				const isTimeoutError = data.errors?.some((error) =>
					error.message.includes('canceling statement due to statement timeout')
				);

				if (isTimeoutError) {
					throw new Error('GQL Query has been timed out.');
				}

				// The ar.io gateways enforce a ClickHouse read limit (~10M rows/bytes).
				// A heavy/under-scoped query trips this and returns a permanent error
				// (message "Limit for rows or bytes to read exceeded ... TOO_MANY_ROWS",
				// extensions code 158 / INTERNAL_SERVER_ERROR). This is NOT transient, so
				// we fail fast with an actionable message instead of pointlessly retrying.
				const isRowLimitError = data.errors?.some(
					(error) =>
						error.message.includes('Limit for rows or bytes to read exceeded') ||
						error.message.includes('TOO_MANY_ROWS') ||
						error.extensions?.code === '158'
				);

				if (isRowLimitError) {
					throw new Error(
						'The GraphQL query scanned too many rows and was rejected by the gateway ' +
							'(row/byte read limit exceeded). This usually means the query was under-scoped ' +
							'against a very large drive or folder. Scope the query by owner and/or drive ID ' +
							'(or narrow the block/time range) and try again.'
					);
				}

				throw new Error('No data was returned from the GQL request.');
			}

			return data.data.transactions;
		} catch (error) {
			throw Error(`GQL Error: ${(error as Error).message}`);
		}
	}

	public async postToEndpoint<T = unknown>(endpoint: string, data?: unknown): Promise<AxiosResponse<T>> {
		return this.retryRequestUntilMaxRetries(() =>
			this.axiosInstance.post(`${this.gatewayUrl.href}${endpoint}`, data)
		);
	}

	public async getTransaction(txId: TransactionID): Promise<Transaction> {
		try {
			return (
				await this.retryRequestUntilMaxRetries<Transaction>(() =>
					this.axiosInstance.get(`${this.gatewayUrl.href}tx/${txId}`)
				)
			).data;
		} catch (err) {
			throw Error(
				`Transaction could not be found from the gateway: (Status: ${this.lastRespStatus}) ${this.lastError}`
			);
		}
	}

	/**
	 * For fetching the Data JSON of a MetaData Tx
	 *
	 * @remarks Will use data from `ArFSMetadataCache` if it exists and will cache any fetched data
	 * */
	public async getTxData(txId: TransactionID): Promise<Buffer> {
		// Snapshot-seeded in-memory cache first: a hit here means the metadata came
		// from a snapshot body and no network fetch (nor even a disk read) is needed.
		const snapshotCached = this.snapshotMetadataCache.get(`${txId}`);
		if (snapshotCached) {
			return snapshotCached;
		}
		const cachedData = await ArFSMetadataCache.get(txId);
		if (cachedData) {
			return cachedData;
		}
		const { data: txData } = await this.retryRequestUntilMaxRetries<ArrayBuffer>(() =>
			this.axiosInstance.get(`${this.gatewayUrl.href}${txId}`, {
				responseType: 'arraybuffer'
			})
		);

		// Convert ArrayBuffer to Buffer for consistent handling across Node.js and browser
		const buffer = Buffer.from(txData);
		await ArFSMetadataCache.put(txId, buffer);
		return buffer;
	}

	/**
	 * Retries the given request until the response returns a successful
	 * status code or the maxRetries setting has been exceeded
	 *
	 * @throws when a fatal error has been returned by request
	 * @throws when max retries have been exhausted
	 */
	private async retryRequestUntilMaxRetries<T = unknown>(
		request: () => Promise<AxiosResponse<T>>
	): Promise<AxiosResponse<T>> {
		let retryNumber = 0;
		// Tracked SEPARATELY from `retryNumber`: a 429 (rate limit) is waited out on
		// its own bounded budget and does not consume the error-retry budget (and
		// vice versa). This bound is what prevents a gateway that returns 429 on
		// every request from pausing `rateLimitThrottleMS` and looping forever.
		let rateLimitRetries = 0;

		while (retryNumber <= this.maxRetriesPerRequest) {
			const response = await this.tryRequest<T>(request);

			if (response) {
				if (retryNumber > 0) {
					console.error(`Request has been successfully retried!`);
				}
				return response;
			}
			this.throwIfFatalError();

			if (this.lastRespStatus === rateLimitStatus) {
				// When rate limited by the gateway, we wait WITHOUT incrementing the
				// error-retry count — but bound the number of waits so a persistent
				// 429 fails cleanly instead of hanging forever.
				if (rateLimitRetries >= this.maxRateLimitRetries) {
					throw new Error(
						`Gateway is rate limiting (HTTP 429) and did not recover after ` +
							`${this.maxRateLimitRetries} retries; try a different --gateway or wait and retry.`
					);
				}
				rateLimitRetries++;
				await this.rateLimitThrottle();
				continue;
			}

			console.error(`Request to gateway has failed: (Status: ${this.lastRespStatus}) ${this.lastError}`);

			const nextRetry = retryNumber + 1;

			if (nextRetry <= this.maxRetriesPerRequest) {
				await this.exponentialBackOffAfterFailedRequest(retryNumber);

				console.error(`Retrying request, retry attempt ${nextRetry}...`);
			}

			retryNumber = nextRetry;
		}

		// Didn't succeed within number of allocated retries
		throw new Error(`Request to gateway has failed: (Status: ${this.lastRespStatus}) ${this.lastError}`);
	}

	private async tryRequest<T = unknown>(
		request: () => Promise<AxiosResponse<T>>
	): Promise<AxiosResponse<T> | undefined> {
		try {
			const resp = await request();
			this.lastRespStatus = resp.status;

			if (this.isRequestSuccessful()) {
				return resp;
			}

			this.lastError = resp.statusText ?? resp;
		} catch (err) {
			this.lastError = err instanceof Error ? err.message : `${err}`; // stringify error if unknown type
		}

		return undefined;
	}

	private isRequestSuccessful(): boolean {
		return this.validStatusCodes.includes(this.lastRespStatus);
	}

	private throwIfFatalError() {
		if (this.fatalErrors.includes(this.lastError)) {
			throw new Error(`Fatal error encountered: (Status: ${this.lastRespStatus}) ${this.lastError}`);
		}
	}

	private async exponentialBackOffAfterFailedRequest(retryNumber: number): Promise<void> {
		const delay = Math.pow(2, retryNumber) * this.initialErrorDelayMS;
		console.error(`Waiting for ${(delay / 1000).toFixed(1)} seconds before next request...`);
		await new Promise((res) => setTimeout(res, delay));
	}

	private async rateLimitThrottle() {
		console.error(
			`Gateway has returned a ${
				this.lastRespStatus
			} status which means your IP is being rate limited. Pausing for ${(this.rateLimitThrottleMS / 1000).toFixed(
				1
			)} seconds before trying next request...`
		);
		await new Promise((res) => setTimeout(res, this.rateLimitThrottleMS));
	}
}
