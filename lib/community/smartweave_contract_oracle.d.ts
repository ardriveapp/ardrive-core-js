import Arweave from 'arweave';
import { TransactionID } from '../types';
import { ContractReader } from './contract_oracle';
/**
 *  Oracle class responsible for retrieving and reading
 *  Smartweave Contracts from Arweave with the `smartweave` package
 */
export declare class SmartweaveContractReader implements ContractReader {
    private readonly arweave;
    constructor(arweave: Arweave);
    /** Fetches smartweave contracts from Arweave with smartweave-js */
    readContract(txId: TransactionID): Promise<unknown>;
}
