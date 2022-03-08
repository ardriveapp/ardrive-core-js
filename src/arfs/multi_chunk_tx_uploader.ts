import Transaction from 'arweave/node/lib/transaction';
import axios, { AxiosResponse } from 'axios';

/** Maximum amount of chunks we will upload in the transaction body */
const MAX_CHUNKS_IN_BODY = 1;

/**
 * Error delay for the first failed request for a transaction header post or chunk upload
 * Subsequent requests will delay longer with an exponential back off strategy
 */
const INITIAL_ERROR_DELAY = 500; // 500ms

// We assume these errors are intermittent and we can try again after a delay:
// - not_joined
// - timeout
// - data_root_not_found (we may have hit a node that just hasn't seen it yet)
// - exceeds_disk_pool_size_limit
// We also try again after any kind of unexpected network errors

/**
 *  These are errors from the `/chunk` endpoint on an Arweave
 *  node that we should never try to continue on
 */
const FATAL_CHUNK_UPLOAD_ERRORS = [
	'invalid_json',
	'chunk_too_big',
	'data_path_too_big',
	'offset_too_big',
	'data_size_too_big',
	'chunk_proof_ratio_not_attractive',
	'invalid_proof'
];

interface MultiChunkTxUploaderConstructorParams {
	gatewayUrl: URL;
	transaction: Transaction;
	maxConcurrentChunks?: number;
	maxRetriesPerRequest?: number;
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
 *			gatewayUrl: new URL('https://arweave.net:443')
 *		});
 *
 *		await transactionUploader.batchUploadChunks();
 * ```
 */
export class MultiChunkTxUploader {
	private chunkOffset = 0;
	private txPosted = false;
	private uploadedChunks = 0;
	public hasFailedRequests = false;

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

	private gatewayUrl: URL;
	private transaction: Transaction;
	private maxConcurrentChunks: number;
	private maxRetriesPerRequest: number;
	private progressCallback?: (pctComplete: number) => void;

	constructor({
		gatewayUrl,
		transaction,
		maxConcurrentChunks = 32,
		maxRetriesPerRequest = 8,
		progressCallback
	}: MultiChunkTxUploaderConstructorParams) {
		if (!transaction.id) {
			throw new Error(`Transaction is not signed`);
		}
		if (!transaction.chunks) {
			throw new Error(`Transaction chunks not prepared`);
		}

		this.gatewayUrl = gatewayUrl;
		this.transaction = transaction;
		this.maxConcurrentChunks = maxConcurrentChunks;
		this.maxRetriesPerRequest = maxRetriesPerRequest;

		if (progressCallback) {
			this.progressCallback = progressCallback;
		}
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

		try {
			await Promise.all(uploadPromises);
		} catch (err) {
			throw new Error(err);
		}
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
				await this.retryRequestUntilMaxErrors(() => axios.post(`${this.gatewayUrl.href}chunk`, chunk));
			} catch (err) {
				throw new Error(`Too many errors encountered while posting chunks: ${err}`);
			}

			this.uploadedChunks++;

			if (this.progressCallback) {
				this.progressCallback(this.pctComplete);
			}
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

		// We will send the data with the headers if chunks will fit into transaction header body
		// Otherwise we send the headers with no data
		const transactionToUpload = uploadInBody
			? this.transaction
			: new Transaction(Object.assign({}, this.transaction, { data: new Uint8Array(0) }));

		try {
			await this.retryRequestUntilMaxErrors(() => axios.post(`${this.gatewayUrl.href}tx`, transactionToUpload));
		} catch (err) {
			throw new Error(`Too many errors encountered while posting transaction headers:  ${err}`);
		}

		this.txPosted = true;

		if (uploadInBody) {
			this.chunkOffset += this.totalChunks;
			this.uploadedChunks += this.totalChunks;
		}

		return;
	}

	/**
	 * Retries the given request until the response returns a successful
	 * status code of 200 or the maxRetries setting has been exceeded
	 *
	 * @throws when a fatal chunk error has been returned by an Arweave node
	 * @throws when max retries have been exhausted
	 */
	private async retryRequestUntilMaxErrors(request: () => Promise<AxiosResponse<unknown>>) {
		let resp: AxiosResponse<unknown> | string;
		let retryNumber = 0;
		let error = '';

		while (retryNumber <= this.maxRetriesPerRequest && !this.hasFailedRequests) {
			try {
				resp = await request();
			} catch (err) {
				resp = err;
			}

			if (respIsError(resp) || resp?.status !== 200) {
				error = respIsError(resp) ? resp : resp.statusText;

				if (FATAL_CHUNK_UPLOAD_ERRORS.includes(error)) {
					throw new Error(`Fatal error uploading chunk ${this.chunkOffset}: ${error}`);
				} else {
					// Use exponential back-off delay after failed requests. With the current
					// default error delay and max retries, we expect the following wait times:

					// Retry wait 1: 500ms
					// Retry wait 2: 1,000ms
					// Retry wait 3: 2,000ms
					// Retry wait 4: 4,000ms
					// Retry wait 5: 8,000ms
					// Retry wait 6: 16,000ms
					// Retry wait 7: 32,000ms
					// Retry wait 8: 64,000ms

					const delay = Math.pow(2, retryNumber) * INITIAL_ERROR_DELAY;
					await new Promise((res) => setTimeout(res, delay));

					retryNumber++;
				}
			} else {
				// Request has succeeded with status code 200, return from loop
				return;
			}
		}

		this.hasFailedRequests = true;
		throw new Error(`Request to gateway has failed: ${error}`);
	}
}

function respIsError(resp: AxiosResponse<unknown> | string): resp is string {
	return resp === typeof 'string';
}
