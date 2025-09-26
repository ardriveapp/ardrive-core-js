import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type { TransactionID } from '../types';
import type { GQLTransactionsResultInterface } from '../types/gql_Types';
import type GQLResultInterface from '../types/gql_Types';
import type { GQLQuery } from '../utils/query';
import { ArFSMetadataCacheWeb } from './arfs_metadata_cache_web';

interface GatewayAPIWebParams {
	gatewayUrl: URL;
	maxRetriesPerRequest?: number;
	initialErrorDelayMS?: number;
	validStatusCodes?: number[];
	axiosInstance?: AxiosInstance;
}

const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_INITIAL_DELAY = 500; // ms

export class GatewayAPIWeb {
	private gatewayUrl: URL;
	private maxRetriesPerRequest: number;
	private initialErrorDelayMS: number;
	private validStatusCodes: number[];
	private axiosInstance: AxiosInstance;

	constructor({
		gatewayUrl,
		maxRetriesPerRequest = DEFAULT_MAX_RETRIES,
		initialErrorDelayMS = DEFAULT_INITIAL_DELAY,
		validStatusCodes = [200, 202],
		axiosInstance = axios.create({ validateStatus: () => true })
	}: GatewayAPIWebParams) {
		this.gatewayUrl = gatewayUrl;
		this.maxRetriesPerRequest = maxRetriesPerRequest;
		this.initialErrorDelayMS = initialErrorDelayMS;
		this.validStatusCodes = validStatusCodes;
		this.axiosInstance = axiosInstance;
	}

	async gqlRequest(query: GQLQuery): Promise<GQLTransactionsResultInterface> {
		const { data } = await this.postWithRetry<GQLResultInterface>('graphql', query);
		if (data.errors?.length) {
			throw new Error(`GQL Error: ${data.errors.map((e) => e.message).join('; ')}`);
		}
		if (!data.data) throw new Error('No data returned from GQL request');
		return data.data.transactions;
	}

	async getTxData(txId: TransactionID | string): Promise<Uint8Array> {
		const key = typeof txId === 'string' ? txId : `${txId}`;
		const cached = await ArFSMetadataCacheWeb.get(key as string);
		if (cached) return cached;
		const resp = await this.getWithRetry<ArrayBuffer>(`${key}`, { responseType: 'arraybuffer' });
		const bytes = new Uint8Array(resp.data);
		await ArFSMetadataCacheWeb.put(key as string, bytes);
		return bytes;
	}

	private async postWithRetry<T = unknown>(endpoint: string, payload?: unknown): Promise<AxiosResponse<T>> {
		return this.retry(async () => this.axiosInstance.post(`${this.gatewayUrl.href}${endpoint}`, payload));
	}

	private async getWithRetry<T = unknown>(
		endpoint: string,
		config?: Record<string, unknown>
	): Promise<AxiosResponse<T>> {
		return this.retry(async () => this.axiosInstance.get(`${this.gatewayUrl.href}${endpoint}`, config));
	}

	private async retry<T>(request: () => Promise<AxiosResponse<T>>): Promise<AxiosResponse<T>> {
		let attempt = 0;
		let lastError: unknown;
		while (attempt <= this.maxRetriesPerRequest) {
			try {
				const resp = await request();
				if (this.validStatusCodes.includes(resp.status)) return resp;
				lastError = resp.statusText ?? resp.status;
			} catch (e) {
				lastError = e;
			}
			if (attempt === this.maxRetriesPerRequest) break;
			await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * this.initialErrorDelayMS));
			attempt++;
		}
		throw new Error(`Request failed after retries: ${String(lastError)}`);
	}
}
