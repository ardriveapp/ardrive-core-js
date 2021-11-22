import { Equatable } from './equatable';
export declare class ArweaveAddress implements Equatable<ArweaveAddress> {
    private readonly address;
    constructor(address: string);
    [Symbol.toPrimitive](hint?: string): string;
    equals(other: ArweaveAddress): boolean;
    toString(): string;
    valueOf(): string;
    toJSON(): string;
}
export declare function ADDR(arAddress: string): ArweaveAddress;
