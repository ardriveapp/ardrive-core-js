import { BigNumber } from 'bignumber.js';
export declare class Winston {
    private amount;
    constructor(amount: BigNumber.Value);
    plus(winston: Winston): Winston;
    minus(winston: Winston): Winston;
    times(multiplier: BigNumber.Value): Winston;
    dividedBy(divisor: BigNumber.Value, round?: 'ROUND_DOWN' | 'ROUND_CEIL'): Winston;
    isGreaterThan(winston: Winston): boolean;
    isGreaterThanOrEqualTo(winston: Winston): boolean;
    static difference(a: Winston, b: Winston): string;
    toString(): string;
    valueOf(): string;
    toJSON(): string;
    static max(...winstons: Winston[]): Winston;
}
export declare function W(amount: BigNumber.Value): Winston;
