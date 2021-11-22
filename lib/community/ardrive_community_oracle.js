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
exports.ArDriveCommunityOracle = exports.minArDriveCommunityWinstonTip = void 0;
const common_1 = require("../utils/common");
const ardrive_contract_oracle_1 = require("./ardrive_contract_oracle");
const smartweave_contract_oracle_1 = require("./smartweave_contract_oracle");
const verto_contract_oracle_1 = require("./verto_contract_oracle");
const types_1 = require("../types");
/**
 * Minimum ArDrive community tip from the Community Improvement Proposal Doc:
 * https://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo
 */
exports.minArDriveCommunityWinstonTip = types_1.W(10000000);
/**
 * Oracle class responsible for determining the community tip
 * and selecting the PST token holder for tip distribution
 *
 * TODO: Unit testing for important functions
 */
class ArDriveCommunityOracle {
    constructor(arweave, contractReaders) {
        this.arweave = arweave;
        this.defaultContractReaders = [
            new verto_contract_oracle_1.VertoContractReader(),
            new smartweave_contract_oracle_1.SmartweaveContractReader(this.arweave)
        ];
        this.contractOracle = new ardrive_contract_oracle_1.ArDriveContractOracle(contractReaders ? contractReaders : this.defaultContractReaders);
    }
    /**
     * Given a Winston data cost, returns a calculated ArDrive community tip amount in Winston
     *
     * TODO: Use big int library on Winston types
     */
    getCommunityWinstonTip(winstonCost) {
        return __awaiter(this, void 0, void 0, function* () {
            const communityTipPercentage = yield this.contractOracle.getTipPercentageFromContract();
            const arDriveCommunityTip = winstonCost.times(communityTipPercentage);
            return types_1.Winston.max(arDriveCommunityTip, exports.minArDriveCommunityWinstonTip);
        });
    }
    /**
     * Gets a random ArDrive token holder based off their weight (amount of tokens they hold)
     *
     * TODO: This is mostly copy-paste from core -- refactor into a more testable state
     */
    selectTokenHolder() {
        return __awaiter(this, void 0, void 0, function* () {
            // Read the ArDrive Smart Contract to get the latest state
            const contract = yield this.contractOracle.getCommunityContract();
            const balances = contract.balances;
            const vault = contract.vault;
            // Get the total number of token holders
            let total = 0;
            for (const addr of Object.keys(balances)) {
                total += balances[addr];
            }
            // Check for how many tokens the user has staked/vaulted
            for (const addr of Object.keys(vault)) {
                if (!vault[addr].length)
                    continue;
                const vaultBalance = vault[addr]
                    .map((a) => a.balance)
                    .reduce((a, b) => a + b, 0);
                total += vaultBalance;
                if (addr in balances) {
                    balances[addr] += vaultBalance;
                }
                else {
                    balances[addr] = vaultBalance;
                }
            }
            // Create a weighted list of token holders
            const weighted = {};
            for (const addr of Object.keys(balances)) {
                weighted[addr] = balances[addr] / total;
            }
            // Get a random holder based off of the weighted list of holders
            const randomHolder = common_1.weightedRandom(weighted);
            if (randomHolder === undefined) {
                throw new Error('Token holder target could not be determined for community tip distribution..');
            }
            return types_1.ADDR(randomHolder);
        });
    }
}
exports.ArDriveCommunityOracle = ArDriveCommunityOracle;
