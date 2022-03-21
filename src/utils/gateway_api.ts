import Transaction from 'arweave/node/lib/transaction';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Chunk } from '../arfs/multi_chunk_tx_uploader';
import { FATAL_CHUNK_UPLOAD_ERRORS, INITIAL_ERROR_DELAY } from './constants';

interface GatewayAPIConstParams {
	gatewayUrl: URL;
	maxRetriesPerRequest?: number;
	initialErrorDelayMS?: number;
	fatalErrors?: string[];
	validStatusCodes?: number[];
	axiosInstance?: AxiosInstance;
}

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

	constructor({
		gatewayUrl,
		maxRetriesPerRequest = 8,
		initialErrorDelayMS = INITIAL_ERROR_DELAY,
		fatalErrors = FATAL_CHUNK_UPLOAD_ERRORS,
		validStatusCodes = [200],
		axiosInstance = axios.create()
	}: GatewayAPIConstParams) {
		this.gatewayUrl = gatewayUrl;
		this.maxRetriesPerRequest = maxRetriesPerRequest;
		this.initialErrorDelayMS = initialErrorDelayMS;
		this.fatalErrors = fatalErrors;
		this.validStatusCodes = validStatusCodes;
		this.axiosInstance = axiosInstance;
	}

	private lastError = 'unknown error';
	private lastRespStatus = 0;

	public async postChunk(chunk: Chunk): Promise<void> {
		await this.postToEndpoint('chunk', chunk);
	}

	public async postTxHeader(transaction: Transaction): Promise<void> {
		await this.postToEndpoint('tx', transaction);
	}

	public async postToEndpoint(endpoint: string, data?: unknown): Promise<AxiosResponse<unknown>> {
		return this.retryRequestUntilMaxRetries(() =>
			this.axiosInstance.post(`${this.gatewayUrl.href}${endpoint}`, data)
		);
	}

	/**
	 * Retries the given request until the response returns a successful
	 * status code or the maxRetries setting has been exceeded
	 *
	 * @throws when a fatal error has been returned by request
	 * @throws when max retries have been exhausted
	 */
	private async retryRequestUntilMaxRetries(
		request: () => Promise<AxiosResponse<unknown>>
	): Promise<AxiosResponse<unknown>> {
		let retryNumber = 0;

		while (retryNumber <= this.maxRetriesPerRequest) {
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
			this.lastError = err instanceof Error ? err.message : (err as string);
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
		await new Promise((res) => setTimeout(res, delay));
	}
}
