import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { W, AR, ByteCount, ArDriveCommunityTip } from '../types';
import { ARDataPriceChunkEstimator } from './ar_data_price_chunk_estimator';

describe('ARDataPriceChunkEstimator class', () => {
	let spyedOracle: SinonStubbedInstance<ArweaveOracle>;
	let calculator: ARDataPriceChunkEstimator;
	const chunkSize = 256 * Math.pow(2, 10);
	const baseFee = 100;
	const marginalFeePerChunk = 1000;

	const arDriveCommunityTip: ArDriveCommunityTip = { minWinstonFee: W(10), tipPercentage: 0.15 };

	beforeEach(() => {
		// Simulate actual AR pricing
		spyedOracle = stub(new GatewayOracle());
		spyedOracle.getWinstonPriceForByteCount.callsFake((input) =>
			Promise.resolve(W(Math.ceil(+input / chunkSize) * marginalFeePerChunk + baseFee))
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
		• 5 chunks of bytes: base fee + (marginal chunk fee * 2) + 1
		• 10 chunks of bytes: base fee + (marginal chunk fee * 2) + 2
		 */
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(0))}`).to.equal('100');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(1))}`).to.equal('1101');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize))}`).to.equal('1101');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize + 1))}`).to.equal('2102');
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 2))}`).to.equal('2102');
		// Extra winston for 5th chunk
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 5))}`).to.equal('5105');
		// Two extra winston for 10th chunk
		expect(`${await calculator.getBaseWinstonPriceForByteCount(new ByteCount(chunkSize * 10))}`).to.equal('10110');
	});

	describe('getByteCountForWinston function', () => {
		it('returns the expected value', async () => {
			/* Validating that this works in the following scenarios:
			• 0 Winston: 0 bytes
			• 1 Winston: 0 bytes
			• Base fee Winston: 0 bytes
			• Base fee + 1 Winston: 0 bytes
			• Base fee + marginal chunk price Winston + 1 Winston: chunksize bytes
			• Base fee + marginal chunk price + 2 Winston: chunksize bytes
			• Base fee + (2 * marginal chunk price) + 2  Winston: 2 * chunksize bytes
			• Base fee + (5 * marginal chunk price) + 5 Winston: 5 * chunksize bytes
			• Base fee + (10 * marginal chunk price) + 10 Winston: 10 * chunksize bytes
			• Base fee + (10 * marginal chunk price) + 9 Winston: 9 * chunksize bytes
			• Base fee + (8000 * marginal chunk price) Winston: 7999 * chunksize bytes
			• Base fee + (8000 * marginal chunk price) + 8000 Winston: 8000 * chunksize bytes
			*/
			expect(+(await calculator.getByteCountForWinston(W(0)))).to.equal(0);
			expect(+(await calculator.getByteCountForWinston(W(1)))).to.equal(0);
			expect(+(await calculator.getByteCountForWinston(W(baseFee)))).to.equal(0);
			expect(+(await calculator.getByteCountForWinston(W(baseFee + 1)))).to.equal(0);
			// Add one extra winston per chunk
			expect(+(await calculator.getByteCountForWinston(W(baseFee + marginalFeePerChunk)))).to.equal(0);

			console.log(+(await calculator.getByteCountForWinston(W(baseFee + marginalFeePerChunk + 1))));
			expect(+(await calculator.getByteCountForWinston(W(baseFee + marginalFeePerChunk + 1)))).to.equal(
				chunkSize
			);
			expect(+(await calculator.getByteCountForWinston(W(baseFee + 2 * marginalFeePerChunk + 2)))).to.equal(
				2 * chunkSize
			);
			expect(+(await calculator.getByteCountForWinston(W(baseFee + 5 * marginalFeePerChunk + 5)))).to.equal(
				5 * chunkSize
			);
			expect(+(await calculator.getByteCountForWinston(W(baseFee + 10 * marginalFeePerChunk + 10)))).to.equal(
				10 * chunkSize
			);
			expect(+(await calculator.getByteCountForWinston(W(baseFee + 10 * marginalFeePerChunk + 9)))).to.equal(
				9 * chunkSize
			);
			expect(
				// But extra winston per chunk it will return 8000 chunks
				+(await calculator.getByteCountForWinston(W(baseFee + 8000 * marginalFeePerChunk + 8000)))
			).to.equal(8000 * chunkSize);
		});

		it('makes two oracle calls after the first price estimation request', async () => {
			await calculator.getByteCountForWinston(W(0));
			expect(spyedOracle.getWinstonPriceForByteCount.calledTwice).to.be.true;
		});
	});

	describe('getByteCountForAR function', () => {
		it('returns the expected value', async () => {
			const actualByteCountEstimation = await calculator.getByteCountForAR(
				AR.from(0.000_000_001_267),
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

		expect(`${actualARPriceEstimation}`).to.equal('0.000000001266');
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
