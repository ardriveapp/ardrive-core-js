"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AR = void 0;
const bignumber_js_1 = require("bignumber.js");
const winston_1 = require("./winston");
class AR {
    constructor(winston) {
        this.winston = winston;
    }
    static from(arValue) {
        const bigWinston = new bignumber_js_1.BigNumber(arValue).shiftedBy(12);
        const numDecimalPlaces = bigWinston.decimalPlaces();
        if (numDecimalPlaces > 0) {
            throw new Error(`The AR amount must have a maximum of 12 digits of precision, but got ${numDecimalPlaces + 12}`);
        }
        return new AR(winston_1.W(bigWinston));
    }
    toString() {
        bignumber_js_1.BigNumber.config({ DECIMAL_PLACES: 12 });
        const w = new bignumber_js_1.BigNumber(this.winston.toString(), 10);
        return w.shiftedBy(-12).toFixed();
    }
    valueOf() {
        return this.toString();
    }
    toWinston() {
        return this.winston;
    }
    toJSON() {
        return this.toString();
    }
}
exports.AR = AR;
