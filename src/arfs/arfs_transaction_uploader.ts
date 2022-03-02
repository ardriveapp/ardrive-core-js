import Transaction from 'arweave/node/lib/transaction';
import { getError } from 'arweave/node/lib/error';
import Arweave from 'arweave';
import { AxiosResponse } from 'axios';

interface Chunk {
	data_root: string;
	data_size: string;
	data_path: string;
	offset: string;
	chunk: string;
}

// Maximum amount of chunks we will upload in the body.
const MAX_CHUNKS_IN_BODY = 1;
const MAX_CHUNKS_BATCH_SIZE = 128;

const MAX_ERRORS = 2;

// We assume these errors are intermittent and we can try again after a delay:
// - not_joined
// - timeout
// - data_root_not_found (we may have hit a node that just hasn't seen it yet)
// - exceeds_disk_pool_size_limit
// We also try again after any kind of unexpected network errors

// Errors from /chunk we should never try and continue on.
const FATAL_CHUNK_UPLOAD_ERRORS = [
	'invalid_json',
	'chunk_too_big',
	'data_path_too_big',
	'offset_too_big',
	'data_size_too_big',
	'chunk_proof_ratio_not_attractive',
	'invalid_proof'
];

// Amount we will delay on receiving an error response but do want to continue.
const ERROR_DELAY = 1000 * 40;

export class ArFSTransactionUploader {
	private chunkOffset = 0;
	private txPosted = false;
	private lastRequestTimeEnd = 0;
	private totalErrors = 0;

	// public data: Uint8Array;
	// public lastResponseStatus = 0;
	public lastResponseError = '';

	public get isComplete(): boolean {
		return this.txPosted && this.uploadedChunks === this.totalChunks;
	}

	public get totalChunks(): number {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.transaction.chunks!.chunks.length;
	}

	private uploadedChunks = 0;
	private chunksInFlight = 0;

	public get pctComplete(): number {
		return Math.trunc((this.uploadedChunks / this.totalChunks) * 100);
	}

	private arweave: Arweave;
	private transaction: Transaction;

	constructor({ transaction, arweave }: { transaction: Transaction; arweave: Arweave }) {
		if (!transaction.id) {
			throw new Error(`Transaction is not signed`);
		}
		if (!transaction.chunks) {
			throw new Error(`Transaction chunks not prepared`);
		}

		// Make a copy of transaction, zeroing the data so we can serialize.
		// this.data = transaction.data;
		this.arweave = this.arweave = arweave;
		this.transaction = transaction;
	}

	/**
	 * Uploads the next part of the transaction.
	 * On the first call this posts the transaction
	 * itself and on any subsequent calls uploads the
	 * next chunk until it completes.
	 */
	public async batchUploadChunks(): Promise<void> {
		if (this.isComplete) {
			throw new Error(`Upload is already complete`);
		}
		if (this.chunksInFlight >= MAX_CHUNKS_BATCH_SIZE) {
			return;
		}

		if (!this.txPosted) {
			await this.postTransaction();
			return;
		}

		console.log('this.totalChunks', this.totalChunks);
		console.log('this.chunkOffset', this.chunkOffset);
		const numOfChunksToGet = Math.min(
			this.totalChunks - this.chunkOffset,
			MAX_CHUNKS_BATCH_SIZE - this.chunksInFlight
		);
		console.log('getting this many chunks', numOfChunksToGet);

		const chunks = (() => {
			const chunksToSend: Chunk[] = [];
			for (let index = this.chunkOffset; index < this.chunkOffset + numOfChunksToGet; index++) {
				chunksToSend.push(this.transaction.getChunk(index, this.transaction.data));
			}
			return chunksToSend;
		})();
		console.log('chunks.length', chunks.length);
		this.chunkOffset += chunks.length;
		console.log('new this.chunkOffset after getting chunks', this.chunkOffset);

		await Promise.all(chunks.map((chunk) => this.uploadChunk(chunk)));
	}

	private async uploadChunk(chunk: Chunk) {
		this.chunksInFlight++;

		let resp: AxiosResponse<any> | string;

		try {
			resp = await this.arweave.api.post(`chunk`, chunk);
		} catch (err) {
			resp = err;
		}
		this.lastRequestTimeEnd = Date.now();

		if (respIsError(resp) || resp.status !== 200) {
			this.lastResponseError = respIsError(resp) ? resp : getError(resp);
			// console.log('getError(resp)', getError(resp))
			console.error('error:', this.lastResponseError);

			if (FATAL_CHUNK_UPLOAD_ERRORS.includes(this.lastResponseError)) {
				throw new Error(`Fatal error uploading chunk ${this.chunkOffset}: ${this.lastResponseError}`);
			} else {
				this.totalErrors++;
				if (this.totalErrors >= MAX_ERRORS) {
					throw new Error(`Unable to complete chunk upload: ${this.lastResponseError}`);
				} else {
					console.log('delaying');
					// Jitter delay after failed chunk uploads -- subtract up to 30% from 40 seconds
					const delay = Math.max(this.lastRequestTimeEnd + ERROR_DELAY - Date.now(), ERROR_DELAY);
					await new Promise((res) => setTimeout(res, delay - delay * Math.random() * 0.3));

					// Retry the chunk
					console.log('retrying a chunk');
					await this.uploadChunk(chunk);
				}
			}
		} else {
			this.uploadedChunks++;
		}
		this.chunksInFlight--;
	}

	// POST to /tx
	private async postTransaction(): Promise<void> {
		console.log('posting');
		const uploadInBody = this.totalChunks <= MAX_CHUNKS_IN_BODY;

		if (uploadInBody) {
			console.log('upload in body');
			// Post the transaction with data.
			const resp = await this.arweave.api.post(`tx`, this.transaction).catch((e) => {
				console.error(e);
				return { status: -1, data: { error: e.message } };
			});

			this.lastRequestTimeEnd = Date.now();
			this.transaction.data = new Uint8Array(0);

			if (resp.status >= 200 && resp.status < 300) {
				// We are complete.
				this.txPosted = true;
				this.chunkOffset = MAX_CHUNKS_IN_BODY;
				this.uploadedChunks++;
				return;
			}
			this.lastResponseError = getError(resp);
			throw new Error(`Unable to upload transaction: ${resp.status}, ${this.lastResponseError}`);
		}

		// Post the transaction with no data.
		const txWithoutData = new Transaction(Object.assign({}, this.transaction, { data: new Uint8Array(0) }));
		const resp = await this.arweave.api.post(`tx`, txWithoutData);
		this.lastRequestTimeEnd = Date.now();

		if (!(resp.status >= 200 && resp.status < 300)) {
			this.lastResponseError = getError(resp);
			throw new Error(`Unable to upload transaction: ${resp.status}, ${this.lastResponseError}`);
		}
		this.txPosted = true;
	}
}

function respIsError(resp: AxiosResponse<any> | string): resp is string {
	return resp === typeof 'string';
}
