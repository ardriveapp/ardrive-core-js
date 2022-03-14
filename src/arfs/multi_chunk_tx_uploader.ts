import Transaction from 'arweave/node/lib/transaction';
import { defaultMaxConcurrentChunks } from '../utils/constants';
import { GatewayAPI } from '../utils/gateway_api';

export interface Chunk {
	chunk: string;
	data_root: string;
	data_size: string;
	offset: string;
	data_path: string;
}

/** Maximum amount of chunks we will upload in the transaction body */
const MAX_CHUNKS_IN_BODY = 1;

interface MultiChunkTxUploaderConstructorParams {
	gatewayApi: GatewayAPI;
	transaction: Transaction;
	maxConcurrentChunks?: number;
	progressCallback?: (pctComplete: number) => void;
}

/**
 *  A transaction uploader class that has been modified to handle uploading
 *  the chunks of a transaction concurrently to the specified gateway url
 *
 * @example
 *
 *  ```ts
 * 	await transaction.prepareChunks(transaction.data);
 *
 *		const transactionUploader = new MultiChunkTxUploader({
 *			transaction,
 *			gatewayApi: new GatewayAPI({ gatewayUrl: new URL('https://arweave.net:443') })
 *		});
 *
 *		await transactionUploader.batchUploadChunks();
 * ```
 */
export class MultiChunkTxUploader {
	private chunkOffset = 0;
	private txPosted = false;
	private uploadedChunks = 0;
	private hasFailedRequests = false;

	public get isComplete(): boolean {
		return this.txPosted && this.uploadedChunks === this.totalChunks;
	}

	public get totalChunks(): number {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.transaction.chunks!.chunks.length;
	}

	public get pctComplete(): number {
		return Math.trunc((this.uploadedChunks / this.totalChunks) * 100);
	}

	private gatewayApi: GatewayAPI;
	private transaction: Transaction;
	private maxConcurrentChunks: number;
	private progressCallback?: (pctComplete: number) => void;

	constructor({
		gatewayApi,
		transaction,
		maxConcurrentChunks = defaultMaxConcurrentChunks,
		progressCallback
	}: MultiChunkTxUploaderConstructorParams) {
		if (!transaction.id) {
			throw new Error(`Transaction is not signed`);
		}
		if (!transaction.chunks) {
			throw new Error(`Transaction chunks not prepared`);
		}

		this.gatewayApi = gatewayApi;
		this.transaction = transaction;
		this.maxConcurrentChunks = maxConcurrentChunks;
		this.progressCallback = progressCallback;
	}

	/**
	 * Uploads a transaction and all of its chunks until the upload is complete or has failed
	 *
	 * TODO: Convert this to a stream to report back event triggered progress
	 *
	 * @throws when any requests have failed beyond the maxRetries setting
	 */
	public async batchUploadChunks(): Promise<void> {
		if (this.hasFailedRequests) {
			throw new Error('Transaction upload has failed requests!');
		}

		if (!this.txPosted) {
			await this.postTransactionHeader();

			if (this.isComplete) {
				return;
			}
		}

		const numRemainingChunks = this.totalChunks - this.chunkOffset;
		const numOfConcurrentUploadPromises = Math.min(numRemainingChunks, this.maxConcurrentChunks);

		const uploadPromises: Promise<void>[] = [];
		for (let index = 0; index < numOfConcurrentUploadPromises; index++) {
			uploadPromises.push(this.uploadChunk());
		}

		await Promise.all(uploadPromises);
	}

	/**
	 * Iterates through and posts each chunk to the `/chunk` endpoint on the provided gateway
	 *
	 * @remarks Will continue posting chunks until all chunks have been posted
	 * @remarks Reports progress if class was initialized with a `progressCallback`
	 *
	 * @throws when a chunk request has exceeded the maxRetries and has failed to post
	 */
	private async uploadChunk(): Promise<void> {
		while (this.chunkOffset < this.totalChunks && !this.hasFailedRequests) {
			const chunk = this.transaction.getChunk(this.chunkOffset++, this.transaction.data);

			try {
				await this.gatewayApi.postChunk(chunk);
			} catch (err) {
				this.hasFailedRequests = true;
				throw new Error(`Too many errors encountered while posting chunks: ${err}`);
			}

			this.uploadedChunks++;
			this.progressCallback?.(this.pctComplete);
		}

		return;
	}

	/**
	 * Posts the transaction's header to the `/tx` endpoint on the provided gateway
	 *
	 * @remarks Will post chunks with header if those chunks will fit into the transaction header's body
	 *
	 * @throws when a post header request has exceeded the maxRetries and has failed to post
	 */
	private async postTransactionHeader(): Promise<void> {
		const uploadInBody = this.totalChunks <= MAX_CHUNKS_IN_BODY;

		// We will send the data with the header if chunks will fit into transaction header body
		// Otherwise we send the header with no data
		const transactionToUpload = uploadInBody
			? this.transaction
			: new Transaction(Object.assign({}, this.transaction, { data: new Uint8Array(0) }));

		try {
			await this.gatewayApi.postTxHeader(transactionToUpload);
		} catch (err) {
			this.hasFailedRequests = true;
			throw new Error(`Too many errors encountered while posting transaction header:  ${err}`);
		}

		this.txPosted = true;

		if (uploadInBody) {
			this.chunkOffset += this.totalChunks;
			this.uploadedChunks += this.totalChunks;
		}

		return;
	}
}
