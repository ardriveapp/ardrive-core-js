"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeMultiple = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
class FeeMultiple {
    constructor(feeMultiple) {
        this.feeMultiple = feeMultiple;
        if (this.feeMultiple < 1.0 || Number.isNaN(feeMultiple) || !Number.isFinite(feeMultiple)) {
            throw new Error('Fee multiple must be >= 1.0!');
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'string') {
            return this.toString();
        }
        return this.feeMultiple;
    }
    toString() {
        return `${this.feeMultiple}`;
    }
    valueOf() {
        return this.feeMultiple;
    }
    toJSON() {
        return this.feeMultiple;
    }
    wouldBoostReward() {
        return this.feeMultiple > 1.0;
    }
    boostReward(reward) {
        // Round up with because fractional Winston will cause an Arweave API failure
        return new bignumber_js_1.default(reward).times(new bignumber_js_1.default(this.feeMultiple)).toFixed(0, bignumber_js_1.default.ROUND_UP);
    }
}
exports.FeeMultiple = FeeMultiple;
