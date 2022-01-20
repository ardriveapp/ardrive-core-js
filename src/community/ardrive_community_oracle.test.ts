import { expect } from 'chai';
import { fakeArweave, stubCommunityContract } from '../../tests/stubs';
import { W } from '../types';
import { ArDriveCommunityOracle } from './ardrive_community_oracle';

describe('The ArDriveCommunityOracle', () => {
	const stubContractReader = {
		async readContract() {
			return stubCommunityContract;
		}
	};

	describe('getCommunityWinstonTip method', () => {
		it('returns the expected community tip result', async () => {
			const communityOracle = new ArDriveCommunityOracle(fakeArweave, [stubContractReader]);

			// 50% stubbed fee of 100 million Winston is 50 million winston
			expect(+(await communityOracle.getCommunityWinstonTip(W(100_000_000)))).to.equal(50_000_000);
		});

		it('returns the expected minimum community tip result when the derived tip is below the minimum', async () => {
			const communityOracle = new ArDriveCommunityOracle(fakeArweave, [stubContractReader]);

			expect(+(await communityOracle.getCommunityWinstonTip(W(10_000_000)))).to.equal(10_000_000);
		});
	});

	describe('selectTokenHolder method', () => {
		it('returns the expected arweave address', async () => {
			const communityOracle = new ArDriveCommunityOracle(fakeArweave, [stubContractReader]);

			expect(`${await communityOracle.selectTokenHolder()}`).to.equal(
				'abcdefghijklmnopqrxtuvwxyz123456789ABCDEFGH'
			);
		});
	});
});
