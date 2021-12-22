import { ByteCount, Winston } from '../types';
import { ARDataPriceChunkEstimator } from './ar_data_price_chunk_estimator';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { ARDataPriceNetworkEstimator } from './ar_data_price_network_estimator';

export class ArDataPriceFallbackEstimator extends AbstractARDataPriceAndCapacityEstimator {
	private currentPriceEstimatorIndex = 0;

	private get priceEstimator(): AbstractARDataPriceAndCapacityEstimator {
		return this.priceEstimators[this.currentPriceEstimatorIndex];
	}

	constructor(
		private readonly priceEstimators: AbstractARDataPriceAndCapacityEstimator[] = [
			new ARDataPriceNetworkEstimator(),
			new ARDataPriceChunkEstimator()
		]
	) {
		super();
	}

	async useClosureAndFallbackOnFail<T>(
		closure: (priceEstimator: AbstractARDataPriceAndCapacityEstimator) => Promise<T>
	): Promise<T> {
		let result: T | undefined = undefined;

		while (!result) {
			try {
				// Return result if possible
				result = await closure(this.priceEstimator);
			} catch {
				if (this.currentPriceEstimatorIndex === this.priceEstimators.length - 1) {
					throw new Error('Last fallback price estimator has failed, price could not be determined...');
				}

				// Else fallback to next price estimator
				this.currentPriceEstimatorIndex++;
			}
		}

		return result;
	}

	async getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		return this.useClosureAndFallbackOnFail((priceEstimator) =>
			priceEstimator.getBaseWinstonPriceForByteCount(byteCount)
		);
	}

	async getByteCountForWinston(winston: Winston): Promise<ByteCount> {
		return this.useClosureAndFallbackOnFail((priceEstimator) => priceEstimator.getByteCountForWinston(winston));
	}
}
