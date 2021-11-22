"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArDriveContractOracle = exports.communityTxId = void 0;
const types_1 = require("../types");
// ArDrive Profit Sharing Community Smart Contract
exports.communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';
const maxReadContractAttempts = 3;
const initialContractReader = 0;
const initialContractAttempts = 0;
/**
 * Oracle class responsible for retrieving the correct data fields from
 * the ArDrive Community Contract. This class can utilize several different
 * contract readers and will fallback to other readers if one fails
 *
 * @remarks Will begin fetching data from default contract reader on construction
 */
class ArDriveContractOracle {
    constructor(
    /**
     * Array of contract readers to use as fall back if one fails
     * Uses contract reader at index 0 first then descends down the list
     */
    contractReaders, skipSetup = true) {
        this.contractReaders = contractReaders;
        if (!skipSetup) {
            // Get contract data upon construction
            this.getCommunityContract();
        }
    }
    /**
     * Reads a smart contract with the current contract reader
     *
     * @remarks Will fallback to other contract readers when one fails
     */
    readContract(txId) {
        return __awaiter(this, void 0, void 0, function* () {
            let contract;
            let currentContractReader = initialContractReader;
            let readContractAttempts = initialContractAttempts;
            while (!contract) {
                try {
                    // Get contract with current contract reader's readContract implementation
                    contract = yield this.contractReaders[currentContractReader].readContract(txId);
                }
                catch (error) {
                    console.error(`Contract could not be fetched: ${error}`);
                    readContractAttempts++;
                    if (readContractAttempts >= maxReadContractAttempts) {
                        // Max attempts for contract reader has been reached
                        if (currentContractReader === this.contractReaders.length - 1) {
                            // Current contract reader is the last fallback, throw an error
                            throw new Error(`Max contract read attempts has been reached on the last fallback contract reader..`);
                        }
                        // Else fallback to next reader
                        const nextContractReaderIndex = currentContractReader + 1;
                        readContractAttempts = initialContractAttempts;
                        currentContractReader = nextContractReaderIndex;
                        console.log('Falling back to next contract reader..');
                    }
                    else {
                        console.log('Retrying with current contract reader..');
                    }
                }
            }
            return contract;
        });
    }
    /**
     * @returns the ArDrive Community Smartweave Contract
     * @throws when the Community Contract cannot be fetched or is returned as falsy
     * @throws when the Community Contract is returned in an unexpected shape
     */
    getCommunityContract() {
        return __awaiter(this, void 0, void 0, function* () {
            // Contract data already cached, return contract data
            if (this.communityContract) {
                return this.communityContract;
            }
            // Contract promise still resolving, return promise with contract data
            if (this.contractPromise) {
                return this.contractPromise;
            }
            // Begin new contract read; cast result to known ArDrive Community Contract type
            this.contractPromise = this.readContract(types_1.TxID(exports.communityTxId));
            this.communityContract = yield this.contractPromise;
            delete this.contractPromise;
            return this.communityContract;
        });
    }
    /**
     * Grabs fee directly from the settings at the bottom of the community contract
     *
     * @throws When community fee cannot be read from the contract, is negative, or is the wrong type
     */
    getTipPercentageFromContract() {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = yield this.getCommunityContract();
            const arDriveCommTipFromSettings = contract.settings.find((setting) => setting[0] === 'fee');
            if (!arDriveCommTipFromSettings) {
                throw new Error('Fee does not exist on smart contract settings');
            }
            if (typeof arDriveCommTipFromSettings[1] !== 'number') {
                throw new Error('Fee on smart contract settings is not a number');
            }
            if (arDriveCommTipFromSettings[1] < 0) {
                throw new Error('Fee on smart contract community settings is set to a negative number');
            }
            return arDriveCommTipFromSettings[1] / 100;
        });
    }
}
exports.ArDriveContractOracle = ArDriveContractOracle;
