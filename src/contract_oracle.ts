import { CommunityContractData } from './smartweave_oracle';

export interface ContractOracle {
	getCommunityTipSetting(height?: number): Promise<number>;
	readContract(txId: string, blockHeight?: number): Promise<CommunityContractData>;
}
