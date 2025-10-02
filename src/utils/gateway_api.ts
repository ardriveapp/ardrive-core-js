import Transaction from 'arweave/node/lib/transaction';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ArFSMetadataCache } from '../arfs/arfs_metadata_cache';
import { Chunk } from '../arfs/multi_chunk_tx_uploader';
import { TransactionID } from '../types';
import GQLResultInterface, {
	GQLTransactionsResultInterface,
	GQLEdgeInterface,
	GQLNodeInterface
} from '../types/gql_Types';
import { FATAL_CHUNK_UPLOAD_ERRORS, INITIAL_ERROR_DELAY } from './constants';
import { GQLQuery, BuildGQLQueryParams } from './query';

// Type for QueryProvider from @arweave-query/core
export interface QueryProvider {
	getTransactions(filter: TransactionsQueryFilter): Promise<QueryResult<ArweaveTransaction>>;
}

export interface TransactionsQueryFilter {
	first?: number;
	after?: string;
	ids?: string[];
	owners?: string[];
	recipients?: string[];
	tags?: TagFilter[];
	block?: {
		min?: number;
		max?: number;
	};
}

export interface TagFilter {
	name: string;
	values: string[];
}

export interface QueryResult<T> {
	data: T[];
	hasNextPage: boolean;
	cursor?: string;
	next?: () => Promise<QueryResult<T>>;
}

export interface ArweaveTransaction {
	id: string;
	anchor?: string;
	signature?: string;
	recipient?: string;
	owner?: {
		address: string;
		key?: string;
	};
	fee?: {
		winston: string;
		ar: string;
	};
	quantity?: {
		winston: string;
		ar: string;
	};
	data?: {
		size: number;
		type?: string;
	};
	tags: Array<{ name: string; value: string }>;
	block?: {
		id: string;
		timestamp: number;
		height: number;
		previous?: string;
	};
	parent?: {
		id: string;
	};
}

interface GatewayAPIConstParams {
	gatewayUrl: URL;
	maxRetriesPerRequest?: number;
	initialErrorDelayMS?: number;
	fatalErrors?: string[];
	validStatusCodes?: number[];
	axiosInstance?: AxiosInstance;
	queryProvider?: QueryProvider;
}

