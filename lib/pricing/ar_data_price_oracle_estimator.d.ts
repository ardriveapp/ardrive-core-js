import type { ArweaveOracle } from './arweave_oracle';
import { AbstractARDataPriceEstimator } from './ar_data_price_estimator';
import { ByteCount, Winston } from '../types';
/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave data prices from an ArweaveOracle each time it's requested
 */
export declare class ARDataPriceOracleEstimator extends AbstractARDataPriceEstimator {
    private readonly oracle;
    constructor(oracle?: ArweaveOracle);
    /**
     * Generates a price estimate, in Winston, for an upload of size `byteCount`.
     *
     * @param byteCount the number of bytes for which a price estimate should be generated
     *
     * @returns Promise for the price of an upload of size `byteCount` in Winston
     */
    getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston>;
}
