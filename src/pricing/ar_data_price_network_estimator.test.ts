import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { W, AR, ByteCount, ArDriveCommunityTip } from '../types';
import { ARDataPriceChunkEstimator } from './ar_data_price_chunk_estimator';
import { ARDataPriceNetworkEstimator } from './ar_data_price_network_estimator';

describe('ARDataPriceNetworkEstimator class', () => {
	let spiedOracle: SinonStubbedInstance<ArweaveOracle>;
	let calculator: ARDataPriceNetworkEstimator;
	const chunkSize = 256 * Math.pow(2, 10);
	const baseFee = 100;
	const marginalFeePerChunk = 1000;

	const arDriveCommunityTip: ArDriveCommunityTip = { minWinstonFee: W(10), tipPercentage: 0.15 };

	beforeEach(() => {
		// Simulate actual AR pricing
		spiedOracle = stub(new GatewayOracle());
		spiedOracle.getWinstonPriceForByteCount.callsFake((input) =>
			Promise.resolve(W(Math.ceil(+input / chunkSize) * marginalFeePerChunk + baseFee))
		);
		calculator = new ARDataPriceNetworkEstimator(spiedOracle);
	});

	// This test is less trustworthy now that we don't use Promise.all on the batch of oracle requests
	it('can be instantiated without making oracle calls', async () => {
		const gatewayOracleStub = stub(new GatewayOracle());
		gatewayOracleStub.getWinstonPriceForByteCount.callsFake(() => Promise.resolve(W(123)));
		new ARDataPriceChunkEstimator(true, gatewayOracleStub);
		expect(gatewayOracleStub.getWinstonPriceForByteCount.notCalled).to.be.true;
	});

	it('makes one oracle call after the first price estimation request', async () => {
		await calculator.getBaseWinstonPriceForByteCount(new ByteCount(0));

		expect(spiedOracle.getWinstonPriceForByteCount.calledOnce).to.be.true;
	});

	it('will return cached price if it matches the chunk size of a previous estimation', async () => {
		const twoByteResult = await calculator.getBaseWinstonPriceForByteCount(new ByteCount(2));
		expect(spiedOracle.getWinstonPriceForByteCount.calledOnce).to.be.true;

		const nineByteResult = await calculator.getBaseWinstonPriceForByteCount(new ByteCount(9));

		// Oracle was not called again
		expect(spiedOracle.getWinstonPriceForByteCount.calledOnce).to.be.true;

		// The results are expected to be the same, because they are both 1 chunk
		expect(+twoByteResult).to.equal(+nineByteResult);
	});

	it('getWinstonPriceForByteCount function returns the expected value', async () => {
		/* Validating that this works in the following scenarios:
		• 0 bytes: base AR transmission fee
		• 1 bytes: base fee + marginal chunk fee
		• 1 chunk of bytes: base fee + marginal chunk fee
		• 1 chunk of bytes plus 1 byte: base fee + (marginal chunk fee * 2)
		• 2 chunks of bytes: base fee + (marginal chunk fee * 2)
		• 5 chunks of bytes: base fee + (marginal chunk fee * 2) + 1
		• 10 chunks of bytes: base fee + (marginal chunk fee * 2) + 2
		 */
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(0))}`).to.equal('100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(1))}`).to.equal('1100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize))}`).to.equal('1100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize + 1))}`).to.equal('2100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 2))}`).to.equal('2100');
		// Extra winston for 5th chunk
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 5))}`).to.equal('5100');
		// Two extra winston for 10th chunk
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 10))}`).to.equal('10100');
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
			• Base fee + (5 * marginal chunk price) + 1 Winston: 5 * chunksize bytes
			• Base fee + (10 * marginal chunk price): 10 * chunksize bytes
			• Base fee + (8000 * marginal chunk price) + 1600 Winston: 8000 * chunksize bytes
			*/
			expect((await calculator.getByteCountForWinston(W(0))).equals(new ByteCount(0))).to.be.true;
			expect((await calculator.getByteCountForWinston(W(1))).equals(new ByteCount(0))).to.be.true;
			expect((await calculator.getByteCountForWinston(W(baseFee))).equals(new ByteCount(0))).to.be.true;

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
			expect(
				(await calculator.getByteCountForWinston(W(baseFee + 5 * marginalFeePerChunk))).equals(
					new ByteCount(5 * chunkSize)
				)
			).to.be.true;

			expect(
				(await calculator.getByteCountForWinston(W(baseFee + 10 * marginalFeePerChunk))).equals(
					new ByteCount(10 * chunkSize)
				)
			).to.be.true;

			expect(
				(await calculator.getByteCountForWinston(W(baseFee + 8000 * marginalFeePerChunk))).equals(
					new ByteCount(8000 * chunkSize)
				)
			).to.be.true;
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
});
