import axios, { AxiosResponse } from 'axios';
import { TransactionID } from '../types';
import { ContractReader } from './contract_oracle';

/**
 *  Oracle class responsible for retrieving and
 *  reading Smartweave Contracts from the ArNS Microservice
 */
export class PDSContractCacheServiceContractReader implements ContractReader {
	/** Fetches smartweave contracts from the Verto cache */
	public async readContract(txId: TransactionID): Promise<unknown> {
		const response: AxiosResponse = await axios.get(`https://api.arns.app/v1/contract/${txId}`);
		const contract = response.data;
		return contract.state;
	}
}
