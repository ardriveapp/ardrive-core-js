import { expect } from 'chai';
import { stub } from 'sinon';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { ByteCount, W } from '../types';
import { ARDataPriceChunkEstimator } from './ar_data_price_chunk_estimator';
import { ARDataPriceFallbackEstimator } from './ar_data_price_fallback_estimator';

describe('ARDataPriceFallbackEstimator', () => {
	const stubByteCount = new ByteCount(5);

	it('getBaseWinstonPriceForByeCount returns the expected result', async () => {
		const stubEstimator = stub(new ARDataPriceChunkEstimator(true));
		stubEstimator.getBaseWinstonPriceForByteCount.resolves(W(50));

		const fallbackEstimator = new ARDataPriceFallbackEstimator([stubEstimator]);

		expect(+(await fallbackEstimator.getBaseWinstonPriceForByteCount(stubByteCount))).to.equal(50);
	});

	it('getByteCountForWinston returns the expected result', async () => {
		const stubEstimator = stub(new ARDataPriceChunkEstimator(true));
		stubEstimator.getByteCountForWinston.resolves(new ByteCount(101));

		const fallbackEstimator = new ARDataPriceFallbackEstimator([stubEstimator]);

		expect(+(await fallbackEstimator.getByteCountForWinston(W(5)))).to.equal(101);
	});

	it('throws an error if price can not be determined from provided price estimators', async () => {
		const stubEstimatorWithError = stub(new ARDataPriceChunkEstimator(true));
		stubEstimatorWithError.getBaseWinstonPriceForByteCount.callsFake(() => {
			throw new Error('stub error');
		});

		const fallbackEstimator = new ARDataPriceFallbackEstimator([stubEstimatorWithError]);

		await expectAsyncErrorThrow({
			promiseToError: fallbackEstimator.getBaseWinstonPriceForByteCount(stubByteCount),
			errorMessage: 'Last fallback price estimator has failed, price could not be determined...'
		});
	});

	it('falls back to an error if price can not be determined from provided price estimators', async () => {
		const stubEstimator = stub(new ARDataPriceChunkEstimator(true));
		stubEstimator.getBaseWinstonPriceForByteCount.resolves(W(420));

		const stubEstimatorWithError = stub(new ARDataPriceChunkEstimator(true));
		stubEstimatorWithError.getBaseWinstonPriceForByteCount.callsFake(() => {
			throw new Error('stub error');
		});

		const fallbackEstimator = new ARDataPriceFallbackEstimator([stubEstimatorWithError, stubEstimator]);

		expect(+(await fallbackEstimator.getBaseWinstonPriceForByteCount(stubByteCount))).to.equal(420);
	});
});
