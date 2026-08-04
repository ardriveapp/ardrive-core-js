import { TransactionID } from './transaction_id';
import { CipherIV } from './types';

export interface CipherIVQueryResult {
	txId: TransactionID;
	cipherIV: CipherIV;
	/**
	 * The on-chain `Cipher` tag of the data transaction (e.g. 'AES256-GCM' or 'AES256-CTR').
	 * Optional: absent for legacy data or callers that only queried the Cipher-IV; consumers
	 * treat an absent value as the AES256-GCM default.
	 */
	cipher?: string;
}
