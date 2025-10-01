/* eslint-disable @typescript-eslint/no-unused-vars */
import { CommunityOracle } from '../community/community_oracle';
import { ArweaveAddress, Winston, ADDR, W } from '../types';

// Minimum ArDrive community tip (copied from ardrive_community_oracle to avoid Node.js dependencies)
const minArDriveCommunityWinstonTip = W(10_000_000);

/**
 * Browser-compatible Community Oracle that provides minimal functionality.
 * Returns fixed tip amounts and a default token holder address.
 */
export class CommunityOracleWeb implements CommunityOracle {
	/**
	 * Returns a fixed minimum community tip for browser environments
	 */
	async getCommunityWinstonTip(_winstonCost: Winston): Promise<Winston> {
		// Return minimum tip amount for browser environments
		return Promise.resolve(minArDriveCommunityWinstonTip);
	}

	/**
	 * Returns a default ArDrive community address for browser environments
	 */
	async selectTokenHolder(): Promise<ArweaveAddress> {
		// Return the ArDrive community address as default
		// This is a placeholder - in production, this should be fetched from a contract oracle
		return Promise.resolve(ADDR('vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw'));
	}
}
