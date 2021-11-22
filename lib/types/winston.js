"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.W = exports.Winston = void 0;
const bignumber_js_1 = require("bignumber.js");
class Winston {
    constructor(amount) {
        this.amount = new bignumber_js_1.BigNumber(amount);
        if (this.amount.isLessThan(0) || !this.amount.isInteger()) {
            throw new Error('Winston value should be a non-negative integer!');
        }
    }
    plus(winston) {
        return W(this.amount.plus(winston.amount));
    }
    minus(winston) {
        return W(this.amount.minus(winston.amount));
    }
    times(multiplier) {
        return W(this.amount.times(multiplier).decimalPlaces(0, bignumber_js_1.BigNumber.ROUND_DOWN));
    }
    dividedBy(divisor, round = 'ROUND_CEIL') {
        // TODO: Best rounding strategy? Up or down?
        return W(this.amount
            .dividedBy(divisor)
            .decimalPlaces(0, round === 'ROUND_DOWN' ? bignumber_js_1.BigNumber.ROUND_DOWN : bignumber_js_1.BigNumber.ROUND_CEIL));
    }
    isGreaterThan(winston) {
        return this.amount.isGreaterThan(winston.amount);
    }
    isGreaterThanOrEqualTo(winston) {
        return this.amount.isGreaterThanOrEqualTo(winston.amount);
    }
    static difference(a, b) {
        return a.amount.minus(b.amount).toString();
    }
    toString() {
        return this.amount.toFixed();
    }
    valueOf() {
        return this.amount.toFixed();
    }
    toJSON() {
        return this.toString();
    }
    static max(...winstons) {
        bignumber_js_1.BigNumber.max();
        return winstons.reduce((max, next) => (next.amount.isGreaterThan(max.amount) ? next : max));
    }
}
exports.Winston = Winston;
function W(amount) {
    return new Winston(amount);
}
exports.W = W;
