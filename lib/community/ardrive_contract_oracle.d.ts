import { CommunityContractData, CommunityTipPercentage } from './contract_types';
import { ContractOracle, ContractReader } from './contract_oracle';
import { TransactionID } from '../types';
export declare const communityTxId = "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ";
/**
 * Oracle class responsible for retrieving the correct data fields from
 * the ArDrive Community Contract. This class can utilize several different
 * contract readers and will fallback to other readers if one fails
 *
 * @remarks Will begin fetching data from default contract reader on construction
 */
export declare class ArDriveContractOracle implements ContractOracle {
    /**
     * Array of contract readers to use as fall back if one fails
     * Uses contract reader at index 0 first then descends down the list
     */
    private readonly contractReaders;
    constructor(
    /**
     * Array of contract readers to use as fall back if one fails
     * Uses contract reader at index 0 first then descends down the list
     */
    contractReaders: ContractReader[], skipSetup?: boolean);
    private communityContract?;
    private contractPromise?;
    /**
     * Reads a smart contract with the current contract reader
     *
     * @remarks Will fallback to other contract readers when one fails
     */
    readContract(txId: TransactionID): Promise<unknown>;
    /**
     * @returns the ArDrive Community Smartweave Contract
     * @throws when the Community Contract cannot be fetched or is returned as falsy
     * @throws when the Community Contract is returned in an unexpected shape
     */
    getCommunityContract(): Promise<CommunityContractData>;
    /**
     * Grabs fee directly from the settings at the bottom of the community contract
     *
     * @throws When community fee cannot be read from the contract, is negative, or is the wrong type
     */
    getTipPercentageFromContract(): Promise<CommunityTipPercentage>;
}
