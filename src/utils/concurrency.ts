/**
 * Bounded-concurrency helpers for turning a page of GraphQL edges into built entities
 * without firing every per-entity metadata fetch at once.
 *
 * A page can now carry up to {@link MAX_CONCURRENT_ENTITY_FETCHES}'s worth — actually up
 * to GQL_PAGE_SIZE (1000) — edges (CORE-7), and each edge is turned into an entity by a
 * per-entity network GET of its metadata tx. Mapping the whole page with
 * `Promise.all(edges.map(...))` would put ~1000 requests on one gateway host at once.
 * These helpers instead run at most `limit` invocations concurrently, in successive
 * waves, so the request COUNT still drops ~10x (fewer, bigger pages) while the peak
 * PARALLELISM stays bounded [CORE-9].
 *
 * Both helpers preserve INPUT ORDER (results are index-aligned with `items`) and run each
 * item's worker function EXACTLY ONCE, so the set/order of results and any accumulated
 * side effects are identical to the unbounded `Promise.all` / `Promise.allSettled` they
 * replace — only the number of simultaneously in-flight invocations is capped.
 */

/**
 * Bounded-concurrency analogue of `Promise.allSettled(items.map(fn))`.
 *
 * Runs `fn` over `items` with at most `limit` invocations in flight at any moment and
 * NEVER rejects: each result slot is a settled outcome, index-aligned with `items` and in
 * input order (regardless of the order invocations happen to finish).
 */
export async function mapSettledWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	if (items.length === 0) {
		return results;
	}

	// Never spin up more workers than there is work, and always at least one.
	const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));

	// Shared cursor. `nextIndex++` reads-then-increments synchronously (no `await` in
	// between), so on JS's single-threaded event loop no two workers can ever be handed
	// the same index, and indices are handed out in strictly increasing order.
	let nextIndex = 0;
	const runWorker = async (): Promise<void> => {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			try {
				results[index] = { status: 'fulfilled', value: await fn(items[index], index) };
			} catch (reason) {
				results[index] = { status: 'rejected', reason };
			}
		}
	};

	await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
	return results;
}

/**
 * Bounded-concurrency analogue of `Promise.all(items.map(fn))`.
 *
 * Like {@link mapSettledWithConcurrency}, but REJECTS if any invocation rejects (with the
 * first rejection reason in input-index order) and otherwise resolves to the results in
 * input order. At most `limit` invocations run at once. As with `Promise.all`, every item
 * is still processed; a rejection surfaces after the in-flight wave settles rather than
 * cancelling work already started (promises cannot be cancelled) — the resolved value in
 * the success path, and the fact that it rejects in the failure path, are unchanged.
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const settled = await mapSettledWithConcurrency(items, limit, fn);
	const values: R[] = new Array(settled.length);
	for (let i = 0; i < settled.length; i++) {
		const outcome = settled[i];
		if (outcome.status === 'rejected') {
			throw outcome.reason;
		}
		values[i] = outcome.value;
	}
	return values;
}