const rateLimitStatus = 429;
const rateLimitTimeout = 60_000; // 60 seconds

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
	private axiosInstance: AxiosInstance;
	private queryProvider?: QueryProvider;

	constructor({
		gatewayUrl,
		maxRetriesPerRequest = 8,
		initialErrorDelayMS = INITIAL_ERROR_DELAY,
		fatalErrors = FATAL_CHUNK_UPLOAD_ERRORS,
		validStatusCodes = [200, 202],
		axiosInstance = axios.create({ validateStatus: undefined }),
		queryProvider
	}: GatewayAPIConstParams) {
		this.gatewayUrl = gatewayUrl;
		this.maxRetriesPerRequest = maxRetriesPerRequest;
		this.initialErrorDelayMS = initialErrorDelayMS;
		this.fatalErrors = fatalErrors;
		this.validStatusCodes = validStatusCodes;
		this.axiosInstance = axiosInstance;
		this.queryProvider = queryProvider;
	}

	private lastError = 'unknown error';
	private lastRespStatus = 0;

	public async postChunk(chunk: Chunk): Promise<void> {
		await this.postToEndpoint('chunk', chunk);
	}

	public async postTxHeader(transaction: Transaction): Promise<void> {
		await this.postToEndpoint('tx', transaction);
	}

	public async gqlRequest(query: GQLQuery): Promise<GQLTransactionsResultInterface> {
		// If queryProvider is available and we have query params, use it
		if (this.queryProvider && query.params) {
			return this.executeQueryWithProvider(query.params);
		}

		// Fall back to direct GraphQL request
		try {
			const { data } = await this.postToEndpoint<GQLResultInterface>('graphql', { query: query.query });

			if (data.errors) {
				data.errors.forEach((error: { message: string }) => {
					console.error(`GQL Error: ${error.message}`);
				});
			}

			if (!data.data) {
				const isTimeoutError = data.errors?.some((error: { message: string }) =>
					error.message.includes('canceling statement due to statement timeout')
				);

				if (isTimeoutError) {
					throw new Error('GQL Query has been timed out.');
				}

				throw new Error('No data was returned from the GQL request.');
			}

			return data.data.transactions;
		} catch (error) {
			throw Error(`GQL Error: ${(error as Error).message}`);
		}
	}

	/**
	 * Execute query using the QueryProvider and convert results to GQL format
	 */
	private async executeQueryWithProvider(params: BuildGQLQueryParams): Promise<GQLTransactionsResultInterface> {
		if (!this.queryProvider) {
			throw new Error('QueryProvider not configured');
		}

		// Convert BuildGQLQueryParams to TransactionsQueryFilter
		const filter = this.buildGQLParamsToQueryFilter(params);
		console.log(JSON.stringify(filter, null, 2));

		try {
			const result = await this.queryProvider.getTransactions(filter);
			console.log(result);
			return this.convertQueryResultToGQL(result);
		} catch (error) {
			throw Error(`QueryProvider Error: ${(error as Error).message}`);
		}
	}

	/**
	 * Convert BuildGQLQueryParams to TransactionsQueryFilter format
	 */
	private buildGQLParamsToQueryFilter(params: BuildGQLQueryParams): TransactionsQueryFilter {
		const filter: TransactionsQueryFilter = {
			first: params.cursor === undefined ? 1 : 100
		};

		if (params.cursor) {
			filter.after = params.cursor;
		}

		if (params.owner) {
			filter.owners = [params.owner.toString()];
		}

		if (params.ids && params.ids.length > 0) {
			filter.ids = params.ids.map((id) => id.toString());
		}

		if (params.tags && params.tags.length > 0) {
			filter.tags = params.tags.map((tag) => ({
				name: tag.name,
				values: Array.isArray(tag.value) ? tag.value : [tag.value]
			}));
		}

		return filter;
	}

	/**
	 * Convert QueryResult from @arweave-query/core to GQLTransactionsResultInterface
	 */
	private convertQueryResultToGQL(result: QueryResult<ArweaveTransaction>): GQLTransactionsResultInterface {
		const edges: GQLEdgeInterface[] = result.data.map((tx) => {
			const node: GQLNodeInterface = {
				id: tx.id,
				anchor: tx.anchor || '',
				signature: tx.signature || '',
				recipient: tx.recipient || '',
				owner: {
					address: tx.owner?.address || '',
					key: tx.owner?.key || ''
				},
				fee: {
					winston: tx.fee?.winston || '0',
					ar: tx.fee?.ar || '0'
				},
				quantity: {
					winston: tx.quantity?.winston || '0',
					ar: tx.quantity?.ar || '0'
				},
				data: {
					size: tx.data?.size || 0,
					type: tx.data?.type || ''
				},
				tags: tx.tags.map((tag) => ({
					name: tag.name,
					value: tag.value
				})),
				block: {
					id: tx.block?.id || '',
					timestamp: tx.block?.timestamp || 0,
					height: tx.block?.height || 0,
					previous: tx.block?.previous || ''
				},
				parent: {
					id: tx.parent?.id || ''
				}
			};

			return {
				cursor: result.cursor || '',
				node
			};
		});

		return {
			pageInfo: {
				hasNextPage: result.hasNextPage
			},
			edges
		};
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
		const cachedData = await ArFSMetadataCache.get(txId);
		if (cachedData) {
			return cachedData;
		}
		const { data: txData } = await this.retryRequestUntilMaxRetries<Buffer>(() =>
			this.axiosInstance.get(`${this.gatewayUrl.href}${txId}`, {
				responseType: 'arraybuffer'
			})
		);

		await ArFSMetadataCache.put(txId, txData);
		return txData;
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
				// When rate limited by the gateway, we will wait without incrementing retry count
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
			} status which means your IP is being rate limited. Pausing for ${(rateLimitTimeout / 1000).toFixed(
				1
			)} seconds before trying next request...`
		);
		await new Promise((res) => setTimeout(res, rateLimitTimeout));
	}
}
