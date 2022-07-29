import { CreateTransactionInterface } from 'arweave/node/common';
import { CommunityTipSettings, RewardSettings } from '../../types';

type TxAttributes = Partial<CreateTransactionInterface>;

export class TxAttributesToAssemble {
	private readonly txAttributes: TxAttributes = {};

	constructor(txAttributes: TxAttributes = {}) {
		this.txAttributes = txAttributes;
	}

	public addRewardSettings({ feeMultiple, reward }: RewardSettings): void {
		if (reward) {
			if (feeMultiple?.wouldBoostReward()) {
				this.txAttributes.reward = `${feeMultiple.boostedWinstonReward(reward)}`;
			} else {
				this.txAttributes.reward = reward.toString();
			}
		}
	}

	public addCommunityTipSettings(communityTipSettings: CommunityTipSettings | undefined): void {
		if (communityTipSettings) {
			this.txAttributes.target = `${communityTipSettings.communityTipTarget}`;
			this.txAttributes.quantity = `${communityTipSettings.communityWinstonTip}`;
		}
	}

	public assemble(): TxAttributes {
		// TODO: Use a mock arweave server instead
		if (process.env.NODE_ENV === 'test') {
			this.txAttributes.last_tx = 'STUB';
		}

		return this.txAttributes;
	}
}
