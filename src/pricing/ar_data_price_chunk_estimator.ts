import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { AR, ByteCount, Winston, W, ArDriveCommunityTip } from '../types';
import { byteCountPerChunk } from '../utils/constants';

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
	 * @param skipSetup allows for instantiation without pre-fetching pricing data from the oracle
	 * @param oracle a data source for Arweave data pricing
	 */
	constructor(skipSetup = false, private readonly oracle: ArweaveOracle = new GatewayOracle()) {
		super();

		if (!skipSetup) {
			this.refreshPriceData();
		}
	}

	/**
	 * Updates the pricing info with updated data from the pricing oracle
	 *
	 * @returns Promise for a ChunkPricingInfo
	 */
	public async refreshPriceData(): Promise<ChunkPricingInfo> {
		// Don't kick off another refresh while refresh is in progress
		if (this.setupPromise) {
			return this.setupPromise;
		}

		this.setupPromise = (async () => {
			const basePrice = await this.oracle.getWinstonPriceForByteCount(new ByteCount(0));
			const oneChunkPrice = await this.oracle.getWinstonPriceForByteCount(new ByteCount(1));

			// Add one winston per chunk due to unknown algorithmic anomalies
			const magicBullet = W(1);

			this.pricingInfo = {
				baseWinstonPrice: basePrice,
				oneChunkWinstonPrice: oneChunkPrice,
				perChunkWinstonPrice: oneChunkPrice.minus(basePrice).plus(magicBullet)
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
	 * @remarks Will fetch pricing data if it has not been fetched
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

		const numberOfChunksToUpload = Math.ceil(byteCount.valueOf() / byteCountPerChunk.valueOf());

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
	 * @remarks Will fetch pricing data if it has not been fetched
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
		const { oneChunkWinstonPrice, baseWinstonPrice, perChunkWinstonPrice } = this.pricingInfo;

		if (winston.isGreaterThanOrEqualTo(oneChunkWinstonPrice)) {
			const estimatedChunks = Math.floor(
				+winston.minus(baseWinstonPrice).dividedBy(+perChunkWinstonPrice, 'ROUND_DOWN')
			);

			return new ByteCount(estimatedChunks * +byteCountPerChunk);
		}

		// Return 0 if winston price given does not cover the base winston price for a 1 chunk transaction
		return new ByteCount(0);
	}

	/**
	 * Estimates the number of bytes that can be stored for a given amount of AR
	 *
	 * @remarks Will fetch pricing data if it has not been fetched
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

		return super.getByteCountForAR(arPrice, { minWinstonFee, tipPercentage });
	}
}
