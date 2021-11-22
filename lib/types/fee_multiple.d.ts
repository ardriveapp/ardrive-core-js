export declare class FeeMultiple {
    private readonly feeMultiple;
    constructor(feeMultiple: number);
    [Symbol.toPrimitive](hint?: string): string | number;
    toString(): string;
    valueOf(): number;
    toJSON(): number;
    wouldBoostReward(): boolean;
    boostReward(reward: string): string;
}
