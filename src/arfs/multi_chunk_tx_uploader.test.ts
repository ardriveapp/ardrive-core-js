/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import { expect } from 'chai';
import { describe } from 'mocha';
import { spy, stub } from 'sinon';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { GatewayAPI } from '../utils/gateway_api';
import { MultiChunkTxUploader, ProgressCallback } from './multi_chunk_tx_uploader';

describe('MultiChunkTxUploader class', () => {
	const arweave = Arweave.init({
		host: 'fake',
		port: 433,
		protocol: 'http',
		timeout: 600000
	});

	const gatewayUrl = new URL('http://fake');
	const gatewayApi = new GatewayAPI({ gatewayUrl, maxRetriesPerRequest: 3, initialErrorDelayMS: 1 });

	let txWithOneChunkOfData: Transaction;
	let txWithTwentyChunksOfData: Transaction;

	before(async () => {
		const wallet = await arweave.wallets.generate();

		const oneChunkOfData = new Uint8Array(5);
		const twentyChunksOfData = new Uint8Array(5_000_000);

		const prepTx = async (data: Uint8Array) => {
			const tx = await arweave.createTransaction({ reward: '0', last_tx: 'STUB', data }, wallet);

			await arweave.transactions.sign(tx, wallet);
			await tx.prepareChunks(data);

			return tx;
		};

		txWithOneChunkOfData = await prepTx(oneChunkOfData);
		txWithTwentyChunksOfData = await prepTx(twentyChunksOfData);
	});

	describe('resumeChunkUpload static method', () => {
		it('returns an uploader that will not post the transaction header', async () => {
			const uploader = MultiChunkTxUploader.resumeChunkUpload({
				gatewayApi,
				transaction: txWithTwentyChunksOfData
			});

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			stub(gatewayApi, 'postToEndpoint').resolves();

			await uploader.batchUploadChunks();

			expect(uploader.isComplete).to.be.true;
			expect(uploadChunkSpy.callCount).to.equal(20);
			expect(postTxHeaderSpy.callCount).to.equal(0);
		});
	});

	describe('batchUploadChunks method', () => {
		it('posts chunk with tx header as expected with a small sized tx', async () => {
			const uploader = new MultiChunkTxUploader({
				gatewayApi,
				transaction: txWithOneChunkOfData
			});

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			stub(gatewayApi, 'postToEndpoint').resolves();

			await uploader.batchUploadChunks();

			expect(uploader.isComplete).to.be.true;
			expect(uploadChunkSpy.callCount).to.equal(0);
			expect(postTxHeaderSpy.callCount).to.equal(1);
		});

		it('posts chunks with uploadChunk and reports progress as expected with a large sized tx', async () => {
			let progressCount = 0;
			const progressCallback: ProgressCallback = (pct) => {
				progressCount++;

				// With exactly 20 chunks sent, we will expect 5% progress on each progress callback
				expect(pct).to.equal(progressCount * 5);
			};

			const uploader = new MultiChunkTxUploader({
				gatewayApi,
				transaction: txWithTwentyChunksOfData,
				progressCallback
			});

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			stub(gatewayApi, 'postToEndpoint').resolves();

			await uploader.batchUploadChunks();

			expect(uploader.isComplete).to.be.true;
			expect(uploadChunkSpy.callCount).to.equal(20);
			expect(postTxHeaderSpy.callCount).to.equal(1);
		});

		it('finishes all chunks as expected when maxConcurrentChunks is set to less than the totalChunks of data', async () => {
			const uploader = new MultiChunkTxUploader({
				gatewayApi,
				transaction: txWithTwentyChunksOfData,
				maxConcurrentChunks: 4
			});
			const postSpy = stub(gatewayApi, 'postToEndpoint').resolves();

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			await uploader.batchUploadChunks();

			expect(uploadChunkSpy.callCount).to.equal(4);
			expect(postTxHeaderSpy.callCount).to.equal(1);

			expect(postSpy.callCount).to.equal(21);
		});

		it('throws an error when API fails to post transaction header and throws an error if it already has failed requests', async () => {
			const uploader = new MultiChunkTxUploader({
				gatewayApi,
				transaction: txWithOneChunkOfData
			});
			stub(gatewayApi, 'postToEndpoint').throws('Super Error');

			await expectAsyncErrorThrow({
				promiseToError: uploader.batchUploadChunks(),
				errorMessage: 'Too many errors encountered while posting transaction header: Super Error'
			});

			expect(uploader['hasFailedRequests']).to.be.true;

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			await expectAsyncErrorThrow({
				promiseToError: uploader.batchUploadChunks(),
				errorMessage: 'Transaction upload has failed requests!'
			});

			expect(uploadChunkSpy.callCount).to.equal(0);
			expect(postTxHeaderSpy.callCount).to.equal(0);
		});

		it('throws an error when API fails to post chunks', async () => {
			const uploader = new MultiChunkTxUploader({
				gatewayApi,
				transaction: txWithTwentyChunksOfData,
				maxConcurrentChunks: 1
			});
			stub(gatewayApi, 'postToEndpoint').onFirstCall().resolves().onSecondCall().throws('Mega Error');

			const uploadChunkSpy = spy(uploader as any, 'uploadChunk');
			const postTxHeaderSpy = spy(uploader as any, 'postTransactionHeader');

			await expectAsyncErrorThrow({
				promiseToError: uploader.batchUploadChunks(),
				errorMessage: 'Too many errors encountered while posting chunks: Mega Error'
			});

			expect(uploadChunkSpy.callCount).to.equal(1);
			expect(postTxHeaderSpy.callCount).to.equal(1);
		});
	});
});
