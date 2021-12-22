import { CachedGatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { ByteCount, W, Winston } from '../types';
import { byteCountPerChunk } from '../utils/constants';

/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave pricing and caches results based on their chunk size
 */
export class ARDataPriceNetworkEstimator extends AbstractARDataPriceAndCapacityEstimator {
	/**
	 * Creates a new estimator.
	 *
	 * @param oracle a data source for Arweave data pricing
	 */
	constructor(private readonly oracle: ArweaveOracle = new CachedGatewayOracle()) {
		super();
	}

	/**
	 * Goes to the arweave gateway oracle a price estimate, in Winston, for an upload of size `byteCount`.
	 *
	 * @param byteCount the number of bytes for which a price estimate should be generated
	 */
	public async getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		return this.oracle.getWinstonPriceForByteCount(byteCount);
	}

	/**
	 * Estimates the number of bytes that can be stored for a given amount of Winston
	 *
	 * @remarks This method is meant to only be an estimation at this time, do not use to calculate real values!
	 * @remarks The ArDrive community fee is not considered in this estimation
	 */
	public async getByteCountForWinston(winston: Winston): Promise<ByteCount> {
		const baseWinstonPrice = await this.getBaseWinstonPriceForByteCount(new ByteCount(0));
		const oneChunkWinstonPrice = await this.getBaseWinstonPriceForByteCount(new ByteCount(1));

		if (winston.isGreaterThanOrEqualTo(oneChunkWinstonPrice)) {
			const perChunkEstCost = oneChunkWinstonPrice.minus(baseWinstonPrice).plus(W(1));
			const estimatedChunks = Math.floor(
				+winston.minus(baseWinstonPrice).dividedBy(+perChunkEstCost, 'ROUND_DOWN')
			);

			return new ByteCount(estimatedChunks * +byteCountPerChunk);
		}

		// Return 0 if winston price given does not cover the base winston price for a 1 chunk transaction
		return new ByteCount(0);
	}
}
