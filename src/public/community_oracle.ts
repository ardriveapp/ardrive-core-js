export interface CommunityOracle {
	getCommunityARTip(arCost: number): Promise<number>;
}

export interface ContractOracle {
	getTipSetting(height?: number): Promise<number>;
}
