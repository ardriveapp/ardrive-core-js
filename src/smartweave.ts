import { readContract } from 'smartweave';
import { weightedRandom } from './common';
import { arweave } from './public/arweave';

// ArDrive Profit Sharing Community Smart Contract
const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';
const communityTipBlockHeight = 578358;

// Default tip of 15% if we cannot pull it from the community contract
const defaultArDriveTipPercentage = 0.15;
let arDriveTipPercentage = 0;
let isTipPercentageFromSettings = false;

// Calls the ArDrive Community Smart Contract to pull the tip
export async function getArDriveTipPercentage(): Promise<number> {
	if (!isTipPercentageFromSettings) {
		// If tip was not gathered from exact setting, send background task to gather, do not await
		getExactArDriveTipSetting();
	}
	try {
		if (arDriveTipPercentage === 0) {
			// Tip has not been calculated, read from contract (4-6 seconds)
			const contract = await readContract(arweave, communityTxId, communityTipBlockHeight);
			const communityTipValue = contract.votes[contract.votes.length - 1].value;

			if (communityTipValue && typeof communityTipValue === 'number') {
				// Set percentage in cache to avoid repeat checks
				arDriveTipPercentage = communityTipValue / 100;
				return arDriveTipPercentage;
			} else {
				return defaultArDriveTipPercentage;
			}
		} else {
			// Tip percentage already calculated, return value
			return arDriveTipPercentage;
		}
	} catch (err) {
		return defaultArDriveTipPercentage;
	}
}

let isTipFromSettingsLoading = false;
/** Derives the exact setting from smartweave contract (35-50 seconds) */
async function getExactArDriveTipSetting() {
	// Do not run if contract is currently being read
	if (isTipFromSettingsLoading) return;
	isTipFromSettingsLoading = true;
	try {
		const contract = await readContract(arweave, communityTxId);
		const arDriveCommTipFromSettings = contract.settings.find(
			(setting: (string | number)[]) => setting[0].toString().toLowerCase() === 'fee'
		);

		arDriveTipPercentage = arDriveCommTipFromSettings;
		isTipPercentageFromSettings = true;
	} catch (err) {
		console.log(err);
	} finally {
		isTipFromSettingsLoading = false;
	}
}

// Gets a random ArDrive token holder based off their weight (amount of tokens they hold)
export async function selectTokenHolder(): Promise<string | undefined> {
	// Read the ArDrive Smart Contract to get the latest state
	const state = await readContract(arweave, communityTxId);
	const balances = state.balances;
	const vault = state.vault;

	// Get the total number of token holders
	let total = 0;
	for (const addr of Object.keys(balances)) {
		total += balances[addr];
	}

	// Check for how many tokens the user has staked/vaulted
	for (const addr of Object.keys(vault)) {
		if (!vault[addr].length) continue;

		const vaultBalance = vault[addr]
			.map((a: { balance: number; start: number; end: number }) => a.balance)
			.reduce((a: number, b: number) => a + b, 0);

		total += vaultBalance;

		if (addr in balances) {
			balances[addr] += vaultBalance;
		} else {
			balances[addr] = vaultBalance;
		}
	}

	// Create a weighted list of token holders
	const weighted: { [addr: string]: number } = {};
	for (const addr of Object.keys(balances)) {
		weighted[addr] = balances[addr] / total;
	}
	// Get a random holder based off of the weighted list of holders
	const randomHolder = weightedRandom(weighted);
	return randomHolder;
}
