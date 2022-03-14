import Transaction from 'arweave/node/lib/transaction';
import axios, { AxiosResponse } from 'axios';
import { Chunk } from '../arfs/multi_chunk_tx_uploader';
import { FATAL_CHUNK_UPLOAD_ERRORS, INITIAL_ERROR_DELAY } from './constants';

interface GatewayAPIConstParams {
	gatewayUrl: URL;
	maxRetriesPerRequest?: number;
	/** MS to wait after first failed request; uses exponential delay on subsequent retries */
	initialErrorDelayMS?: number;
	/** Errors returned by response.statusText that we should never continue on */
	fatalErrors?: string[];
	/** Status codes returned by response.status that we will consider a successful response */
	validStatusCodes?: number[];
}

// With the current default error delay and max retries, we expect the following wait times:

// First request: 0ms
// Retry wait 1 : 500ms
// Retry wait 2 : 1,000ms
// Retry wait 3 : 2,000ms
// Retry wait 4 : 4,000ms
// Retry wait 5 : 8,000ms
// Retry wait 6 : 16,000ms
// Retry wait 7 : 32,000ms
// Retry wait 8 : 64,000ms

export class GatewayAPI {
	private gatewayUrl: URL;
	private maxRetriesPerRequest: number;
	private initialErrorDelayMS: number;
	private fatalErrors: string[];
	private validStatusCodes: number[];

	constructor({
		gatewayUrl,
		maxRetriesPerRequest = 8,
		initialErrorDelayMS = INITIAL_ERROR_DELAY,
		fatalErrors = FATAL_CHUNK_UPLOAD_ERRORS,
		validStatusCodes = [200]
	}: GatewayAPIConstParams) {
		this.gatewayUrl = gatewayUrl;
		this.maxRetriesPerRequest = maxRetriesPerRequest;
		this.initialErrorDelayMS = initialErrorDelayMS;
		this.fatalErrors = fatalErrors;
		this.validStatusCodes = validStatusCodes;
	}

	private lastError = 'unknown error';
	private lastRespStatus = 0;

	public async postChunk(chunk: Chunk): Promise<void> {
		await this.postToEndpoint('chunk', chunk);
	}

	public async postTxHeader(transaction: Transaction): Promise<void> {
		await this.postToEndpoint('tx', transaction);
	}

	private async postToEndpoint(endpoint: string, data?: unknown): Promise<AxiosResponse<unknown>> {
		return this.retryRequestUntilMaxRetries(() => axios.post(`${this.gatewayUrl.href}${endpoint}`, data));
	}

	/**
	 * Retries the given request until the response returns a successful
	 * status code of 200 or the maxRetries setting has been exceeded
	 *
	 * @throws when a fatal chunk error has been returned by an Arweave node
	 * @throws when max retries have been exhausted
	 */
	private async retryRequestUntilMaxRetries(
		request: () => Promise<AxiosResponse<unknown>>
	): Promise<AxiosResponse<unknown>> {
		let retryNumber = 0;

		while (retryNumber < this.maxRetriesPerRequest) {
			const response = await this.tryRequest(request);

			if (response) {
				return response;
			}
			this.throwIfFatalError();

			await this.exponentialBackOffAfterFailedRequest(retryNumber++);
		}

		// Didn't succeed within number of allocated retries
		throw new Error(`Request to gateway has failed: (Status: ${this.lastRespStatus}) ${this.lastError}`);
	}

	private async tryRequest(
		request: () => Promise<AxiosResponse<unknown>>
	): Promise<AxiosResponse<unknown> | undefined> {
		try {
			const resp = await request();
			this.lastRespStatus = resp.status;

			if (this.isRequestSuccessful()) {
				return resp;
			}

			this.lastError = resp.statusText ?? resp;
		} catch (err) {
			this.lastError = err instanceof Error ? err.message : err;
		}

		return undefined;
	}

	private isRequestSuccessful(): boolean {
		return this.validStatusCodes.includes(this.lastRespStatus);
	}

	private throwIfFatalError() {
		if (this.fatalErrors.includes(this.lastError)) {
			throw new Error(`Fatal error uploading chunk: (Status: ${this.lastRespStatus}) ${this.lastError}`);
		}
	}

	private async exponentialBackOffAfterFailedRequest(retryNumber: number): Promise<void> {
		const delay = Math.pow(2, retryNumber) * this.initialErrorDelayMS;
		await new Promise((res) => setTimeout(res, delay));
	}
}
