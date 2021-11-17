import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { ArDriveCommunityTip, AR, ByteCount, Winston } from '../types';

const byteCountOfChunk = new ByteCount(262144);

interface ChunkPricingInfo {
	baseWinstonPrice: Winston;
	oneChunkWinstonPrice: Winston;
	perChunkWinstonPrice: Winston;
}

/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave base fee and cost of a chunk to use for estimations.
 */
export class ARDataPriceChunkEstimator extends AbstractARDataPriceAndCapacityEstimator {
	private setupPromise?: Promise<ChunkPricingInfo>;
	private pricingInfo?: ChunkPricingInfo;

	/**
	 * Creates a new estimator. Fetches pricing data proactively unless `skipSetup` is true.
	 *
	 * @param skipSetup allows for instantiation without prefetching pricing data from the oracle
	 * @param oracle a datasource for Arweave data pricing
	 */
	constructor(skipSetup = false, private readonly oracle: ArweaveOracle = new GatewayOracle()) {
		super();

		if (!skipSetup) {
			this.refreshPriceData();
		}
	}

	/**
	 * Updates the regression model with fresh data from the pricing oracle
	 *
	 * @returns Promise for an {@link ARDataPriceRegression}
	 */
	public async refreshPriceData(): Promise<ChunkPricingInfo> {
		// Don't kick off another refresh while refresh is in progress
		if (this.setupPromise) {
			return this.setupPromise;
		}

		// Fetch the price for all values in byteVolume array and feed them into a linear regression
		this.setupPromise = (async () => {
			const basePrice = await this.oracle.getWinstonPriceForByteCount(new ByteCount(0));
			const oneChunkPrice = await this.oracle.getWinstonPriceForByteCount(new ByteCount(1));

			this.pricingInfo = {
				baseWinstonPrice: basePrice,
				oneChunkWinstonPrice: oneChunkPrice,
				perChunkWinstonPrice: oneChunkPrice.minus(basePrice)
			};

			return this.pricingInfo;
		})();

		await this.setupPromise;

		if (this.pricingInfo === undefined) {
			throw new Error('Pricing information could not be determined from gateway...');
		}

		return this.pricingInfo;
	}

	/**
	 * Generates a price estimate, in Winston, for an upload of size `byteCount`.
	 *
	 * @param byteCount the number of bytes for which a price estimate should be generated
	 *
	 * @returns Promise for the price of an upload of size `byteCount` in Winston
	 *
	 * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
	 */
	public async getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		// Lazily generate the price predictor
		if (!this.pricingInfo) {
			await this.refreshPriceData();
			if (!this.pricingInfo) {
				throw Error('Failed to generate pricing model!');
			}
		}

		if (byteCount.valueOf() === 0) {
			// Return base price for 0 byte uploads
			return this.pricingInfo.baseWinstonPrice;
		}

		const numberOfChunksToUpload = Math.ceil(byteCount.valueOf() / byteCountOfChunk.valueOf());

		const predictedPrice = this.pricingInfo.perChunkWinstonPrice
			.times(numberOfChunksToUpload)
			.plus(this.pricingInfo.baseWinstonPrice);

		return predictedPrice;
	}

	/**
	 * Estimates the number of bytes that can be stored for a given amount of Winston
	 *
	 * @throws On invalid winston values and on any issues generating pricing models
	 *
	 * @remarks Will fetch pricing data for regression modeling if a data has not yet been fetched.
	 * @remarks The ArDrive community fee is not considered in this estimation
	 */
	public async getByteCountForWinston(winston: Winston): Promise<ByteCount> {
		// Lazily generate the price predictor
		if (!this.pricingInfo) {
			await this.refreshPriceData();
			if (!this.pricingInfo) {
				throw Error('Failed to generate pricing model!');
			}
		}

		if (winston.isGreaterThan(this.pricingInfo.oneChunkWinstonPrice)) {
			// TODO: TEST THIS UPDATED ALGO!
			const numberOfChunks = Math.floor(
				+winston.minus(this.pricingInfo.baseWinstonPrice) / +this.pricingInfo.perChunkWinstonPrice
			);
			return new ByteCount(numberOfChunks * +winston);
		}

		// Return 0 if winston price given does not cover the base winston price for a 1 byte transaction
		return new ByteCount(0);
	}

	/**
	 * Estimates the number of bytes that can be stored for a given amount of AR
	 *
	 * @remarks Will fetch pricing data for regression modeling if a regression has not yet been run.
	 * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
	 */
	public async getByteCountForAR(
		arPrice: AR,
		{ minWinstonFee, tipPercentage }: ArDriveCommunityTip
	): Promise<ByteCount> {
		// Lazily generate the price predictor
		if (!this.pricingInfo) {
			await this.refreshPriceData();
			if (!this.pricingInfo) {
				throw Error('Failed to generate pricing model!');
			}
		}

		// TODO: CHANGE AND/OR TEST THIS ALGO
		return super.getByteCountForAR(arPrice, { minWinstonFee, tipPercentage });
	}
}
