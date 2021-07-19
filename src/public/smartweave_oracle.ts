import { ContractOracle } from './community_oracle';
import { readContract } from 'smartweave';
import { arweave } from './arweave';
import { communityTxId } from '../constants';

export class SmartWeaveContractOracle implements ContractOracle {
	async getTipSetting(height?: number): Promise<number> {
		// If height is provided, read at block height (4-6 seconds)
		// Otherwise, read the full length of the contract (35-50 seconds)
		const contract = await readContract(arweave, communityTxId, height);

		if (height) {
			// Grabs last vote from block height of community vote setting the community fee value
			return contract.votes[contract.votes.length - 1].value;
		} else {
			// Grabs fee directly from the settings at the bottom of the contract
			const arDriveCommTipFromSettings: ['fee', number] = contract.settings.find(
				(setting: (string | number)[]) => setting[0].toString().toLowerCase() === 'fee'
			);
			return arDriveCommTipFromSettings[1];
		}
	}
}
