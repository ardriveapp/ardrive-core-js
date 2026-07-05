import { HeightRange } from './height_range';
import { Range } from './range';

/** The minimal block-height span a snapshot claims. */
export interface SnapshotSpan {
	blockStart: number;
	blockEnd: number;
}

/** A snapshot paired with the block heights it exclusively owns. */
export interface ObscuredSnapshot<T extends SnapshotSpan> {
	snapshot: T;
	/** The heights this snapshot owns after newer snapshots obscured it. */
	subRanges: HeightRange;
}

export interface SnapshotObscuringResult<T extends SnapshotSpan> {
	/**
	 * Each accepted snapshot with its unclaimed (live) sub-ranges, in the same
	 * order as the (HEIGHT_DESC) input. Snapshots whose sub-ranges are empty are
	 * still included — the caller decides whether to skip them.
	 */
	obscured: ObscuredSnapshot<T>[];
	/**
	 * The union of every block-height range claimed across all accepted
	 * snapshots (plus the optional `lastBlockHeight` prefix). Subtract this from
	 * the drive's full range to get the live tail (see {@link computeLiveTail}).
	 */
	claimed: HeightRange;
	/** Snapshots skipped because their block span was malformed. */
	skipped: T[];
}

/**
 * Implements the snapshot "newest-snapshot-wins" obscuring model, ported from
 * ardrive-web's `SnapshotItem.instantiateAll`
 * (`lib/utils/snapshots/snapshot_item.dart`).
 *
 * Given snapshots sorted newest-first (HEIGHT_DESC — the order the snapshot GQL
 * query returns), each snapshot claims only the block heights not already
 * claimed by a newer snapshot. This guarantees every block height is replayed
 * from at most one snapshot, so a drive's history can be reconstructed from the
 * snapshots without duplicate or conflicting entity revisions.
 *
 * Fails soft: a snapshot with a malformed span (`blockStart > blockEnd`, or
 * negative/non-integer bounds) is skipped rather than throwing, because
 * snapshots are an optimization and must never break correctness.
 *
 * @param snapshotsNewestFirst snapshots ordered by descending block height
 * @param lastBlockHeight if provided, heights `[0, lastBlockHeight]` are treated
 *        as already-claimed before processing begins (an incremental-sync floor)
 */
export function computeSnapshotSubRanges<T extends SnapshotSpan>(
	snapshotsNewestFirst: T[],
	lastBlockHeight?: number
): SnapshotObscuringResult<T> {
	let obscuredBy = new HeightRange(
		lastBlockHeight !== undefined && lastBlockHeight >= 0 ? [new Range(0, lastBlockHeight)] : []
	);

	const obscured: ObscuredSnapshot<T>[] = [];
	const skipped: T[] = [];

	for (const snapshot of snapshotsNewestFirst) {
		let totalHeightRange: HeightRange;
		try {
			// Catches inverted (start > end), negative, and non-integer spans.
			totalHeightRange = new HeightRange([new Range(snapshot.blockStart, snapshot.blockEnd)]);
		} catch {
			// Malformed block span — skip, don't let a bad snapshot break the sync.
			skipped.push(snapshot);
			continue;
		}

		const subRanges = HeightRange.difference(totalHeightRange, obscuredBy);
		obscured.push({ snapshot, subRanges });

		obscuredBy = HeightRange.union(obscuredBy, totalHeightRange);
	}

	return { obscured, claimed: obscuredBy, skipped };
}

/**
 * The live tail: the block heights of a drive not covered by any snapshot.
 * These are the heights that still require a normal GQL entity walk; everything
 * inside `claimed` can be replayed straight from snapshot bodies.
 *
 * @param currentBlockHeight the drive's newest known block height (inclusive)
 * @param claimed the union of ranges claimed by snapshots (see
 *        {@link computeSnapshotSubRanges})
 */
export function computeLiveTail(currentBlockHeight: number, claimed: HeightRange): HeightRange {
	const fullRange = new HeightRange([new Range(0, currentBlockHeight)]);
	return HeightRange.difference(fullRange, claimed);
}
