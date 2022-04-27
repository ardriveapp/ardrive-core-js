import axios, { AxiosResponse } from 'axios';
import { TransactionID } from '../types';
import { ContractReader } from './contract_oracle';

/**
 *  Oracle class responsible for retrieving and
 *  reading Smartweave Contracts from the Verto cache
 */
export class VertoContractReader implements ContractReader {
	/** Fetches smartweave contracts from the Verto cache */
	public async readContract(txId: TransactionID, height?: number): Promise<unknown> {
		if (height) {
			throw new Error('Unimplemented! Cannot query by block height with Verto');
		}
		const response: AxiosResponse = await axios.get(`https://v2.cache.verto.exchange/${txId}`);
		const contract = response.data;
		return contract.state;
	}
}
