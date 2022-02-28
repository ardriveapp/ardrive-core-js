import type { ArweaveOracle } from './arweave_oracle';
import { ByteCount, W, Winston } from '../types';
import { BigNumber } from 'bignumber.js';
import axios, { AxiosResponse } from 'axios';
import { defaultArweaveGatewayPath } from '../utils/constants';

export class GatewayOracle implements ArweaveOracle {
	constructor(private readonly gateway = new URL(defaultArweaveGatewayPath)) {}

	async getWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		const response: AxiosResponse = await axios.get(`${this.gateway.href}price/${byteCount}`);
		const winstonAsString = `${response.data}`;
		return W(new BigNumber(winstonAsString));
	}
}
