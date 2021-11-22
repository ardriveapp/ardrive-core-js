"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnixTime = void 0;
class UnixTime {
    constructor(unixTime) {
        this.unixTime = unixTime;
        if (this.unixTime < 0 || !Number.isInteger(this.unixTime) || !Number.isFinite(this.unixTime)) {
            throw new Error('Unix time must be a positive integer!');
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'string') {
            this.toString();
        }
        return this.unixTime;
    }
    toString() {
        return `${this.unixTime}`;
    }
    valueOf() {
        return this.unixTime;
    }
    toJSON() {
        return this.unixTime;
    }
}
exports.UnixTime = UnixTime;
