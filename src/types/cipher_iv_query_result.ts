import { TransactionID } from './transaction_id';
import { CipherIV } from './types';

export interface CipherIVQueryResult {
	txId: TransactionID;
	cipherIV: CipherIV;
}
