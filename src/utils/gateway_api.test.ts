/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import axios from 'axios';
import { expect } from 'chai';
import { describe } from 'mocha';
import { spy, stub, useFakeTimers } from 'sinon';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { stubTransactionID } from '../types';
import {
	DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
	DEFAULT_MAX_RATE_LIMIT_RETRIES,
	FATAL_CHUNK_UPLOAD_ERRORS
} from './constants';
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

	describe('rate limit (429) retry bounding', () => {
		// These tests exercise the REAL retry loop against a stubbed axios, driving the
		// (default 60s) rate-limit throttle with sinon FAKE TIMERS so there is no real
		// sleeping. `clock.runAllAsync()` advances every scheduled timer AND flushes the
		// promise microtasks between them, so the loop runs to completion in real-time ms.

		// Explicitly restore the fake clock after each test so it can never leak into
		// other suites (the global sinon.restore() would too, but relying on it is
		// fragile under reordered/parallel runs).
		let clock: ReturnType<typeof useFakeTimers> | undefined;
		afterEach(() => {
			clock?.restore();
			clock = undefined;
		});

		// Helper: kick off a request, drive all fake timers to completion, and report the
		// settled outcome without triggering an unhandled-rejection warning.
		async function runToCompletion(promise: Promise<unknown>, activeClock: ReturnType<typeof useFakeTimers>) {
			const settled = promise.then(
				() => ({ ok: true as const, error: null as Error | null }),
				(error: Error) => ({ ok: false as const, error })
			);
			await activeClock.runAllAsync();
			return settled;
		}

		// (a) A gateway that returns 429 on EVERY request must throw the clear rate-limit
		// error after EXACTLY maxRateLimitRetries throttles — and must NOT loop forever.
		it('throws a clear error after exactly maxRateLimitRetries throttles on a persistent 429 (no infinite loop)', async () => {
			clock = useFakeTimers();
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 429, statusText: 'Too Many Requests' });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance }); // default maxRateLimitRetries = 5
			const throttleSpy = spy(gatewayApi as any, 'rateLimitThrottle');

			const { ok, error } = await runToCompletion(gatewayApi.postToEndpoint(''), clock);

			expect(ok, 'expected the persistent 429 to REJECT, not hang or resolve').to.equal(false);
			expect(error).to.be.instanceOf(Error);
			expect(error?.message).to.contain('rate limiting');
			expect(error?.message).to.contain('HTTP 429');
			expect(error?.message).to.contain(`${DEFAULT_MAX_RATE_LIMIT_RETRIES}`);
			// Exactly 5 throttles, then the 6th 429 attempt throws — a FINITE, bounded loop.
			expect(throttleSpy.callCount).to.equal(DEFAULT_MAX_RATE_LIMIT_RETRIES);
			expect(axiosSpy.callCount).to.equal(DEFAULT_MAX_RATE_LIMIT_RETRIES + 1);
		});

		// (b) Transient-throttle tolerance is PRESERVED: a 429 that clears within the
		// budget must still succeed (no regression — our app/harness wait out arweave.net).
		it('succeeds when a transient 429 clears within the budget (429, 429, then 200)', async () => {
			clock = useFakeTimers();
			const axiosSpy = stub(axiosInstance, 'post')
				.onCall(0)
				.resolves({ status: 429, statusText: 'Too Many Requests' })
				.onCall(1)
				.resolves({ status: 429, statusText: 'Too Many Requests' })
				.onCall(2)
				.resolves({ status: 200 });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance });
			const throttleSpy = spy(gatewayApi as any, 'rateLimitThrottle');

			const { ok, error } = await runToCompletion(gatewayApi.postToEndpoint(''), clock);

			expect(error, 'transient 429 must not surface an error').to.equal(null);
			expect(ok, 'a transient 429 that clears must still SUCCEED').to.equal(true);
			expect(throttleSpy.callCount).to.equal(2); // waited out both 429s
			expect(axiosSpy.callCount).to.equal(3); // 429, 429, 200
		});

		// (c) The rate-limit counter and the error-retry counter are INDEPENDENT.
		// (c1) A 429 bound is reached even though the (ample) error budget is untouched —
		// and an intervening 5xx error did NOT consume a rate-limit retry.
		it('bounds 429s on their own budget, independent of an ample error budget (c1)', async () => {
			clock = useFakeTimers();
			// One transient 500, then a persistent 429. maxRateLimitRetries = 2 hits first;
			// maxRetriesPerRequest = 8 stays far from exhaustion.
			const axiosSpy = stub(axiosInstance, 'post')
				.onCall(0)
				.resolves({ status: 500, statusText: 'Server Error' })
				.resolves({ status: 429, statusText: 'Too Many Requests' });
			const gatewayApi = new GatewayAPI({
				gatewayUrl,
				axiosInstance,
				maxRetriesPerRequest: 8,
				maxRateLimitRetries: 2,
				initialErrorDelayMS: 1
			});
			const throttleSpy = spy(gatewayApi as any, 'rateLimitThrottle');

			const { ok, error } = await runToCompletion(gatewayApi.postToEndpoint(''), clock);

			expect(ok).to.equal(false);
			// The RATE-LIMIT error is thrown (not the generic max-retries error) — proving
			// the 429 budget bounded the loop while the error budget was still ample.
			expect(error?.message).to.contain('rate limiting');
			expect(throttleSpy.callCount).to.equal(2); // exactly maxRateLimitRetries throttles
			// 1 (500) + 3 (429 x3: 2 throttled then the 3rd throws) = 4 total requests.
			expect(axiosSpy.callCount).to.equal(4);
		});

		// (c2) The error budget is exhausted normally even though a 429 occurred first —
		// proving the 429 did NOT consume an error retry.
		it('bounds errors on their own budget; a 429 does not consume an error retry (c2)', async () => {
			clock = useFakeTimers();
			// One transient 429, then a persistent 500. maxRetriesPerRequest = 2 governs.
			const axiosSpy = stub(axiosInstance, 'post')
				.onCall(0)
				.resolves({ status: 429, statusText: 'Too Many Requests' })
				.resolves({ status: 500, statusText: 'Server Error' });
			const gatewayApi = new GatewayAPI({
				gatewayUrl,
				axiosInstance,
				maxRetriesPerRequest: 2,
				maxRateLimitRetries: 8,
				initialErrorDelayMS: 1
			});
			const throttleSpy = spy(gatewayApi as any, 'rateLimitThrottle');

			const { ok, error } = await runToCompletion(gatewayApi.postToEndpoint(''), clock);

			expect(ok).to.equal(false);
			// Generic max-retries error (NOT the rate-limit one) — the error budget governed.
			expect(error?.message).to.contain('Request to gateway has failed');
			expect(error?.message).to.not.contain('rate limiting');
			expect(throttleSpy.callCount).to.equal(1); // the single 429 was waited out once
			// 1 (429) + 3 (500: maxRetriesPerRequest=2 → 3 attempts) = 4 total requests.
			// If the 429 had consumed an error retry, there would be fewer 500 attempts.
			expect(axiosSpy.callCount).to.equal(4);
		});

		// (d) maxRateLimitRetries is configurable via the constructor.
		it('honors a configurable maxRateLimitRetries', async () => {
			clock = useFakeTimers();
			const axiosSpy = stub(axiosInstance, 'post').resolves({ status: 429, statusText: 'Too Many Requests' });
			const gatewayApi = new GatewayAPI({ gatewayUrl, axiosInstance, maxRateLimitRetries: 2 });
			const throttleSpy = spy(gatewayApi as any, 'rateLimitThrottle');

			const { ok, error } = await runToCompletion(gatewayApi.postToEndpoint(''), clock);

			expect(ok).to.equal(false);
			expect(error?.message).to.contain('rate limiting');
			expect(error?.message).to.contain('2 retries');
			expect(throttleSpy.callCount).to.equal(2); // bounded by the configured value
			expect(axiosSpy.callCount).to.equal(3); // 2 throttled + 1 that throws
		});
	});
});
