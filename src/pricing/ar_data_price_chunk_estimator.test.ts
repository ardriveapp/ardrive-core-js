import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { ArDriveCommunityTip, W, AR, ByteCount } from '../types';
import { ARDataPriceChunkEstimator } from './ar_data_price_chunk_estimator';

describe('ARDataPriceChunkEstimator class', () => {
	let spyedOracle: SinonStubbedInstance<ArweaveOracle>;
	let calculator: ARDataPriceChunkEstimator;
	const chunkSize = 256 * Math.pow(2, 10);
	const baseFee = 100;
	const marginalFeePerChunk = 1000;
	const oneChunkPrice = baseFee + marginalFeePerChunk;

	const arDriveCommunityTip: ArDriveCommunityTip = { minWinstonFee: W(10), tipPercentage: 0.15 };

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		// TODO: Get ts-sinon working with snowpack so we don't have to use a concrete type here

		spyedOracle = stub(new GatewayOracle());
		spyedOracle.getWinstonPriceForByteCount.callsFake(
			(input) => Promise.resolve(W(Math.ceil(+input / chunkSize) * marginalFeePerChunk + baseFee)) // Simulate AR pricing
		);
		calculator = new ARDataPriceChunkEstimator(true, spyedOracle);
	});

	it('can be instantiated without making oracle calls', async () => {
		const gatewayOracleStub = stub(new GatewayOracle());
		gatewayOracleStub.getWinstonPriceForByteCount.callsFake(() => Promise.resolve(W(123)));
		new ARDataPriceChunkEstimator(true, gatewayOracleStub);
		expect(gatewayOracleStub.getWinstonPriceForByteCount.notCalled).to.be.true;
	});

	// This test is broken because we don't consolidate API calls into Promise.all
	// it('makes 2 oracle calls during routine instantiation', async () => {
	// 	const gatewayOracleStub = stub(new GatewayOracle());
	// 	gatewayOracleStub.getWinstonPriceForByteCount.callsFake(() => Promise.resolve(W(123)));
	// 	new ARDataPriceChunkEstimator(false, gatewayOracleStub);
	// 	expect(gatewayOracleStub.getWinstonPriceForByteCount.calledTwice).to.be.true;
	// });

	it('makes two oracle calls after the first price estimation request', async () => {
		await calculator.getBaseWinstonPriceForByteCount(new ByteCount(0));
		expect(spyedOracle.getWinstonPriceForByteCount.calledTwice).to.be.true;
	});

	it('uses correct byte volumes to calibrate', async () => {
		const byteVolumes = [0, 1].map((vol) => new ByteCount(vol));
		const estimator = new ARDataPriceChunkEstimator(false, spyedOracle);
		await estimator.refreshPriceData();

		expect(spyedOracle.getWinstonPriceForByteCount.firstCall.args[0].equals(byteVolumes[0])).to.be.true;
		expect(spyedOracle.getWinstonPriceForByteCount.secondCall.args[0].equals(byteVolumes[1])).to.be.true;
	});

	it('getWinstonPriceForByteCount function returns the expected value', async () => {
		const actualWinstonPriceEstimation = await calculator.getBaseWinstonPriceForByteCount(new ByteCount(100));
		expect(`${actualWinstonPriceEstimation}`).to.equal('1100');
	});

	describe('getByteCountForWinston function', () => {
		it('returns the expected value', async () => {
			const actualByteCountEstimation = await calculator.getByteCountForWinston(W(1100));
			expect(actualByteCountEstimation.equals(new ByteCount(chunkSize))).to.be.true;
		});

		it('makes two oracle calls after the first price estimation request', async () => {
			await calculator.getByteCountForWinston(W(0));
			expect(spyedOracle.getWinstonPriceForByteCount.calledTwice).to.be.true;
		});

		it('returns 0 if provided winston value does not cover baseWinstonPrice', async () => {
			const priceEstimator = new ARDataPriceChunkEstimator(true, spyedOracle);

			// Stub out the returned prices for each byte value to arrive at base price 5 and marginal price 1
			spyedOracle.getWinstonPriceForByteCount.onFirstCall().callsFake(() => Promise.resolve(W(baseFee)));
			spyedOracle.getWinstonPriceForByteCount.onSecondCall().callsFake(() => Promise.resolve(W(oneChunkPrice)));

			expect((await priceEstimator.getByteCountForWinston(W(oneChunkPrice - 1))).equals(new ByteCount(0))).to.be
				.true;
		});
	});

	describe('getByteCountForAR function', () => {
		it('returns the expected value', async () => {
			const actualByteCountEstimation = await calculator.getByteCountForAR(
				AR.from(0.000_000_001_265),
				arDriveCommunityTip
			);
			expect(actualByteCountEstimation.equals(new ByteCount(chunkSize))).to.be.true;
		});

		it('returns 0 if estimation does not cover the minimum winston fee', async () => {
			const actualByteCountEstimation = await calculator.getByteCountForAR(
				AR.from(0.000_000_000_010),
				arDriveCommunityTip
			);
			expect(actualByteCountEstimation.equals(new ByteCount(0))).to.be.true;
		});
	});

	it('getARPriceForByteCount function returns the expected value', async () => {
		const actualARPriceEstimation = await calculator.getARPriceForByteCount(
			new ByteCount(chunkSize),
			arDriveCommunityTip
		);

		expect(`${actualARPriceEstimation}`).to.equal('0.000000001265');
	});

	describe('refreshPriceData function', () => {
		it('avoids duplicate oracle calls', async () => {
			const expected = await calculator.refreshPriceData();
			const actual = await calculator.refreshPriceData();

			expect(actual).to.equal(expected);
			expect(spyedOracle.getWinstonPriceForByteCount.calledTwice).to.be.true;
		});
	});
});
