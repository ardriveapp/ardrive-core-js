import type { ArweaveOracle } from './arweave_oracle';
import { ByteCount, Winston } from '../types';
export declare class GatewayOracle implements ArweaveOracle {
    getWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston>;
}
