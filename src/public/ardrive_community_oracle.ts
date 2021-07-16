import { readContract } from 'smartweave';
import { sleep } from '../common';
import { communityTxId, minArDriveCommunityARTip } from '../constants';
import { arweave } from './arweave';
import { CommunityOracle } from './community_oracle';

// Default tip of 15% if we cannot pull it from the community contract
const defaultArDriveTipPercentage = 0.15;
let arDriveTipPercentage: number | undefined = undefined;

let isTipPercentageLatestFromSmartWeave = false;
let isFetchingTipSetting = false;

// Exact block height of the community vote that set the ArDrive Community Fee
const communityTipBlockHeight = 578358;

export class ArDriveCommunityOracle implements CommunityOracle {
	async getCommunityARTip(arCost: number): Promise<number> {
		const arDriveCommunityTip = arCost * (await this.getArDriveTipPercentage());
		return Math.max(arDriveCommunityTip, minArDriveCommunityARTip);
	}

	// Calls the ArDrive Community Smart Contract to pull the tip percentage
	async getArDriveTipPercentage(): Promise<number> {
		if (!isTipPercentageLatestFromSmartWeave) {
			// If tip was not gathered from exact setting, start background task to gather, do not await
			this.setExactTipSettingInBackground();
		}

		if (arDriveTipPercentage !== undefined) {
			// Tip percentage has already been fetched, return the value
			return arDriveTipPercentage;
		}

		try {
			// Tip has not been calculated, read from contract (4-6 seconds)
			const contract = await readContract(arweave, communityTxId, communityTipBlockHeight);

			// Grabs last vote from block height of community vote setting the community fee value
			const communityTipValue = contract.votes[contract.votes.length - 1].value;

			if (communityTipValue) {
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
	 * @TODO Ideally this task should begin on start up to have the best
	 *       chance of retrieving the exact value before the user needs it
	 */
	async setExactTipSettingInBackground(): Promise<void> {
		while (isFetchingTipSetting) {
			// Do not run if contract is currently being read
			await sleep(500);
		}

		if (isTipPercentageLatestFromSmartWeave) {
			// Exact tip percentage has already been derived, return early
			return;
		}

		isFetchingTipSetting = true;

		try {
			const contract = await readContract(arweave, communityTxId);
			const arDriveCommTipFromSettings: ['fee', number] = contract.settings.find(
				(setting: (string | number)[]) => setting[0].toString().toLowerCase() === 'fee'
			);

			if (arDriveCommTipFromSettings) {
				// Exact tip percentage has been retrieved from settings, set in cache
				arDriveTipPercentage = arDriveCommTipFromSettings[1];
				isTipPercentageLatestFromSmartWeave = true;
			}
		} catch (err) {
			console.log(err);
		} finally {
			isFetchingTipSetting = false;
		}
	}
}