import { expect } from 'chai';
import { BadRange, Range } from './range';

describe('Range class', () => {
	describe('constructor', () => {
		it('constructs with healthy inputs', () => {
			const r = new Range(1, 2);
			expect(r.start).to.equal(1);
			expect(r.end).to.equal(2);
		});

		it('allows a single-block range (start === end)', () => {
			const r = new Range(5, 5);
			expect(r.start).to.equal(5);
			expect(r.end).to.equal(5);
		});

		it('throws BadRange when start is greater than end', () => {
			expect(() => new Range(2, 1)).to.throw(BadRange);
		});

		it('throws BadRange on non-integer bounds', () => {
			expect(() => new Range(0.5, 2)).to.throw(BadRange);
			expect(() => new Range(0, 2.5)).to.throw(BadRange);
			expect(() => new Range(NaN, 2)).to.throw(BadRange);
		});
	});

	describe('isInRange', () => {
		it('is inclusive on both ends', () => {
			const r = new Range(10, 20);
			expect(r.isInRange(10)).to.be.true;
			expect(r.isInRange(20)).to.be.true;
			expect(r.isInRange(15)).to.be.true;
			expect(r.isInRange(9)).to.be.false;
			expect(r.isInRange(21)).to.be.false;
		});
	});

	describe('equals', () => {
		it('evaluates structural equality', () => {
			expect(new Range(0, 0).equals(new Range(0, 0))).to.be.true;
			expect(new Range(50, 100).equals(new Range(50, 100))).to.be.true;
			expect(new Range(50, 100).equals(new Range(50, 101))).to.be.false;
			expect(new Range(50, 100).equals(new Range(49, 100))).to.be.false;
		});
	});

	describe('intersection', () => {
		it('returns null for disjoint ranges', () => {
			expect(Range.intersection(new Range(0, 50), new Range(51, 100))).to.be.null;
		});

		it('returns null for contiguous (touching) but non-overlapping ranges', () => {
			// [0,4] and [5,9] touch but do not overlap.
			expect(Range.intersection(new Range(0, 4), new Range(5, 9))).to.be.null;
		});

		it('returns the overlap for partially intersecting ranges', () => {
			let i = Range.intersection(new Range(0, 100), new Range(50, 150))!;
			expect(i.start).to.equal(50);
			expect(i.end).to.equal(100);

			i = Range.intersection(new Range(50, 150), new Range(0, 100))!;
			expect(i.start).to.equal(50);
			expect(i.end).to.equal(100);
		});

		it('returns the inner range when one contains the other (either arg order)', () => {
			let i = Range.intersection(new Range(25, 50), new Range(0, 100))!;
			expect(i.start).to.equal(25);
			expect(i.end).to.equal(50);

			i = Range.intersection(new Range(0, 100), new Range(25, 50))!;
			expect(i.start).to.equal(25);
			expect(i.end).to.equal(50);
		});

		it('returns the shared range for identical inputs', () => {
			const i = Range.intersection(new Range(0, 100), new Range(0, 100))!;
			expect(i.start).to.equal(0);
			expect(i.end).to.equal(100);
		});

		it('detects a single-block overlap', () => {
			const i = Range.intersection(new Range(0, 5), new Range(5, 10))!;
			expect(i.start).to.equal(5);
			expect(i.end).to.equal(5);
		});
	});

	describe('union', () => {
		it('returns two ranges when disjoint and NOT contiguous', () => {
			const u = Range.union(new Range(0, 24), new Range(26, 100));
			expect(u.length).to.equal(2);
			expect(u[0].equals(new Range(0, 24))).to.be.true;
			expect(u[1].equals(new Range(26, 100))).to.be.true;
		});

		it('merges overlapping ranges into one', () => {
			const u = Range.union(new Range(0, 50), new Range(25, 100));
			expect(u.length).to.equal(1);
			expect(u[0].equals(new Range(0, 100))).to.be.true;
		});

		it('merges contiguous (adjacent) ranges into one', () => {
			// [0,50] and [51,100] touch → single [0,100].
			let u = Range.union(new Range(0, 50), new Range(51, 100));
			expect(u.length).to.equal(1);
			expect(u[0].equals(new Range(0, 100))).to.be.true;

			// Reverse order must merge too.
			u = Range.union(new Range(51, 100), new Range(0, 50));
			expect(u.length).to.equal(1);
			expect(u[0].equals(new Range(0, 100))).to.be.true;
		});

		it('merges when one range is nested inside the other', () => {
			const u = Range.union(new Range(0, 100), new Range(25, 50));
			expect(u.length).to.equal(1);
			expect(u[0].equals(new Range(0, 100))).to.be.true;
		});
	});

	describe('difference', () => {
		it('returns [] when a is fully contained in b', () => {
			expect(Range.difference(new Range(25, 50), new Range(0, 100))).to.deep.equal([]);
			expect(Range.difference(new Range(25, 50), new Range(25, 50))).to.deep.equal([]);
		});

		it('returns [a] when the ranges are disjoint', () => {
			const diff = Range.difference(new Range(0, 25), new Range(50, 100));
			expect(diff.length).to.equal(1);
			expect(diff[0].equals(new Range(0, 25))).to.be.true;
		});

		it('returns [a] when the ranges are contiguous but non-overlapping', () => {
			const diff = Range.difference(new Range(0, 25), new Range(26, 100));
			expect(diff.length).to.equal(1);
			expect(diff[0].equals(new Range(0, 25))).to.be.true;
		});

		it('splits into two ranges when b is strictly interior to a', () => {
			const diff = Range.difference(new Range(0, 100), new Range(25, 50));
			expect(diff.length).to.equal(2);
			expect(diff[0].equals(new Range(0, 24))).to.be.true;
			expect(diff[1].equals(new Range(51, 100))).to.be.true;
		});

		it('clips the end when b overlaps the tail of a', () => {
			const diff = Range.difference(new Range(50, 100), new Range(75, 200));
			expect(diff.length).to.equal(1);
			expect(diff[0].equals(new Range(50, 74))).to.be.true;
		});

		it('clips the start when b overlaps the head of a', () => {
			const diff = Range.difference(new Range(50, 100), new Range(0, 50));
			expect(diff.length).to.equal(1);
			expect(diff[0].equals(new Range(51, 100))).to.be.true;
		});

		it('handles single-block interior removal', () => {
			const diff = Range.difference(new Range(0, 2), new Range(1, 1));
			expect(diff.length).to.equal(2);
			expect(diff[0].equals(new Range(0, 0))).to.be.true;
			expect(diff[1].equals(new Range(2, 2))).to.be.true;
		});
	});
});
