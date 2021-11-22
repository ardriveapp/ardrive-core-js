import type { ArweaveOracle } from './arweave_oracle';
import { ARDataPriceRegression } from './data_price_regression';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { ArDriveCommunityTip, AR, ByteCount, Winston } from '../types';
/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave data prices to build a linear regression model to use for estimations.
 */
export declare class ARDataPriceRegressionEstimator extends AbstractARDataPriceAndCapacityEstimator {
    private readonly oracle;
    private readonly byteVolumes;
    static readonly sampleByteVolumes: ByteCount[];
    private predictor?;
    private setupPromise?;
    /**
     * Creates a new estimator. Fetches pricing data proactively unless `skipSetup` is true.
     *
     * @param skipSetup allows for instantiation without prefetching pricing data from the oracle
     * @param oracle a datasource for Arweave data pricing
     * @param byteVolumes an array of non-negative byte integers to fetch for pricing data
     *
     * @throws when byteVolumes array has less than 2 values
     * @throws when volumes on byteVolumes array are negative or non-integer decimal values
     *
     * @returns an ARDataPriceEstimator
     */
    constructor(skipSetup?: boolean, oracle?: ArweaveOracle, byteVolumes?: ByteCount[]);
    /**
     * Updates the regression model with fresh data from the pricing oracle
     *
     * @returns Promise for an {@link ARDataPriceRegression}
     */
    refreshPriceData(): Promise<ARDataPriceRegression>;
    /**
     * Generates a price estimate, in Winston, for an upload of size `byteCount`.
     *
     * @param byteCount the number of bytes for which a price estimate should be generated
     *
     * @returns Promise for the price of an upload of size `byteCount` in Winston
     *
     * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
     */
    getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston>;
    /**
     * Estimates the number of bytes that can be stored for a given amount of Winston
     *
     * @throws On invalid winston values and on any issues generating pricing models
     *
     * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
     * @remarks The ArDrive community fee is not considered in this estimation
     */
    getByteCountForWinston(winston: Winston): Promise<ByteCount>;
    /**
     * Estimates the number of bytes that can be stored for a given amount of AR
     *
     * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
     * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
     */
    getByteCountForAR(arPrice: AR, { minWinstonFee, tipPercentage }: ArDriveCommunityTip): Promise<ByteCount>;
}
