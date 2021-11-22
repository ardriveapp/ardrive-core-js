import { Equatable } from './equatable';
export declare class TransactionID implements Equatable<TransactionID> {
    private readonly transactionId;
    constructor(transactionId: string);
    [Symbol.toPrimitive](hint?: string): string;
    toString(): string;
    valueOf(): string;
    equals(entityId: TransactionID): boolean;
    toJSON(): string;
}
export declare function TxID(transactionId: string): TransactionID;
export declare const stubTransactionID: TransactionID;
