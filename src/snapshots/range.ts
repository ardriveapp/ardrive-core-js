import { Equatable } from '../types/equatable';

/**
 * Error thrown when a {@link Range} is constructed with an invalid interval
 * (e.g. `start` greater than `end`, or non-integer bounds).
 */
export class BadRange extends Error {
	constructor(
		public readonly start: number,
		public readonly end: number
	) {
		super(`Bad range: (${start}; ${end})`);
		this.name = 'BadRange';
	}
}

/**
 * An inclusive interval of block heights `[start, end]`.
 *
 * This is a faithful port of ardrive-web's `Range`
 * (`lib/utils/snapshots/range.dart`) so that snapshot range math produces
 * results that are byte-for-byte compatible with the reference client. The
 * three set operations (union / difference / intersection) are the primitives
 * on top of which {@link HeightRange} and the snapshot "obscuring" model are
 * built.
 *
 * Bounds are inclusive on both ends: a `Range(0, 0)` contains exactly the
 * single block height `0`.
 */
export class Range implements Equatable<Range> {
	constructor(
		public readonly start: number,
		public readonly end: number
	) {
		if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
			throw new BadRange(start, end);
		}
	}

	/** Returns true when `value` falls within the inclusive interval. */
	isInRange(value: number): boolean {
		return value >= this.start && value <= this.end;
	}

	equals(other: Range): boolean {
		return this.start === other.start && this.end === other.end;
	}

	toString(): string {
		return `Range: (${this.start}; ${this.end})`;
	}

	/**
	 * The intersection (overlap) of two ranges, or `null` when they are
	 * disjoint. Contiguous-but-not-overlapping ranges (e.g. `[0,4]` and
	 * `[5,9]`) do NOT intersect — see {@link Range.union} for merge semantics.
	 */
	static intersection(a: Range, b: Range): Range | null {
		const startOfBFallsInA = b.start >= a.start && a.end >= b.start;
		const endOfBFallsInA = b.end <= a.end && a.start <= b.end;
		const somePointOfBFallsInA = startOfBFallsInA || endOfBFallsInA;
		const aIsFullyIncludedInB = a.start > b.start && a.end < b.end;

		if (somePointOfBFallsInA) {
			return new Range(Math.max(a.start, b.start), Math.min(a.end, b.end));
		} else if (aIsFullyIncludedInB) {
			return a;
		}

		// The ranges don't intersect.
		return null;
	}

	/**
	 * The union of two ranges. Returns a single merged range when the inputs
	 * overlap OR are contiguous (touching, e.g. `[0,4] ∪ [5,9] = [0,9]`),
	 * otherwise returns both inputs unchanged.
	 */
	static union(a: Range, b: Range): Range[] {
		const intersection = Range.intersection(a, b);
		const endOfATouchesStartOfB = a.end + 1 === b.start;
		const endOfBTouchesStartOfA = b.end + 1 === a.start;
		const rangesAreContiguous = endOfATouchesStartOfB || endOfBTouchesStartOfA;

		if (intersection !== null || rangesAreContiguous) {
			return [new Range(Math.min(a.start, b.start), Math.max(a.end, b.end))];
		}
		return [a, b];
	}

	/**
	 * The set difference `a \ b` (the portion of `a` not covered by `b`).
	 * Returns:
	 *  - `[]` when `a` is fully covered by `b`,
	 *  - one range when `b` clips a single end of `a`,
	 *  - two ranges when `b` is strictly interior to `a` (splitting it),
	 *  - `[a]` when the ranges are disjoint.
	 */
	static difference(a: Range, b: Range): Range[] {
		const intersection = Range.intersection(a, b);

		if (intersection !== null) {
			const startsMatch = intersection.start === a.start;
			const endsMatch = intersection.end === a.end;
			if (startsMatch && endsMatch) {
				// a is fully included in b, the diff is void
				return [];
			} else if (startsMatch) {
				// the intersection matches the start of a; the difference is at the end
				return [new Range(intersection.end + 1, a.end)];
			} else if (endsMatch) {
				// the intersection matches the end of a; the difference is at the start
				return [new Range(a.start, intersection.start - 1)];
			} else {
				// b is strictly interior to a; the difference is at the start and end
				return [new Range(a.start, intersection.start - 1), new Range(intersection.end + 1, a.end)];
			}
		}

		// The ranges don't intersect, the difference is the whole of a.
		return [a];
	}
}
