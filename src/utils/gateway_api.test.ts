/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import axios from 'axios';
import { expect } from 'chai';
import { describe } from 'mocha';
import { spy, stub } from 'sinon';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { GatewayAPI } from './gateway_api';

describe('GatewayAPI class', function () {
	const arweave = Arweave.init({
		host: 'fake',
		port: 433,
		protocol: 'http',
		timeout: 600000
	});

	const gatewayUrl = new URL('http://fake');

	let smallTx: Transaction;

	before(async () => {
		const wallet = await arweave.wallets.generate();

		const oneChunkOfData = new Uint8Array(5);

		smallTx = await arweave.createTransaction({ reward: '0', last_tx: 'STUB', data: oneChunkOfData }, wallet);

		await arweave.transactions.sign(smallTx, wallet);
		await smallTx.prepareChunks(oneChunkOfData);
	});

	const axiosInstance = axios.create();

	describe('postToEndpoint method', () => {
		it('succeeds without error when response contains the default successful status code', async () => {
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 200 });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance });

			await gatewayApi.postToEndpoint('');

			expect(axiosSpy.callCount).to.equal(1);
		});

		it('succeeds without error when first response contains an error but a subsequent response contains a successful status code', async () => {
			const axiosSpy = stub(axiosInstance, 'post')
				.onCall(0)
				.resolves({ status: 400 })
				.onCall(1)
				.resolves({ status: 400 })
				.onCall(2)
				.resolves({ status: 101 });

			const gatewayApi = new GatewayAPI({
				gatewayUrl,
				validStatusCodes: [101],
				axiosInstance,
				initialErrorDelayMS: 1
			});

			await gatewayApi.postToEndpoint('');

			expect(axiosSpy.callCount).to.equal(3);
		});

		it('throws an error when response contains a fatal error', async () => {
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 400, statusText: 'Massive Error' });
			const gatewayApi = new GatewayAPI({ gatewayUrl, fatalErrors: ['Massive Error'], axiosInstance });

			await expectAsyncErrorThrow({
				promiseToError: gatewayApi.postToEndpoint(''),
				errorMessage: 'Fatal error encountered: (Status: 400) Massive Error'
			});

			expect(axiosSpy.callCount).to.equal(1);
		});

		it('throws an error after max retries have been expended', async () => {
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 400, statusText: 'Total Error' });
			const gatewayApi = new GatewayAPI({
				gatewayUrl,
				maxRetriesPerRequest: 3,
				initialErrorDelayMS: 1,
				axiosInstance
			});

			await expectAsyncErrorThrow({
				promiseToError: gatewayApi.postToEndpoint(''),
				errorMessage: 'Request to gateway has failed: (Status: 400) Total Error'
			});

			// Expect 4 tries with maxRetries set to 3
			expect(axiosSpy.callCount).to.equal(4);
		});
	});

	describe('postChunk method', () => {
		it('succeeds without error when response contains a successful status code', async () => {
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 101 });
			const gatewayApi = new GatewayAPI({ gatewayUrl, validStatusCodes: [101], axiosInstance });
			const endPointSpy = spy(gatewayApi as any, 'postToEndpoint');

			await gatewayApi.postChunk(smallTx.getChunk(0, smallTx.data));

			expect(axiosSpy.callCount).to.equal(1);
			expect(endPointSpy.args[0][0]).to.equal('chunk');
		});
	});

	describe('postTxHeader method', () => {
		it('succeeds without error when response contains a successful status code', async () => {
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 200 });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance });
			const endPointSpy = spy(gatewayApi as any, 'postToEndpoint');

			await gatewayApi.postTxHeader(smallTx);

			expect(axiosSpy.callCount).to.equal(1);
			expect(endPointSpy.args[0][0]).to.equal('tx');
		});
	});
});
