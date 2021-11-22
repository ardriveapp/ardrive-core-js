import { BigNumber } from 'bignumber.js';
import { Winston } from './winston';
export declare class AR {
    readonly winston: Winston;
    constructor(winston: Winston);
    static from(arValue: BigNumber.Value): AR;
    toString(): string;
    valueOf(): string;
    toWinston(): Winston;
    toJSON(): string;
}
