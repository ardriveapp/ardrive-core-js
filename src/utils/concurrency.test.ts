import { expect } from 'chai';
import { mapSettledWithConcurrency, mapWithConcurrency } from './concurrency';

/**
 * CORE-9: the bounded-concurrency primitives that keep a 1000-edge page (CORE-7) from
 * firing ~1000 per-entity metadata fetches at once. The load-bearing guarantees:
 *   - every item is processed EXACTLY once (nothing dropped),
 *   - results are index-aligned with the input (order preserved, completion order NOT),
 *   - at most `limit` invocations are ever in flight at the same moment.
 */
describe('bounded-concurrency helpers (CORE-9)', () => {
	/** An async task proxy that records the peak number of overlapping in-flight calls. */
	const makeInFlightTracker = () => {
		let inFlight = 0;
		let peak = 0;
		return {
			run: async <R>(value: R, delayMs = 5): Promise<R> => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				inFlight--;
				return value;
			},
			get peak(): number {
				return peak;
			}
		};
	};

	describe('mapWithConcurrency (Promise.all analogue)', () => {
		it('processes ALL items when there are far more than the limit — none dropped', async () => {
			const items = Array.from({ length: 250 }, (_, i) => i);

			const results = await mapWithConcurrency(items, 30, async (n) => n * 2);

			expect(results).to.have.lengthOf(250);
			expect(results).to.deep.equal(items.map((n) => n * 2));
		});

		it('caps in-flight invocations at the limit and actually reaches it (real, bounded parallelism)', async () => {
			const items = Array.from({ length: 250 }, (_, i) => i);
			const tracker = makeInFlightTracker();
			const limit = 30;

			const results = await mapWithConcurrency(items, limit, (n) => tracker.run(n));

			// Every one of the 250 items was processed...
			expect(results).to.have.lengthOf(250);
			expect(new Set(results).size).to.equal(250);
			// ...but the peak simultaneous in-flight count never exceeded the cap...
			expect(tracker.peak).to.be.at.most(limit);
			// ...and did saturate it (proves concurrency is real, not accidentally serialized).
			expect(tracker.peak).to.equal(limit);
		});

		it('preserves INPUT order even when later items finish first', async () => {
			const items = [0, 1, 2, 3, 4, 5];

			const results = await mapWithConcurrency(items, 3, async (n) => {
				// Higher indices resolve sooner; result order must still be input order.
				await new Promise((resolve) => setTimeout(resolve, (items.length - n) * 5));
				return n;
			});

			expect(results).to.deep.equal([0, 1, 2, 3, 4, 5]);
		});

		it('invokes the worker EXACTLY once per item', async () => {
			const items = Array.from({ length: 100 }, (_, i) => i);
			const invocations = new Map<number, number>();

			await mapWithConcurrency(items, 10, async (n) => {
				invocations.set(n, (invocations.get(n) ?? 0) + 1);
				return n;
			});

			expect(invocations.size).to.equal(100);
			for (const count of invocations.values()) {
				expect(count).to.equal(1);
			}
		});

		it('rejects (like Promise.all) when any invocation rejects', async () => {
			let caught: Error | undefined;
			try {
				await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
					if (n === 3) {
						throw new Error('boom-3');
					}
					return n;
				});
			} catch (e) {
				caught = e as Error;
			}
			expect(caught).to.be.instanceOf(Error);
			expect(caught?.message).to.equal('boom-3');
		});

		it('resolves to an empty array for empty input without invoking the worker', async () => {
			let called = false;
			const results = await mapWithConcurrency<number, number>([], 30, async (n) => {
				called = true;
				return n;
			});
			expect(results).to.deep.equal([]);
			expect(called).to.equal(false);
		});

		it('never spins up more workers than there are items', async () => {
			const tracker = makeInFlightTracker();
			await mapWithConcurrency([1, 2, 3], 30, (n) => tracker.run(n));
			expect(tracker.peak).to.be.at.most(3);
		});
	});

	describe('mapSettledWithConcurrency (Promise.allSettled analogue)', () => {
		it('never rejects; records per-item outcomes index-aligned, with bounded concurrency', async () => {
			const items = Array.from({ length: 120 }, (_, i) => i);
			const tracker = makeInFlightTracker();
			const limit = 20;

			const results = await mapSettledWithConcurrency(items, limit, async (n) => {
				await tracker.run(n, 3);
				if (n % 10 === 0) {
					throw new Error(`fail-${n}`);
				}
				return n;
			});

			expect(results).to.have.lengthOf(120);
			expect(tracker.peak).to.be.at.most(limit);

			// 0,10,...,110 => 12 rejections; the remaining 108 fulfilled. Nothing dropped.
			const rejected = results.filter((r) => r.status === 'rejected');
			const fulfilled = results.filter((r) => r.status === 'fulfilled');
			expect(rejected).to.have.lengthOf(12);
			expect(fulfilled).to.have.lengthOf(108);

			// Index alignment: slot 10 is the rejection for item 10, slot 11 the value 11.
			const slot10 = results[10];
			expect(slot10.status).to.equal('rejected');
			if (slot10.status === 'rejected') {
				expect((slot10.reason as Error).message).to.equal('fail-10');
			}
			const slot11 = results[11];
			expect(slot11.status).to.equal('fulfilled');
			if (slot11.status === 'fulfilled') {
				expect(slot11.value).to.equal(11);
			}
		});
	});
});
