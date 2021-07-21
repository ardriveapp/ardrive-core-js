import { minArDriveCommunityARTip } from '../constants';
import { CommunityOracle } from './community_oracle';
import { ContractOracle } from './contract_oracle';
import { SmartWeaveContractOracle } from './smartweave_oracle';

// Default tip of 15% if we cannot pull it from the community contract
const defaultArDriveTipPercentage = 0.15;
let arDriveTipPercentage: number | undefined = undefined;

// Exact block height of the community vote that set the ArDrive Community Fee
const communityTipBlockHeight = 578358;

export class ArDriveCommunityOracle implements CommunityOracle {
	async getCommunityARTip(arCost: number): Promise<number> {
		const arDriveCommunityTip = arCost * (await this.getArDriveTipPercentage());
		return Math.max(arDriveCommunityTip, minArDriveCommunityARTip);
	}

	convertToPercentage(value: number): number {
		return value / 100;
	}

	/**
	 * Grabs community tip percentage from the cache if it has already been fetched
	 * Otherwise, it will read the SmartWeave contract at the block height of the
	 * vote that set the ArDrive community tip
	 */
	async getArDriveTipPercentage(contractOracle: ContractOracle = new SmartWeaveContractOracle()): Promise<number> {
		if (arDriveTipPercentage !== undefined) {
			// Tip percentage has already been fetched, return that value
			return arDriveTipPercentage;
		}

		try {
			// Tip has not been calculated, use block height to read from contract (4-6 seconds)
			const communityTipValue = await contractOracle.getCommunityTipSetting(communityTipBlockHeight);

			if (communityTipValue) {
				if (arDriveTipPercentage !== undefined) {
					// Percentage was set in the background during the contract read, return that value
					return arDriveTipPercentage;
				}
				// Convert to percentage and set in cache to avoid repeat contract reads
				arDriveTipPercentage = this.convertToPercentage(communityTipValue);
				return arDriveTipPercentage;
			} else {
				return defaultArDriveTipPercentage;
			}
		} catch (err) {
			// If function errors out, return default percentage
			console.log(err);
			return defaultArDriveTipPercentage;
		}
	}

	/**
	 * Derives the exact setting from smartweave contract (35-50+ seconds)
	 * This function is to be used in the background and not awaited on
	 * When the setting is derived, it will set it in the cache (arDriveTipPercentage)
	 */
	async setExactTipSettingInBackground(
		contractOracle: ContractOracle = new SmartWeaveContractOracle()
	): Promise<number> {
		try {
			// Reads full smart contract, returns community tip value (35-50 seconds)
			const arDriveCommTipFromSettings = await contractOracle.getCommunityTipSetting();

			if (arDriveCommTipFromSettings) {
				// Exact tip percentage has been retrieved from settings, set in cache
				arDriveTipPercentage = this.convertToPercentage(arDriveCommTipFromSettings);
				return arDriveTipPercentage;
			} else {
				return 0;
			}
		} catch (err) {
			console.log(err);
			return 0;
		}
	}
}

if (process.env.NODE_ENV !== 'test') {
	// Sends background task after initial startup, but not during testing
	setTimeout(() => {
		new ArDriveCommunityOracle().setExactTipSettingInBackground();
	}, 500);
}
