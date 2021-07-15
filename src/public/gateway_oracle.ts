import { getWinston } from '../node';
import { ArweaveOracle } from './arweave_oracle';

export class GatewayOracle implements ArweaveOracle {
	getWinstonPriceForByteCount(byteCount: number): Promise<number> {
		return getWinston(byteCount);
	}
}
