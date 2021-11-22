"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedPhrase = void 0;
const seedPhraseRegex = /^(\b[a-z]+\b(\s+\b|$)){12}$/i;
class SeedPhrase {
    constructor(seedPhrase) {
        this.seedPhrase = seedPhrase;
        if (!this.seedPhrase.match(seedPhraseRegex)) {
            throw new Error(`'${this.seedPhrase}' is not a valid 12 word seed phrase!`);
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'number') {
            throw new Error('Seed phrase cannot be interpreted as a number!');
        }
        return this.toString();
    }
    toString() {
        return this.seedPhrase;
    }
    valueOf() {
        return this.seedPhrase;
    }
    toJSON() {
        return this.toString();
    }
    equals(other) {
        return this.seedPhrase === other.seedPhrase;
    }
}
exports.SeedPhrase = SeedPhrase;
