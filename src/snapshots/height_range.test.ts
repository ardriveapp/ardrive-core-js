import { expect } from 'chai';
import { BadHeightRange, HeightRange } from './height_range';
import { Range } from './range';

/** Convenience: assert a HeightRange equals the given [start,end] pairs in order. */
function expectSegments(hr: HeightRange, expected: [number, number][]): void {
	expect(hr.rangeSegments.map((r) => [r.start, r.end])).to.deep.equal(expected);
}

describe('HeightRange class', () => {
	describe('constructor', () => {
		it('throws BadHeightRange on a negative bound', () => {
			expect(() => new HeightRange([new Range(-1, 0)])).to.throw(BadHeightRange);
		});

		it('accepts an empty set of segments', () => {
			const hr = new HeightRange([]);
			expect(hr.rangeSegments).to.deep.equal([]);
			expect(hr.totalCount).to.equal(0);
		});

		it('accepts healthy segments and reports totalCount inclusively', () => {
			const hr = new HeightRange([new Range(0, 0), new Range(10, 19)]);
			expect(hr.rangeSegments.length).to.equal(2);
			expect(hr.totalCount).to.equal(1 + 10);
		});
	});

	describe('normalizeSegments', () => {
		it('returns [] for empty input', () => {
			expect(HeightRange.normalizeSegments([])).to.deep.equal([]);
		});

		it('sorts and merges overlapping / contiguous segments', () => {
			const normalized = HeightRange.normalizeSegments([
				new Range(51, 100),
				new Range(0, 50),
				new Range(90, 120)
			]);
			expect(normalized.map((r) => [r.start, r.end])).to.deep.equal([[0, 120]]);
		});

		it('keeps disjoint segments separate and sorted', () => {
			const normalized = HeightRange.normalizeSegments([new Range(200, 300), new Range(0, 50)]);
			expect(normalized.map((r) => [r.start, r.end])).to.deep.equal([
				[0, 50],
				[200, 300]
			]);
		});
	});

	describe('difference (the obscuring operation)', () => {
		it('splits into two ranges when B (single block) is interior to A', () => {
			const a = new HeightRange([new Range(0, 100)]);
			const b = new HeightRange([new Range(50, 50)]);
			expectSegments(HeightRange.difference(a, b), [
				[0, 49],
				[51, 100]
			]);
		});

		it('returns empty when B (as multiple segments) fully covers A', () => {
			const a = new HeightRange([new Range(0, 100)]);
			const b = new HeightRange([new Range(0, 50), new Range(51, 100)]);
			expectSegments(HeightRange.difference(a, b), []);
		});

		it('returns A when B is empty', () => {
			const a = new HeightRange([new Range(0, 100)]);
			const b = new HeightRange([]);
			expectSegments(HeightRange.difference(a, b), [[0, 100]]);
		});

		it('returns a single middle range when B clips both ends of A', () => {
			const a = new HeightRange([new Range(0, 100)]);
			const b = new HeightRange([new Range(0, 50), new Range(99, 2000)]);
			expectSegments(HeightRange.difference(a, b), [[51, 98]]);
		});

		it('returns empty when every sub-range of A is shadowed by B', () => {
			const a = new HeightRange([new Range(0, 0), new Range(100, 101)]);
			const b = new HeightRange([new Range(0, 50), new Range(99, 2000)]);
			expectSegments(HeightRange.difference(a, b), []);
		});
	});

	describe('union', () => {
		it('preserves the count of sub-ranges when none intersect', () => {
			const a = new HeightRange([new Range(0, 25)]);
			const b = new HeightRange([new Range(50, 100), new Range(150, 200)]);
			expectSegments(HeightRange.union(a, b), [
				[0, 25],
				[50, 100],
				[150, 200]
			]);
		});

		it('collapses to a single sub-range when all intersect', () => {
			const a = new HeightRange([new Range(0, 200)]);
			const b = new HeightRange([new Range(50, 100), new Range(150, 250)]);
			expectSegments(HeightRange.union(a, b), [[0, 250]]);
		});

		it('merges some (contiguous) while keeping others separate', () => {
			const a = new HeightRange([new Range(0, 25)]);
			const b = new HeightRange([new Range(26, 100), new Range(150, 200)]);
			expectSegments(HeightRange.union(a, b), [
				[0, 100],
				[150, 200]
			]);
		});

		it('unions two empty ranges into an empty range (no crash)', () => {
			expectSegments(HeightRange.union(new HeightRange([]), new HeightRange([])), []);
		});
	});

	describe('intersection', () => {
		it('returns the overlap of two single ranges', () => {
			const a = new HeightRange([new Range(0, 100)]);
			const b = new HeightRange([new Range(50, 150)]);
			expectSegments(HeightRange.intersection(a, b), [[50, 100]]);
		});

		it('returns empty for disjoint ranges', () => {
			const a = new HeightRange([new Range(0, 50)]);
			const b = new HeightRange([new Range(100, 200)]);
			expectSegments(HeightRange.intersection(a, b), []);
		});

		it('intersects multi-segment ranges', () => {
			const a = new HeightRange([new Range(0, 50), new Range(100, 200)]);
			const b = new HeightRange([new Range(25, 120)]);
			expectSegments(HeightRange.intersection(a, b), [
				[25, 50],
				[100, 120]
			]);
		});

		it('is empty when either side is empty', () => {
			const a = new HeightRange([new Range(0, 50)]);
			expectSegments(HeightRange.intersection(a, new HeightRange([])), []);
			expectSegments(HeightRange.intersection(new HeightRange([]), a), []);
		});
	});
});
