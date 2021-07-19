import { minArDriveCommunityARTip } from '../constants';
import { CommunityOracle, ContractOracle } from './community_oracle';
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

	// Calls the ArDrive Community Smart Contract to pull the tip percentage
	async getArDriveTipPercentage(contractOracle: ContractOracle = new SmartWeaveContractOracle()): Promise<number> {
		if (arDriveTipPercentage !== undefined) {
			// Tip percentage has already been fetched, return the value
			return arDriveTipPercentage;
		}

		try {
			// Tip has not been calculated, use block height to read from contract (4-6 seconds)
			const communityTipValue = await contractOracle.getTipSetting(communityTipBlockHeight);

			if (communityTipValue) {
				if (arDriveTipPercentage !== undefined) {
					// Percentage was set in the background during the contract read, return value
					return arDriveTipPercentage;
				}
				// Set percentage in cache to avoid repeat checks
				arDriveTipPercentage = communityTipValue / 100; // Converts to percentage
				return arDriveTipPercentage;
			} else {
				return defaultArDriveTipPercentage;
			}
		} catch (err) {
			// If function errors out, return default percentage
			return defaultArDriveTipPercentage;
		}
	}

	/**
	 * Derives the exact setting from smartweave contract (35-50+ seconds)
	 * This function is to be used in the background and not awaited on
	 * When the setting is derived, it will set it in the cache (arDriveTipPercentage)
	 *
	 *
	 * @TODO Ideally this task should begin on start up to have the best
	 *       chance of retrieving the exact value before the user needs it
	 */
	async setExactTipSettingInBackground(
		contractOracle: ContractOracle = new SmartWeaveContractOracle()
	): Promise<number> {
		try {
			// Reads full smart contract, returns community tip value (35-50 seconds)
			const arDriveCommTipFromSettings = await contractOracle.getTipSetting();

			if (arDriveCommTipFromSettings) {
				// Exact tip percentage has been retrieved from settings, set in cache
				arDriveTipPercentage = arDriveCommTipFromSettings / 100;
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
