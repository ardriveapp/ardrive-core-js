"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADDR = exports.ArweaveAddress = void 0;
class ArweaveAddress {
    constructor(address) {
        this.address = address;
        if (!address.match(new RegExp('^[a-zA-Z0-9_-]{43}$'))) {
            throw new Error('Arweave addresses must be 43 characters in length with characters in the following set: [a-zA-Z0-9_-]');
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'number') {
            throw new Error('Arweave addresses cannot be interpreted as a number!');
        }
        return this.toString();
    }
    equals(other) {
        return this.address === other.address;
    }
    toString() {
        return this.address;
    }
    valueOf() {
        return this.address;
    }
    toJSON() {
        return this.toString();
    }
}
exports.ArweaveAddress = ArweaveAddress;
function ADDR(arAddress) {
    return new ArweaveAddress(arAddress);
}
exports.ADDR = ADDR;
