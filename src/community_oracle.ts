import { ContractOracle } from './contract_oracle';

export interface CommunityOracle {
	cachedArDriveTipPercentage: number | undefined;
	isCommTipFromExactSettings: boolean;

	getCommunityARTip(arCost: number): Promise<number>;
	getArDriveTipPercentage(contractOracle: ContractOracle): Promise<number>;
	setExactTipSettingInBackground(contractOracle: ContractOracle): Promise<number>;
}
