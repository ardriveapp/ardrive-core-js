import type { ArweaveOracle } from './arweave_oracle';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { AR, ByteCount, Winston, ArDriveCommunityTip } from '../types';
interface ChunkPricingInfo {
    baseWinstonPrice: Winston;
    oneChunkWinstonPrice: Winston;
    perChunkWinstonPrice: Winston;
}
/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave base fee and cost of a chunk to use for estimations.
 */
export declare class ARDataPriceChunkEstimator extends AbstractARDataPriceAndCapacityEstimator {
    private readonly oracle;
    private setupPromise?;
    private pricingInfo?;
    /**
     * Creates a new estimator. Fetches pricing data proactively unless `skipSetup` is true.
     *
     * @param skipSetup allows for instantiation without pre-fetching pricing data from the oracle
     * @param oracle a data source for Arweave data pricing
     */
    constructor(skipSetup?: boolean, oracle?: ArweaveOracle);
    /**
     * Updates the pricing info with updated data from the pricing oracle
     *
     * @returns Promise for a ChunkPricingInfo
     */
    refreshPriceData(): Promise<ChunkPricingInfo>;
    /**
     * Generates a price estimate, in Winston, for an upload of size `byteCount`.
     *
     * @param byteCount the number of bytes for which a price estimate should be generated
     *
     * @returns Promise for the price of an upload of size `byteCount` in Winston
     *
     * @remarks Will fetch pricing data if it has not been fetched
     */
    getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston>;
    /**
     * Estimates the number of bytes that can be stored for a given amount of Winston
     *
     * @throws On invalid winston values and on any issues generating pricing models
     *
     * @remarks Will fetch pricing data if it has not been fetched
     * @remarks The ArDrive community fee is not considered in this estimation
     */
    getByteCountForWinston(winston: Winston): Promise<ByteCount>;
    /**
     * Estimates the number of bytes that can be stored for a given amount of AR
     *
     * @remarks Will fetch pricing data if it has not been fetched
     * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
     */
    getByteCountForAR(arPrice: AR, { minWinstonFee, tipPercentage }: ArDriveCommunityTip): Promise<ByteCount>;
}
export {};
