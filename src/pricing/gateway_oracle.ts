import type { ArweaveOracle } from './arweave_oracle';
import { ByteCount, W, Winston } from '../types';
import { BigNumber } from 'bignumber.js';
import axios, { AxiosResponse } from 'axios';
import { byteCountToChunks } from '../utils/common';

export class GatewayOracle implements ArweaveOracle {
	constructor(private readonly axiosRequest: (url: string) => Promise<AxiosResponse> = (url) => axios.get(url)) {}

	async getWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		const response: AxiosResponse = await this.axiosRequest(`https://arweave.net/price/${byteCount}`);
		const winstonAsString = `${response.data}`;
		return W(new BigNumber(winstonAsString));
	}
}

export class CachedGatewayOracle extends GatewayOracle {
	private initialPriceRequest = true;

	private cachedPricePerChunk: { [chunks: string]: Promise<Winston> } = {};

	async getWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		if (this.initialPriceRequest) {
			// Cache promises for 0 and 1 chunk for chunk estimator calculations on initial request
			this.cachedPricePerChunk['0'] = super.getWinstonPriceForByteCount(new ByteCount(0));
			this.cachedPricePerChunk['1'] = super.getWinstonPriceForByteCount(new ByteCount(1));
			this.initialPriceRequest = false;
		}

		const chunks = byteCountToChunks(byteCount);
		const cachedPrice = this.cachedPricePerChunk[`${chunks}`];

		if (cachedPrice) {
			return cachedPrice;
		}

		const winstonPricePromise = super.getWinstonPriceForByteCount(byteCount);

		this.cachedPricePerChunk[`${chunks}`] = winstonPricePromise;

		return winstonPricePromise;
	}
}
