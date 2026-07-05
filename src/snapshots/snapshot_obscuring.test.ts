import { expect } from 'chai';
import { HeightRange } from './height_range';
import { Range } from './range';
import { computeLiveTail, computeSnapshotSubRanges, SnapshotSpan } from './snapshot_obscuring';

function segs(hr: HeightRange): [number, number][] {
	return hr.rangeSegments.map((r) => [r.start, r.end]);
}

function rangeOf(start: number, end: number): Range {
	return new Range(start, end);
}

describe('snapshot obscuring model', () => {
	describe('computeSnapshotSubRanges', () => {
		it('returns empty results for no snapshots', () => {
			const result = computeSnapshotSubRanges([]);
			expect(result.obscured).to.deep.equal([]);
			expect(segs(result.claimed)).to.deep.equal([]);
			expect(result.skipped).to.deep.equal([]);
		});

		it('gives disjoint snapshots their full ranges and unions the claim', () => {
			// Newest-first (HEIGHT_DESC).
			const snapshots: SnapshotSpan[] = [
				{ blockStart: 100, blockEnd: 200 },
				{ blockStart: 0, blockEnd: 99 }
			];
			const result = computeSnapshotSubRanges(snapshots);
			expect(segs(result.obscured[0].subRanges)).to.deep.equal([[100, 200]]);
			expect(segs(result.obscured[1].subRanges)).to.deep.equal([[0, 99]]);
			// [100,200] ∪ [0,99] are contiguous → [0,200].
			expect(segs(result.claimed)).to.deep.equal([[0, 200]]);
		});

		it('lets the newer snapshot win the overlap', () => {
			const snapshots: SnapshotSpan[] = [
				{ blockStart: 50, blockEnd: 200 }, // newer
				{ blockStart: 0, blockEnd: 100 } // older, overlaps [50,100]
			];
			const result = computeSnapshotSubRanges(snapshots);
			expect(segs(result.obscured[0].subRanges)).to.deep.equal([[50, 200]]);
			// Older snapshot only owns the part not covered by the newer one.
			expect(segs(result.obscured[1].subRanges)).to.deep.equal([[0, 49]]);
			expect(segs(result.claimed)).to.deep.equal([[0, 200]]);
		});

		it('fully obscures an older snapshot nested inside a newer one', () => {
			const snapshots: SnapshotSpan[] = [
				{ blockStart: 0, blockEnd: 300 }, // newer, covers everything
				{ blockStart: 100, blockEnd: 200 } // older, fully obscured
			];
			const result = computeSnapshotSubRanges(snapshots);
			expect(segs(result.obscured[0].subRanges)).to.deep.equal([[0, 300]]);
			expect(segs(result.obscured[1].subRanges)).to.deep.equal([]);
			expect(segs(result.claimed)).to.deep.equal([[0, 300]]);
		});

		it('treats [0, lastBlockHeight] as pre-claimed (incremental floor)', () => {
			const snapshots: SnapshotSpan[] = [{ blockStart: 0, blockEnd: 100 }];
			const result = computeSnapshotSubRanges(snapshots, 50);
			// Heights 0..50 already synced → snapshot only contributes 51..100.
			expect(segs(result.obscured[0].subRanges)).to.deep.equal([[51, 100]]);
			expect(segs(result.claimed)).to.deep.equal([[0, 100]]);
		});

		it('skips malformed snapshots (fails soft) without breaking the rest', () => {
			const snapshots: SnapshotSpan[] = [
				{ blockStart: 200, blockEnd: 100 }, // inverted → skipped
				{ blockStart: -5, blockEnd: 10 }, // negative → skipped
				{ blockStart: 0, blockEnd: 50 } // valid
			];
			const result = computeSnapshotSubRanges(snapshots);
			expect(result.obscured.length).to.equal(1);
			expect(segs(result.obscured[0].subRanges)).to.deep.equal([[0, 50]]);
			expect(result.skipped.length).to.equal(2);
		});

		it('preserves the original snapshot reference on each obscured entry', () => {
			const snap = { blockStart: 0, blockEnd: 10, txId: 'abc' };
			const result = computeSnapshotSubRanges([snap]);
			expect(result.obscured[0].snapshot).to.equal(snap);
		});
	});

	describe('computeLiveTail', () => {
		it('returns the heights above the claimed union', () => {
			const claimed = new HeightRange([rangeOf(0, 200)]);
			expect(segs(computeLiveTail(250, claimed))).to.deep.equal([[201, 250]]);
		});

		it('returns empty when snapshots cover up to the current height', () => {
			const claimed = new HeightRange([rangeOf(0, 250)]);
			expect(segs(computeLiveTail(250, claimed))).to.deep.equal([]);
		});

		it('includes interior gaps left by the snapshots', () => {
			const claimed = new HeightRange([rangeOf(0, 100), rangeOf(200, 250)]);
			// Gap 101..199 plus tail 251..300 are unclaimed.
			expect(segs(computeLiveTail(300, claimed))).to.deep.equal([
				[101, 199],
				[251, 300]
			]);
		});
	});
});
