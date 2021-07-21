import { expect } from 'chai';
import { spy, stub } from 'sinon';
import { communityTxId } from '../constants';
import { CommunityContractData, SmartWeaveContractOracle } from './smartweave_oracle';

describe('The SmartWeaveContractOracle class', () => {
	const smartWeaveContractOracle = new SmartWeaveContractOracle();

	const stubContractData: CommunityContractData = {
		votes: [
			{
				value: 999
			}
		],
		settings: [['fee', 555]]
	};

	it('getCommunityTipSetting function retrieves tip setting from votes when a block height is provided', async () => {
		const readContractSpy = stub(smartWeaveContractOracle, 'readContract').callsFake(() =>
			Promise.resolve(stubContractData)
		);

		const voteSettingSpy = spy(smartWeaveContractOracle, 'getTipSettingFromContractVotes');

		const output = await smartWeaveContractOracle.getCommunityTipSetting(654);
		expect(output).to.equal(999);

		expect(readContractSpy.calledOnceWithExactly(communityTxId, 654)).to.be.true;
		expect(voteSettingSpy.calledOnceWithExactly(stubContractData)).to.be.true;

		return;
	});

	it('getCommunityTipSetting function retrieves tip setting from contract settings when a block height is NOT provided', async () => {
		const readContractSpy = stub(smartWeaveContractOracle, 'readContract').callsFake(() =>
			Promise.resolve(stubContractData)
		);

		const exactSettingSpy = spy(smartWeaveContractOracle, 'getTipSettingFromContractSettings');

		const output = await smartWeaveContractOracle.getCommunityTipSetting();
		expect(output).to.equal(555);

		expect(readContractSpy.calledOnceWithExactly(communityTxId, undefined)).to.be.true;
		expect(exactSettingSpy.calledOnceWithExactly(stubContractData)).to.be.true;

		return;
	});

	it('getTipSettingFromContractVotes function retrieves the correct votes value', () => {
		expect(smartWeaveContractOracle.getTipSettingFromContractVotes(stubContractData)).to.equal(999);
	});

	it('getTipSettingFromContractSettings function retrieves the correct settings value', () => {
		expect(smartWeaveContractOracle.getTipSettingFromContractSettings(stubContractData)).to.equal(555);
	});
});
