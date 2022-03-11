/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { AxiosResponse } from 'axios';
import { expect } from 'chai';
import { describe } from 'mocha';
import { spy, stub } from 'sinon';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { FATAL_CHUNK_UPLOAD_ERRORS, MultiChunkTxUploader, ProgressCallback } from './multi_chunk_tx_uploader';

describe('MultiChunkTxUploader class', function () {
	const arweave = Arweave.init({
		host: 'fake',
		port: 433,
		protocol: 'http',
		timeout: 600000
	});

	const gatewayUrl = new URL('http://fake');

	let smallTx: Transaction;
	let largeTx: Transaction;
	let wallet: JWKInterface;

	before(async () => {
		wallet = await arweave.wallets.generate();

		/** 1 chunk of data */
		const smallData = new Uint8Array(5);

		/** 20 chunks of data */
		const largeData = new Uint8Array(5_000_000);

		const prepTx = async (data: Uint8Array) => {
			const tx = await arweave.createTransaction({ reward: '0', last_tx: 'STUB', data }, wallet);

			await arweave.transactions.sign(tx, wallet);
			await tx.prepareChunks(data);

			return tx;
		};

		smallTx = await prepTx(smallData);
		largeTx = await prepTx(largeData);
	});

	let progressCount = 0;
	const progressCallback: ProgressCallback = (pct) => {
		progressCount++;

		// With exactly 20 chunks sent, we will expect 5% progress on each progress callback
		expect(pct).to.equal(progressCount * 5);
	};

	beforeEach(() => {
		progressCount = 0;
	});

	const getTxUploader = (transaction: Transaction, maxConcurrentChunks?: number, maxRetriesPerRequest?: number) =>
		new MultiChunkTxUploader({
			gatewayUrl,
			maxRetriesPerRequest,
			transaction,
			progressCallback,
			maxConcurrentChunks
		});

	const getSmallTxUploader = (maxRetriesPerRequest?: number) =>
		getTxUploader(smallTx, undefined, maxRetriesPerRequest);
	const getLargeTxUploader = (maxConcurrentChunks?: number) => getTxUploader(largeTx, maxConcurrentChunks);

	describe('batchUploadChunks public method', () => {
		it('throws an error if uploader already has failed requests', async () => {
			const uploader = getSmallTxUploader();

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');
			const retryRequestSpy = spy(uploader as any, 'retryRequestUntilMaxErrors');

			uploader['hasFailedRequests'] = true;

			await expectAsyncErrorThrow({
				promiseToError: uploader.batchUploadChunks(),
				errorMessage: 'Transaction upload has failed requests!'
			});

			expect(uploadChunkSpy.callCount).to.equal(0);
			expect(postTxHeaderSpy.callCount).to.equal(0);
			expect(retryRequestSpy.callCount).to.equal(0);
		});

		it('respects the maxConcurrentChunks setting set in the uploader', async () => {
			const uploader = getLargeTxUploader(5);

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');

			// Stub retry requests to never throw, always resolve
			stub(uploader as any, 'retryRequestUntilMaxErrors').resolves();

			// We skip txPost for this test case
			uploader['txPosted'] = true;

			// Do not await here, only call initial uploadChunks with expected concurrency
			uploader.batchUploadChunks();

			expect(uploadChunkSpy.callCount).to.equal(5);
			expect(uploader['chunkOffset']).to.equal(5);
		});

		it('posts chunk with tx header as expected with a small sized tx', async () => {
			const uploader = getSmallTxUploader();

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			// Stub retry requests to never throw, always resolve
			stub(uploader as any, 'retryRequestUntilMaxErrors').resolves();

			await uploader.batchUploadChunks();

			expect(uploader.isComplete).to.be.true;
			expect(uploadChunkSpy.calledOnce).to.be.false;
			expect(postTxHeaderSpy.calledOnce).to.be.true;
		});

		it('posts chunks with uploadChunk and reports progress as expected with a large sized tx', async () => {
			const uploader = getLargeTxUploader(undefined);

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			// Stub retry requests to never throw, always resolve
			stub(uploader as any, 'retryRequestUntilMaxErrors').resolves();

			await uploader.batchUploadChunks();

			expect(uploader.isComplete).to.be.true;
			expect(uploadChunkSpy.callCount).to.equal(20);
			expect(postTxHeaderSpy.calledOnce).to.be.true;
		});
	});

	describe('uploadChunk private method', () => {
		it('sends one chunk and increments offset by one on an unawaited call', () => {
			const uploader = getLargeTxUploader();
			const retryRequestSpy = spy(uploader as any, 'retryRequestUntilMaxErrors');

			uploader['uploadChunk']();

			expect(retryRequestSpy.callCount).to.equal(1);
			expect(uploader['chunkOffset']).to.equal(1);

			expect(uploader['uploadedChunks']).to.equal(0);
			expect(uploader.isComplete).to.be.false;
		});

		it('sends all chunks and increments offset to completion on an awaited call', async () => {
			const uploader = getLargeTxUploader();
			const retryRequestSpy = stub(uploader as any, 'retryRequestUntilMaxErrors').resolves();

			await uploader['uploadChunk']();

			expect(retryRequestSpy.callCount).to.equal(20);
			expect(uploader['chunkOffset']).to.equal(20);
			expect(uploader['uploadedChunks']).to.equal(20);

			expect(uploader['uploadedChunks'] === uploader.totalChunks).to.be.true;
		});

		it('does not send any chunks if the uploader has failed requests', async () => {
			const uploader = getLargeTxUploader();
			const retryRequestSpy = spy(uploader as any, 'retryRequestUntilMaxErrors');

			uploader['hasFailedRequests'] = true;
			await uploader['uploadChunk']();

			expect(retryRequestSpy.callCount).to.equal(0);
			expect(uploader['chunkOffset']).to.equal(0);
			expect(uploader['uploadedChunks']).to.equal(0);

			expect(uploader['uploadedChunks'] === uploader.totalChunks).to.be.false;
		});

		it('throws an error if request retries have failed', async () => {
			const uploader = getLargeTxUploader();
			const retryRequestSpy = stub(uploader as any, 'retryRequestUntilMaxErrors').throws(
				new Error('Failed request!')
			);

			await expectAsyncErrorThrow({
				promiseToError: uploader['uploadChunk'](),
				errorMessage: 'Too many errors encountered while posting chunks: Error: Failed request!'
			});

			expect(retryRequestSpy.callCount).to.equal(1);
			expect(uploader['chunkOffset']).to.equal(1);
			expect(uploader['uploadedChunks']).to.equal(0);

			expect(uploader['uploadedChunks'] === uploader.totalChunks).to.be.false;
		});
	});

	describe('postTransactionHeader private method', () => {
		it('uploads with chunks in header body when sent with 1 chunk', async () => {
			const uploader = getSmallTxUploader();
			const retryRequestSpy = stub(uploader as any, 'retryRequestUntilMaxErrors').resolves();

			expect(uploader['txPosted']).to.be.false;

			await uploader['postTransactionHeader']();

			expect(retryRequestSpy.callCount).to.equal(1);
			expect(uploader['chunkOffset']).to.equal(1);
			expect(uploader['uploadedChunks']).to.equal(1);

			expect(uploader['txPosted']).to.be.true;
			expect(uploader.isComplete).to.be.true;
		});

		it('does not send chunks with header or increment chunks on a multi-chunk transaction', async () => {
			const uploader = getLargeTxUploader();
			const retryRequestSpy = stub(uploader as any, 'retryRequestUntilMaxErrors').resolves();

			expect(uploader['txPosted']).to.be.false;

			await uploader['postTransactionHeader']();

			expect(retryRequestSpy.callCount).to.equal(1);

			expect(uploader['chunkOffset']).to.equal(0);
			expect(uploader['uploadedChunks']).to.equal(0);

			expect(uploader['txPosted']).to.be.true;
			expect(uploader.isComplete).to.be.false;
		});

		it('throws an error if request retries have failed', async () => {
			const uploader = getSmallTxUploader();

			const retryRequestSpy = stub(uploader as any, 'retryRequestUntilMaxErrors').throws(
				new Error('Failed request!')
			);

			await expectAsyncErrorThrow({
				promiseToError: uploader['postTransactionHeader'](),
				errorMessage: 'Too many errors encountered while posting transaction header: Error: Failed request!'
			});

			expect(retryRequestSpy.callCount).to.equal(1);

			expect(uploader['chunkOffset']).to.equal(0);
			expect(uploader['uploadedChunks']).to.equal(0);

			expect(uploader['txPosted']).to.be.false;
			expect(uploader.isComplete).to.be.false;
		});
	});

	describe('retryRequestUntilMaxErrors private method', () => {
		const failureRequestPromise = (error = 'Big request failure!') =>
			// eslint-disable-next-line prettier/prettier
			Promise.resolve(({
				statusCode: 400,
				statusText: error
				// eslint-disable-next-line prettier/prettier
			} as unknown) as AxiosResponse<unknown>);

		// eslint-disable-next-line prettier/prettier
		const successfulRequestPromise = Promise.resolve(({
			statusCode: 200
			// eslint-disable-next-line prettier/prettier
		} as unknown) as AxiosResponse<unknown>);

		it('throws an error after maxRetries have been exhausted', async function () {
			const txUploader = getSmallTxUploader(1);

			await expectAsyncErrorThrow({
				promiseToError: txUploader['retryRequestUntilMaxErrors'](() => failureRequestPromise()),
				errorMessage: 'Request to gateway has failed: Big request failure!'
			});
			expect(txUploader['hasFailedRequests']).to.be.true;
		});

		it('succeeds without error after the first request fails and the second succeeds with status code 200', async () => {
			const txUploader = getSmallTxUploader();

			let attempt = 0;
			const request = () => {
				if (attempt > 0) {
					return successfulRequestPromise;
				}

				attempt++;
				return failureRequestPromise();
			};

			expect(() => txUploader['retryRequestUntilMaxErrors'](request)).to.not.throw;

			expect(txUploader['hasFailedRequests']).to.be.false;
		});

		it('throws an error when encountering any fatal chunk errors', async () => {
			for (const fatalError of FATAL_CHUNK_UPLOAD_ERRORS) {
				const txUploader = getSmallTxUploader();

				await expectAsyncErrorThrow({
					promiseToError: txUploader['retryRequestUntilMaxErrors'](() => failureRequestPromise(fatalError)),
					errorMessage: `Fatal error uploading chunk: ${fatalError}`
				});

				expect(txUploader['hasFailedRequests']).to.be.true;
			}
		});

		it('throws an error when an unexpected 504 in string format is returned from gateway', async function () {
			const txUploader = getSmallTxUploader(1);

			await expectAsyncErrorThrow({
				promiseToError: txUploader['retryRequestUntilMaxErrors'](() =>
					// eslint-disable-next-line prettier/prettier
					Promise.resolve(('<HTML>504 Bad Gateway</HTML>' as unknown) as AxiosResponse<unknown>)
				),
				errorMessage: 'Request to gateway has failed: <HTML>504 Bad Gateway</HTML>'
			});
			expect(txUploader['hasFailedRequests']).to.be.true;
		});
	});
});
