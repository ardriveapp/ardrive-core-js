import { Equatable } from './equatable';
export declare class SeedPhrase implements Equatable<SeedPhrase> {
    private readonly seedPhrase;
    constructor(seedPhrase: string);
    [Symbol.toPrimitive](hint?: string): string;
    toString(): string;
    valueOf(): string;
    toJSON(): string;
    equals(other: SeedPhrase): boolean;
}
