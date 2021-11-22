import { ContractReader } from './contract_oracle';
import { CommunityOracle } from './community_oracle';
import Arweave from 'arweave';
import { ArweaveAddress, Winston } from '../types';
/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
 */
export declare const minArDriveCommunityWinstonTip: Winston;
/**
 * Oracle class responsible for determining the community tip
 * and selecting the PST token holder for tip distribution
 *
 * TODO: Unit testing for important functions
 */
export declare class ArDriveCommunityOracle implements CommunityOracle {
    readonly arweave: Arweave;
    constructor(arweave: Arweave, contractReaders?: ContractReader[]);
    private readonly contractOracle;
    private defaultContractReaders;
    /**
     * Given a Winston data cost, returns a calculated ArDrive community tip amount in Winston
     *
     * TODO: Use big int library on Winston types
     */
    getCommunityWinstonTip(winstonCost: Winston): Promise<Winston>;
    /**
     * Gets a random ArDrive token holder based off their weight (amount of tokens they hold)
     *
     * TODO: This is mostly copy-paste from core -- refactor into a more testable state
     */
    selectTokenHolder(): Promise<ArweaveAddress>;
}
