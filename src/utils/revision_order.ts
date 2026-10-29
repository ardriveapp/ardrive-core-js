/**
 * Unix-Time values above this are milliseconds, not seconds: some writers recorded milliseconds.
 * As seconds it would be the year 2286. Same threshold as ardrive-web.
 */
const MILLISECONDS_THRESHOLD = 10_000_000_000;

function unixTimeInSeconds(unixTime: number): number {
	return unixTime > MILLISECONDS_THRESHOLD ? Math.floor(unixTime / 1000) : unixTime;
}

export interface RevisionOrderFields {
	/** 0 or undefined when unknown, including a revision that is not yet mined */
	blockHeight?: number;
	unixTime?: { valueOf(): number };
}

/**
 * Whether `candidate` replaces `incumbent` as an entity's latest revision, when `incumbent`
 * came first in a newest-first (HEIGHT_DESC) listing.
 *
 * A gateway orders the revisions inside one block by their position in that block, which is
 * not the order they were written: two Turbo bundles mined in the same block land in either
 * order. So within the same block the later ArFS `Unix-Time` wins, as in ardrive-web and in
 * incremental sync ({@link selectLatestRevisions}). Across blocks, or when the block is unknown,
 * the listing order stands.
 */
export function isSameBlockLaterRevision(candidate: RevisionOrderFields, incumbent: RevisionOrderFields): boolean {
	if (!incumbent.blockHeight || candidate.blockHeight !== incumbent.blockHeight) {
		return false;
	}
	if (candidate.unixTime === undefined || incumbent.unixTime === undefined) {
		return false;
	}
	return unixTimeInSeconds(+candidate.unixTime) > unixTimeInSeconds(+incumbent.unixTime);
}
