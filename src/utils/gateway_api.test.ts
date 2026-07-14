/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import axios from 'axios';
import { expect } from 'chai';
import { describe } from 'mocha';
import { spy, stub } from 'sinon';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { stubTransactionID } from '../types';
import { DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS, FATAL_CHUNK_UPLOAD_ERRORS } from './constants';
import { GatewayAPI } from './gateway_api';

describe('GatewayAPI class', () => {
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

		it('throws an error when encountering any default fatal chunk errors', async () => {
			for (const fatalError of FATAL_CHUNK_UPLOAD_ERRORS) {
				const axiosInstance = axios.create();
				const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 666, statusText: fatalError });
				const gatewayApi = new GatewayAPI({
					gatewayUrl,
					maxRetriesPerRequest: 0,
					axiosInstance
				});

				await expectAsyncErrorThrow({
					promiseToError: gatewayApi.postToEndpoint(''),
					errorMessage: `Fatal error encountered: (Status: 666) ${fatalError}`
				});

				expect(axiosSpy.callCount).to.equal(1);
			}
		});

		it('throws an error when an unexpected 504 in string format is returned from gateway', async () => {
			const axiosSpy = stub(axiosInstance, 'post').resolves('<HTML>504 Bad Gateway</HTML>');
			const gatewayApi = new GatewayAPI({
				gatewayUrl,
				maxRetriesPerRequest: 0,
				initialErrorDelayMS: 1,
				axiosInstance
			});

			await expectAsyncErrorThrow({
				promiseToError: gatewayApi.postToEndpoint(''),
				errorMessage: 'Request to gateway has failed: (Status: undefined) <HTML>504 Bad Gateway</HTML>'
			});

			expect(axiosSpy.callCount).to.equal(1);
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

	describe('getTransaction method', () => {
		it('returns the expected transaction without error when the response contains a successful status code', async () => {
			const axiosSpy = stub(axiosInstance, 'get').resolves({ data: smallTx, status: 200 });

			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance });

			const tx = await gatewayApi.getTransaction(stubTransactionID);

			expect(tx).to.deep.equal(smallTx);
			expect(axiosSpy.callCount).to.equal(1);
			expect(axiosSpy.args[0][0]).to.equal('http://fake/tx/0000000000000000000000000000000000000000000');
		});

		it('throws an error when the transaction cannot be found', async () => {
			stub(axiosInstance, 'get').resolves({ status: 400, statusText: 'Bad Error' });

			const gatewayApi = new GatewayAPI({
				gatewayUrl,
				axiosInstance,
				maxRetriesPerRequest: 2,
				initialErrorDelayMS: 1
			});

			await expectAsyncErrorThrow({
				promiseToError: gatewayApi.getTransaction(stubTransactionID),
				errorMessage: 'Transaction could not be found from the gateway: (Status: 400) Bad Error'
			});
		});
	});

	describe('gqlRequest method', () => {
		// (a) The ar.io ClickHouse row/byte read-limit error (TOO_MANY_ROWS, code 158)
		// is permanent, so it must fail fast without exhausting the 8 default retries.
		it('fails fast on a row-limit / TOO_MANY_ROWS error without exhausting retries and surfaces an actionable message', async () => {
			const rowLimitBody = {
				data: null,
				errors: [
					{
						message:
							'Code: 158. DB::Exception: Limit for rows or bytes to read exceeded, ' +
							'max rows: 10.00 million: While executing MergeTreeThread. (TOO_MANY_ROWS)',
						path: ['transactions'],
						locations: [{ line: 1, column: 1 }],
						extensions: { code: '158' }
					}
				]
			};
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 200, data: rowLimitBody });

			// Default maxRetriesPerRequest (8) — a retry-happy config would call post 9 times.
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance, initialErrorDelayMS: 1 });

			let caught: Error | null = null;
			try {
				await gatewayApi.gqlRequest({} as any);
			} catch (err) {
				caught = err as Error;
			}

			expect(caught, 'expected gqlRequest to throw').to.be.instanceOf(Error);
			expect(caught?.message).to.contain('scanned too many rows');
			expect(caught?.message).to.contain('owner');
			// Exactly one request — proves the error was treated as fatal, not retried 8x.
			expect(axiosSpy.callCount).to.equal(1);
		});

		it('detects the row-limit error via extensions code 158 alone', async () => {
			const rowLimitBody = {
				data: null,
				errors: [{ message: 'internal error', path: [], locations: [], extensions: { code: '158' } }]
			};
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 200, data: rowLimitBody });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance });

			let caught: Error | null = null;
			try {
				await gatewayApi.gqlRequest({} as any);
			} catch (err) {
				caught = err as Error;
			}

			expect(caught?.message).to.contain('scanned too many rows');
			expect(axiosSpy.callCount).to.equal(1);
		});

		// (e) The pre-existing statement-timeout handling must be preserved unchanged.
		it('preserves the statement-timeout behavior (fails fast with the timed-out message)', async () => {
			const timeoutBody = {
				data: null,
				errors: [
					{
						message: 'canceling statement due to statement timeout',
						path: ['transactions'],
						locations: [{ line: 1, column: 1 }],
						extensions: { code: '0' }
					}
				]
			};
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 200, data: timeoutBody });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance });

			await expectAsyncErrorThrow({
				promiseToError: gatewayApi.gqlRequest({} as any),
				errorMessage: 'GQL Error: GQL Query has been timed out.'
			});

			expect(axiosSpy.callCount).to.equal(1);
		});
	});

	describe('request timeout configuration', () => {
		// (b) The default axios instance is created with a bounded request timeout.
		it('creates its default axios instance with the default request timeout', () => {
			const gatewayApi = new GatewayAPI({ gatewayUrl });
			expect((gatewayApi as any).axiosInstance.defaults.timeout).to.equal(DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS);
		});

		it('creates its default axios instance with a caller-provided request timeout', () => {
			const gatewayApi = new GatewayAPI({ gatewayUrl, requestTimeoutMs: 12_345 });
			expect((gatewayApi as any).axiosInstance.defaults.timeout).to.equal(12_345);
		});

		// (c) A caller-supplied axios instance is used as-is and never modified.
		it('uses an externally-supplied axios instance unmodified', () => {
			const external = axios.create();
			const originalTimeout = external.defaults.timeout;

			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance: external, requestTimeoutMs: 999 });

			// Same instance reference — not replaced.
			expect((gatewayApi as any).axiosInstance).to.equal(external);
			// requestTimeoutMs did NOT clobber the caller's timeout config.
			expect(external.defaults.timeout).to.equal(originalTimeout);
		});

		// (d) A transient network/timeout error (rejected promise) still retries then succeeds.
		it('retries a transient network/timeout error and then succeeds', async () => {
			const timeoutError = Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' });
			const axiosSpy = stub(axiosInstance, 'post')
				.onCall(0)
				.rejects(timeoutError)
				.onCall(1)
				.resolves({ status: 200 });

			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance, initialErrorDelayMS: 1 });

			await gatewayApi.postToEndpoint('');

			expect(axiosSpy.callCount).to.equal(2);
		});
	});
});
