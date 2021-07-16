export interface CommunityOracle {
	getCommunityARTip(arCost: number): Promise<number>;
}
