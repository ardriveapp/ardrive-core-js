import { Range } from './range';

/**
 * Error thrown when a {@link HeightRange} segment contains a negative bound.
 * Block heights are non-negative, so a negative segment indicates a bug.
 */
export class BadHeightRange extends Error {
	constructor(
		public readonly start: number,
		public readonly end: number
	) {
		super(`Bad height range: (${start}; ${end})`);
		this.name = 'BadHeightRange';
	}
}

/**
 * A set of non-overlapping block-height {@link Range} segments.
 *
 * This is a faithful port of ardrive-web's `HeightRange`
 * (`lib/utils/snapshots/height_range.dart`). It lifts the single-interval set
 * algebra of {@link Range} to a set of intervals, which is exactly what the
 * snapshot "obscuring" model needs: a snapshot claims a set of heights, newer
 * snapshots obscure older ones, and the live tail is whatever heights remain
 * unclaimed.
 *
 * The `difference` operation IS the obscuring operation: given the heights a
 * snapshot spans (`total`) and the heights already claimed by newer snapshots
 * (`obscuredBy`), `HeightRange.difference(total, obscuredBy)` yields the
 * sub-ranges that this snapshot exclusively owns.
 */
export class HeightRange {
	constructor(public readonly rangeSegments: Range[]) {
		for (const range of rangeSegments) {
			if (range.start < 0 || range.end < 0) {
				throw new BadHeightRange(range.start, range.end);
			}
		}
	}

	/** Total number of block heights covered across all segments. */
	get totalCount(): number {
		return this.rangeSegments.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
	}

	toString(): string {
		return `HeightRange{rangeSegments: [${this.rangeSegments.map((r) => r.toString()).join(', ')}]}`;
	}

	/**
	 * The set difference `a \ b`. Subtracts every segment of `b` from every
	 * segment of `a`, one segment of `b` at a time. This is the "obscuring"
	 * operation used to compute a snapshot's unclaimed (live) sub-ranges.
	 */
	static difference(a: HeightRange, b: HeightRange): HeightRange {
		let prevDiff: Range[] = a.rangeSegments;
		for (const rangeB of b.rangeSegments) {
			const currDiff: Range[] = [];
			for (const rangeA of prevDiff) {
				currDiff.push(...Range.difference(rangeA, rangeB));
			}
			prevDiff = currDiff;
		}
		return new HeightRange(prevDiff);
	}

	/**
	 * The set union `a ∪ b`. Concatenates all segments and normalizes them into
	 * a minimal set of sorted, non-overlapping, non-contiguous ranges.
	 */
	static union(a: HeightRange, b: HeightRange): HeightRange {
		const mixedRanges = [...a.rangeSegments, ...b.rangeSegments];
		return new HeightRange(HeightRange.normalizeSegments(mixedRanges));
	}

	/**
	 * The set intersection `a ∩ b`. Implemented via the identity
	 * `a ∩ b = a \ (a \ b)`, reusing the well-tested difference primitive.
	 */
	static intersection(a: HeightRange, b: HeightRange): HeightRange {
		return HeightRange.difference(a, HeightRange.difference(a, b));
	}

	/**
	 * Collapses an arbitrary list of ranges into the minimal sorted set of
	 * non-overlapping, non-contiguous ranges. Empty input yields an empty set.
	 */
	static normalizeSegments(rangeSegments: Range[]): Range[] {
		if (rangeSegments.length === 0) {
			return [];
		}

		const sortedSegments = [...rangeSegments].sort((x, y) => x.start - y.start);
		const normalized: Range[] = [];

		let value = sortedSegments[0];
		for (const element of sortedSegments.slice(1)) {
			const union = Range.union(value, element);
			if (union.length === 1) {
				// The ranges overlap or are contiguous: keep merging.
				value = union[0];
			} else {
				// There is a gap. Since the segments are sorted by start, union[0]
				// cannot overlap any later segment, so it is finalized. Keep looping
				// with union[1] to check it against the remaining segments.
				normalized.push(union[0]);
				value = union[1];
			}
		}
		normalized.push(value);
		return normalized;
	}
}
