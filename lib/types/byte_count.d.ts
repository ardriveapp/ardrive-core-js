import { Equatable } from './equatable';
export declare class ByteCount implements Equatable<ByteCount> {
    private readonly byteCount;
    constructor(byteCount: number);
    [Symbol.toPrimitive](hint?: string): number | string;
    toString(): string;
    valueOf(): number;
    toJSON(): number;
    equals(other: ByteCount): boolean;
}
