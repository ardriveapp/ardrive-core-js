import { expect } from 'chai';
import { stubInterface } from 'ts-sinon';
import { ArDriveCommunityOracle } from './ardrive_community_oracle';
import { ContractOracle } from './community_oracle';

describe('Using the ArDriveCommunityOracle class,', () => {
	const smartWeaveOracleStub = stubInterface<ContractOracle>();
	smartWeaveOracleStub.getTipSetting.returns(
		new Promise((resolve) => {
			resolve(15);
		})
	);

	it('the function getArDriveTipPercentage returns a decimal to be used as a percentage', async () => {
		const output = await new ArDriveCommunityOracle().getArDriveTipPercentage(smartWeaveOracleStub);

		expect(output).to.equal(0.15);
	});

	it('the function setExactTipSettingInBackground returns a decimal to be used as a percentage', async () => {
		const output = await new ArDriveCommunityOracle().setExactTipSettingInBackground(smartWeaveOracleStub);

		expect(output).to.equal(0.15);
	});
});
