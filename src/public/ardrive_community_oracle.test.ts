import { expect } from 'chai';
import { stubInterface } from 'ts-sinon';
import { ArDriveCommunityOracle } from './ardrive_community_oracle';
import { ContractOracle } from './contract_oracle';

describe('The ArDriveCommunityOracle class', () => {
	const smartWeaveOracleStub = stubInterface<ContractOracle>();
	smartWeaveOracleStub.getCommunityTipSetting.returns(
		new Promise((resolve) => {
			resolve(123);
		})
	);

	it('returns a decimal to be used as a percentage using the `getArDriveTipPercentage` function', async () => {
		const output = await new ArDriveCommunityOracle().getArDriveTipPercentage(smartWeaveOracleStub);

		expect(output).to.equal(1.23);
	});

	it('returns a decimal to be used as a percentage using the `setExactTipSettingInBackground` function', async () => {
		const output = await new ArDriveCommunityOracle().setExactTipSettingInBackground(smartWeaveOracleStub);

		expect(output).to.equal(1.23);
	});
});
