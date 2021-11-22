"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stubTransactionID = exports.TxID = exports.TransactionID = void 0;
const trxIdRegex = /^(\w|-){43}$/;
class TransactionID {
    constructor(transactionId) {
        this.transactionId = transactionId;
        if (!transactionId.match(trxIdRegex)) {
            throw new Error('Transaction ID should be a 43-character, alphanumeric string potentially including "=" and "_" characters.');
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'number') {
            throw new Error('Transaction IDs cannot be interpreted as a number!');
        }
        return this.toString();
    }
    toString() {
        return this.transactionId;
    }
    valueOf() {
        return this.transactionId;
    }
    equals(entityId) {
        return this.transactionId === entityId.transactionId;
    }
    toJSON() {
        return this.toString();
    }
}
exports.TransactionID = TransactionID;
function TxID(transactionId) {
    return new TransactionID(transactionId);
}
exports.TxID = TxID;
exports.stubTransactionID = TxID('0000000000000000000000000000000000000000000');
