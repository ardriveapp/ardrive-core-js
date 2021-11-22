export declare class UnixTime {
    private readonly unixTime;
    constructor(unixTime: number);
    [Symbol.toPrimitive](hint?: string): number | string;
    toString(): string;
    valueOf(): number;
    toJSON(): number;
}
