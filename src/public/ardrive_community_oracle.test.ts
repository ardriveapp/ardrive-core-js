import { expect } from 'chai';
import { stub } from 'sinon';
import { stubInterface } from 'ts-sinon';
import { minArDriveCommunityARTip } from '../constants';
import { ArDriveCommunityOracle, communityTipBlockHeight } from './ardrive_community_oracle';
import { ContractOracle } from './contract_oracle';

describe('The ArDriveCommunityOracle class', () => {
	it('`getArDriveTipPercentage` function returns a decimal to be used as a percentage', async () => {
		const smartWeaveOracleStub = stubInterface<ContractOracle>();
		smartWeaveOracleStub.getCommunityTipSetting.returns(
			new Promise((resolve) => {
				resolve(123);
			})
		);

		const output = await new ArDriveCommunityOracle().getArDriveTipPercentage(smartWeaveOracleStub);

		expect(output).to.equal(1.23);
		expect(smartWeaveOracleStub.getCommunityTipSetting.calledOnceWithExactly(communityTipBlockHeight)).to.be.true;

		return;
	});

	it('`setExactTipSettingInBackground` returns a decimal to be used as a percentage', async () => {
		const smartWeaveOracleStub = stubInterface<ContractOracle>();
		smartWeaveOracleStub.getCommunityTipSetting.returns(
			new Promise((resolve) => {
				resolve(567);
			})
		);

		const output = await new ArDriveCommunityOracle().setExactTipSettingInBackground(smartWeaveOracleStub);

		expect(output).to.equal(5.67);
		expect(smartWeaveOracleStub.getCommunityTipSetting.calledOnceWithExactly()).to.be.true;

		return;
	});

	it('`getCommunityARTip` function returns the `minArDriveCommunityARTip` if the calculated community tip is a smaller value', async () => {
		const arDriveCommunityOracle = new ArDriveCommunityOracle();

		const getArDriveTipSpy = stub(arDriveCommunityOracle, 'getArDriveTipPercentage').callsFake(() =>
			Promise.resolve(1)
		);

		const output = await arDriveCommunityOracle.getCommunityARTip(minArDriveCommunityARTip - 0.000_000_000_001);

		expect(output).to.equal(minArDriveCommunityARTip);
		expect(getArDriveTipSpy.calledOnce).to.be.true;

		return;
	});
});
