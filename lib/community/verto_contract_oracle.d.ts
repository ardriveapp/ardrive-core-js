import { TransactionID } from '../types';
import { ContractReader } from './contract_oracle';
/**
 *  Oracle class responsible for retrieving and
 *  reading Smartweave Contracts from the Verto cache
 */
export declare class VertoContractReader implements ContractReader {
    /** Fetches smartweave contracts from the Verto cache */
    readContract(txId: TransactionID): Promise<unknown>;
}
