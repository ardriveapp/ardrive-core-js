import { minArDriveCommunityARTip } from './constants';
import { CommunityOracle } from './community_oracle';
import { ContractOracle } from './contract_oracle';
import { SmartWeaveContractOracle } from './smartweave_oracle';

// Default tip of 15% if we cannot pull it from the community contract
const defaultArDriveTipPercentage = 0.15;

// Exact block height of the community vote that set the ArDrive Community Tip
export const communityTipBlockHeight = 578358;

export class ArDriveCommunityOracle implements CommunityOracle {
	/** Current cached value of the ArDrive Community Tip */
	cachedArDriveTipPercentage: number | undefined = undefined;
	isCommTipFromExactSettings = false;

	/** Given an AR data cost, returns a calculated ArDrive community tip amount in AR */
	async getCommunityARTip(arCost: number): Promise<number> {
		const arDriveCommunityTip = arCost * (await this.getArDriveTipPercentage());
		return Math.max(arDriveCommunityTip, minArDriveCommunityARTip);
	}

	/**
	 * Grabs community tip percentage from the cache if it has already been fetched
	 * Otherwise, it will read the SmartWeave contract at the block height of the
	 * vote that set the ArDrive community tip
	 */
	async getArDriveTipPercentage(contractOracle: ContractOracle = new SmartWeaveContractOracle()): Promise<number> {
		if (this.cachedArDriveTipPercentage !== undefined) {
			// Tip percentage has already been fetched, return that value
			return this.cachedArDriveTipPercentage;
		}

		try {
			// Tip has not been calculated, use block height to read from contract (4-6 seconds)
			const communityTipValue = await contractOracle.getCommunityTipSetting(communityTipBlockHeight);

			if (this.cachedArDriveTipPercentage !== undefined) {
				// Percentage was set in the background during the contract read, return that value
				return this.cachedArDriveTipPercentage;
			}
			// Convert to percentage and set in cache to avoid repeat contract reads
			this.cachedArDriveTipPercentage = communityTipValue / 100;
			return this.cachedArDriveTipPercentage;
		} catch (err) {
			// If function errors out, return default percentage
			console.log(err);
			return defaultArDriveTipPercentage;
		}
	}

	/**
	 * Fetches and caches the exact setting from SmartWeave contract (35-50+ seconds)
	 * This function is to be used in the background and not awaited on
	 */
	async setExactTipSettingInBackground(
		contractOracle: ContractOracle = new SmartWeaveContractOracle()
	): Promise<number> {
		if (this.isCommTipFromExactSettings && this.cachedArDriveTipPercentage) {
			return this.cachedArDriveTipPercentage;
		}

		try {
			// Reads full smart contract, returns community tip value (35-50 seconds)
			const arDriveCommTipFromSettings = await contractOracle.getCommunityTipSetting();

			// Exact tip percentage has been retrieved from settings, set in cache
			this.cachedArDriveTipPercentage = arDriveCommTipFromSettings / 100;
			this.isCommTipFromExactSettings = true;

			return this.cachedArDriveTipPercentage;
		} catch (err) {
			console.log(err);
			return 0;
		}
	}
}

// Export as singleton for TS library consumption
const arDriveCommunityOracle = new ArDriveCommunityOracle();
export { arDriveCommunityOracle };
