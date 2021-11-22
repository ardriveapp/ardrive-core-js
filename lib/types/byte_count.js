"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ByteCount = void 0;
class ByteCount {
    constructor(byteCount) {
        this.byteCount = byteCount;
        if (!Number.isFinite(this.byteCount) || !Number.isInteger(this.byteCount) || this.byteCount < 0) {
            throw new Error('Byte count must be a non-negative integer value!');
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'string') {
            this.toString();
        }
        return this.byteCount;
    }
    toString() {
        return `${this.byteCount}`;
    }
    valueOf() {
        return this.byteCount;
    }
    toJSON() {
        return this.byteCount;
    }
    equals(other) {
        return this.byteCount === other.byteCount;
    }
}
exports.ByteCount = ByteCount;
