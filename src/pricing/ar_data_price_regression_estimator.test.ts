import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { expect } from 'chai';
import { SinonStubbedInstance, stub } from 'sinon';
import { ARDataPriceRegressionEstimator } from './ar_data_price_regression_estimator';
import { ArDriveCommunityTip, W, AR, ByteCount } from '../types';

describe('ARDataPriceEstimator class', () => {
	let spyedOracle: SinonStubbedInstance<ArweaveOracle>;
	let calculator: ARDataPriceRegressionEstimator;

	const arDriveCommunityTip: ArDriveCommunityTip = { minWinstonFee: W(10), tipPercentage: 0.15 };

	beforeEach(() => {
		// Set pricing algo up as x = y (bytes = Winston)
		spyedOracle = stub(new GatewayOracle());
		spyedOracle.getWinstonPriceForByteCount.callsFake((input) => Promise.resolve(W(+input)));
		calculator = new ARDataPriceRegressionEstimator(true, spyedOracle);
	});

	it('can be instantiated without making oracle calls', async () => {
		const gatewayOracleStub = stub(new GatewayOracle());
		gatewayOracleStub.getWinstonPriceForByteCount.callsFake(() => Promise.resolve(W(123)));
		new ARDataPriceRegressionEstimator(true, gatewayOracleStub);
		expect(gatewayOracleStub.getWinstonPriceForByteCount.notCalled).to.be.true;
	});

	it('makes 3 oracle calls during routine instantiation', async () => {
		const gatewayOracleStub = stub(new GatewayOracle());
		gatewayOracleStub.getWinstonPriceForByteCount.callsFake(() => Promise.resolve(W(123)));
		new ARDataPriceRegressionEstimator(false, gatewayOracleStub);
		expect(gatewayOracleStub.getWinstonPriceForByteCount.calledThrice).to.be.true;
	});

	it('makes three oracle calls after the first price estimation request', async () => {
		await calculator.getBaseWinstonPriceForByteCount(new ByteCount(0));
		expect(spyedOracle.getWinstonPriceForByteCount.calledThrice).to.be.true;
	});

	it('throws an error when constructed with a byte volume array that has only one number', () => {
		expect(() => new ARDataPriceRegressionEstimator(true, spyedOracle, [new ByteCount(1)])).to.throw(Error);
	});

	it('uses byte volumes from provided byte volume array', () => {
		const byteVolumes = [1, 5, 10].map((vol) => new ByteCount(vol));
		new ARDataPriceRegressionEstimator(false, spyedOracle, byteVolumes);

		expect(spyedOracle.getWinstonPriceForByteCount.firstCall.args[0].equals(byteVolumes[0])).to.be.true;
		expect(spyedOracle.getWinstonPriceForByteCount.secondCall.args[0].equals(byteVolumes[1])).to.be.true;
		expect(spyedOracle.getWinstonPriceForByteCount.thirdCall.args[0].equals(byteVolumes[2])).to.be.true;
	});

	it('getWinstonPriceForByteCount function returns the expected value', async () => {
		const actualWinstonPriceEstimation = await calculator.getBaseWinstonPriceForByteCount(new ByteCount(100));
		expect(`${actualWinstonPriceEstimation}`).to.equal('100');
	});

	describe('getByteCountForWinston function', () => {
		it('returns the expected value', async () => {
			const actualByteCountEstimation = await calculator.getByteCountForWinston(W(100));
			expect(actualByteCountEstimation.equals(new ByteCount(100))).to.be.true;
		});

		it('makes three oracle calls after the first price estimation request', async () => {
			await calculator.getByteCountForWinston(W(0));
			expect(spyedOracle.getWinstonPriceForByteCount.calledThrice).to.be.true;
		});

		it('returns 0 if provided winston value does not cover baseWinstonPrice', async () => {
			const stubRegressionByteVolumes = [0, 1].map((vol) => new ByteCount(vol));

			const priceEstimator = new ARDataPriceRegressionEstimator(true, spyedOracle, stubRegressionByteVolumes);

			// Stub out the returned prices for each byte value to arrive at base price 5 and marginal price 1
			spyedOracle.getWinstonPriceForByteCount.onFirstCall().callsFake(() => Promise.resolve(W(5)));
			spyedOracle.getWinstonPriceForByteCount.onSecondCall().callsFake(() => Promise.resolve(W(6)));

			// Expect 4 to be reduced to 0 because it does not cover baseWinstonPrice of 5
			expect((await priceEstimator.getByteCountForWinston(W(4))).equals(new ByteCount(0))).to.be.true;
		});
	});

	describe('getByteCountForAR function', () => {
		it('returns the expected value', async () => {
			const actualByteCountEstimation = await calculator.getByteCountForAR(
				AR.from(0.000_000_000_100),
				arDriveCommunityTip
			);
			expect(actualByteCountEstimation.equals(new ByteCount(87))).to.be.true;
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
			new ByteCount(100),
			arDriveCommunityTip
		);

		expect(`${actualARPriceEstimation}`).to.equal('0.000000000115');
	});

	describe('refreshPriceData function', () => {
		it('avoids duplicate oracle calls', async () => {
			const expected = await calculator.refreshPriceData();
			const actual = await calculator.refreshPriceData();

			expect(actual).to.equal(expected);
			expect(spyedOracle.getWinstonPriceForByteCount.calledThrice).to.be.true;
		});
	});
});
