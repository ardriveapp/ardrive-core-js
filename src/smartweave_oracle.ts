import { ContractOracle } from './contract_oracle';
import { readContract } from 'smartweave';
import { arweave } from './arweave';
import { communityTxId } from './constants';

export interface CommunityContractData {
	votes: [Record<string, unknown>];
	settings: [string, unknown][];
}

/**
 * The SmartWeaveContractOracle handles reading the ArDrive Community Contract
 * and returning the community tip as a value
 *
 * Thrown errors from this class are all to be caught in ardrive_community_oracle
 *
 * @TODO Discuss a standard way to handle errors moving forward
 */
export class SmartWeaveContractOracle implements ContractOracle {
	/** @TODO Add timeout to check for readContract calls that take too long and gracefully handles errors */
	async readContract(txId: string, blockHeight?: number): Promise<CommunityContractData> {
		return readContract(arweave, txId, blockHeight);
	}

	/* Grabs last vote from block height of community vote setting the community fee value */
	getTipSettingFromContractVotes(contract: CommunityContractData): number {
		const arDriveCommTipFromVotes = contract.votes[contract.votes.length - 1].value;

		if (arDriveCommTipFromVotes === undefined) {
			throw new Error('Value does not exist on the smart contract community fee vote');
		}

		if (typeof arDriveCommTipFromVotes !== 'number') {
			throw new Error('Value on smart contract community fee vote is not a number');
		}

		if (arDriveCommTipFromVotes < 0) {
			throw new Error('Value on smart contract community fee vote is set to a negative number');
		}

		return arDriveCommTipFromVotes;
	}

	/* Grabs fee directly from the settings at the bottom of the contract */
	getTipSettingFromContractSettings(contract: CommunityContractData): number {
		const arDriveCommTipFromSettings: [string, unknown] | undefined = contract.settings.find(
			(setting) => setting[0] === 'fee'
		);

		if (!arDriveCommTipFromSettings) {
			throw new Error('Fee does not exist on smart contract settings');
		}

		if (typeof arDriveCommTipFromSettings[1] !== 'number') {
			throw new Error('Fee on smart contract settings is not a number');
		}

		if (arDriveCommTipFromSettings[1] < 0) {
			throw new Error('Fee on smart contract community settings is set to a negative number');
		}

		return arDriveCommTipFromSettings[1];
	}

	/**
	 * Gets community tip setting from the ArDrive SmartWeave contract
	 *
	 * If a block height is provided, it will read the contract at that height
	 * and derive the value from the last vote on that version of the SmartWeave
	 * contract. Otherwise, it will read the full length of the contract (currently 35-50 seconds)
	 *
	 * @example
	 * ```ts
	 * await new SmartWeaveContractOracle().getCommunityTipSetting(communityTipBlockHeight)
	 * ```
	 */
	async getCommunityTipSetting(height?: number): Promise<number> {
		const contract = await this.readContract(communityTxId, height);

		if (height) {
			return this.getTipSettingFromContractVotes(contract);
		} else {
			return this.getTipSettingFromContractSettings(contract);
		}
	}
}
