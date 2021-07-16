import { expect } from 'chai';
import { estimateArCost } from './node';
import { ArweaveOracle } from './public/arweave_oracle';
import { stubInterface } from 'ts-sinon';
import { CommunityOracle } from './public/community_oracle';
import { minArDriveCommunityARTip } from './constants';

describe('The estimateArCost function', function () {
	const arweaveOracleStub = stubInterface<ArweaveOracle>();
	arweaveOracleStub.getWinstonPriceForByteCount.returns(
		new Promise((resolve) => {
			resolve(12_345_678);
		})
	);

	const communityOracleStub = stubInterface<CommunityOracle>();
	communityOracleStub.getCommunityARTip.returns(
		new Promise((resolve) => {
			resolve(0.000_010_000_000);
		})
	);

	it('calculates an estimation and returns an AR value', async () => {
		const output = await estimateArCost(23_456, 5, arweaveOracleStub, communityOracleStub);

		expect(output).to.equal(0.000_022_345_678);

		// Verify calls
		expect(arweaveOracleStub.getWinstonPriceForByteCount.calledOnceWithExactly(39_506)).to.be.true;
		expect(communityOracleStub.getCommunityARTip.calledOnceWithExactly(0.000_012_345_678)).to.be.true;

		return;
	});
});
