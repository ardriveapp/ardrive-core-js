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

	// This test is less trustworthy now that we don't use Promise.all on the batch of oracle requests
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
		/* Validating that this works in the following scenarios:
		• 0 bytes: base AR transmission fee
		• 1 bytes: base fee + marginal chunk fee
		• 1 chunk of bytes: base fee + marginal chunk fee
		• 1 chunk of bytes plus 1 byte: base fee + (marginal chunk fee * 2)
		• 2 chunks of bytes: base fee + (marginal chunk fee * 2)
		 */
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(0))}`).to.equal('100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(1))}`).to.equal('1100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize))}`).to.equal('1100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize + 1))}`).to.equal('2100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 2))}`).to.equal('2100');
	});

	describe('getByteCountForWinston function', () => {
		it('returns the expected value', async () => {
			/* Validating that this works in the following scenarios:
			• 0 Winston: 0 bytes
			• 1 Winston: 0 bytes
			• Base fee Winston: 0 bytes
			• Base fee + 1 Winston: 0 bytes
			• Base fee + marginal chunk price Winston: chunksize bytes
			• Base fee + marginal chunk price + 1 Winston: chunksize bytes
			• Base fee + (2 * marginal chunk price) Winston: 2 * chunksize bytes
			*/
			expect((await calculator.getByteCountForWinston(W(0))).equals(new ByteCount(0))).to.be.true;
			expect((await calculator.getByteCountForWinston(W(1))).equals(new ByteCount(0))).to.be.true;
			expect((await calculator.getByteCountForWinston(W(baseFee))).equals(new ByteCount(0))).to.be.true;
			expect((await calculator.getByteCountForWinston(W(baseFee + 1))).equals(new ByteCount(0))).to.be.true;
			expect(
				(await calculator.getByteCountForWinston(W(baseFee + marginalFeePerChunk))).equals(
					new ByteCount(chunkSize)
				)
			).to.be.true;
			expect(
				(await calculator.getByteCountForWinston(W(baseFee + marginalFeePerChunk + 1))).equals(
					new ByteCount(chunkSize)
				)
			).to.be.true;
			expect(
				(await calculator.getByteCountForWinston(W(baseFee + 2 * marginalFeePerChunk))).equals(
					new ByteCount(2 * chunkSize)
				)
			).to.be.true;
		});

		it('makes two oracle calls after the first price estimation request', async () => {
			await calculator.getByteCountForWinston(W(0));
			expect(spyedOracle.getWinstonPriceForByteCount.calledTwice).to.be.true;
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
			expect(+actualByteCountEstimation).to.equal(0);
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
