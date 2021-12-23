import { Equatable } from './equatable';

const txIdRegex = /^(\w|-){43}$/;
export class TransactionID implements Equatable<TransactionID> {
	constructor(private readonly transactionId: string) {
		if (!transactionId.match(txIdRegex)) {
			throw new Error(
				'Transaction ID should be a 43-character, alphanumeric string potentially including "=" and "_" characters.'
			);
		}
	}

	[Symbol.toPrimitive](hint?: string): string {
		if (hint === 'number') {
			throw new Error('Transaction IDs cannot be interpreted as a number!');
		}

		return this.toString();
	}

	toString(): string {
		return this.transactionId;
	}

	valueOf(): string {
		return this.transactionId;
	}

	equals(entityId: TransactionID): boolean {
		return this.transactionId === entityId.transactionId;
	}

	toJSON(): string {
		return this.toString();
	}
}

export function TxID(transactionId: string): TransactionID {
	return new TransactionID(transactionId);
}

export const stubTransactionID = TxID('0000000000000000000000000000000000000000000');
