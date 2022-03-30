import Transaction from 'arweave/node/lib/transaction';
import { ProgressCallback } from '../arfs/multi_chunk_tx_uploader';
import { defaultMaxConcurrentChunks } from './constants';

export class TxProgressLogger {
	public constructor(private transaction: Transaction, private debounceMs = 500) {
		if (!transaction.chunks) {
			throw new Error(`Transaction chunks not prepared`);
		}
	}

	// Only log progress if total chunks of transaction is greater than the max concurrent chunks setting
	private shouldProgressLog: boolean =
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.transaction.chunks!.chunks.length > defaultMaxConcurrentChunks;

	private progressDebounce = false;

	public progressCallback: ProgressCallback = (pct) => {
		if (this.shouldProgressLog && (!this.progressDebounce || pct === 100)) {
			console.error(`Transaction ${this.transaction.id} Upload Progress: ${pct}%`);

			this.triggerDebounce();
		}
	};

	private triggerDebounce(): void {
		this.progressDebounce = true;

		setTimeout(() => {
			this.progressDebounce = false;
		}, this.debounceMs);
	}
}
