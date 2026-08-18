import { expect } from 'chai';
import { performance } from 'perf_hooks';
import { ArFSPublicDrive, ArFSPublicFile } from '../arfs/arfs_entities';
import { EID, Mutable, TxID } from '../types';
import {
	fileFilter,
	folderFilter,
	keepLatestRevisions,
	keepLatestRevisionsForDrives,
	latestRevisionFilter,
	latestRevisionFilterForDrives
} from './filter_methods';
import {
	stubPrivateFile,
	stubPrivateFolder,
	stubPublicDrive,
	stubPublicFile,
	stubPublicFolder
} from '../../tests/stubs';

describe('The latestRevisionFilter function', () => {
	it('returns true when only entry in array matches the search entry', () => {
		const stubFile = stubPublicFile({});
		expect(latestRevisionFilter(stubFile, 0, [stubFile])).to.be.true;
	});

	it('returns true when search entry is the first in the entity array', () => {
		const stubFile = stubPublicFile({});
		const stubFile2 = stubPublicFile({ txId: TxID('0000000000000000000000000000000000000000001') });
		expect(latestRevisionFilter(stubFile, 0, [stubFile, stubFile2])).to.be.true;
	});

	it('returns false when search entry is not first in the entity array', () => {
		const stubFile = stubPublicFile({});
		const stubFile2 = stubPublicFile({ txId: TxID('0000000000000000000000000000000000000000001') });
		expect(latestRevisionFilter(stubFile, 0, [stubFile2, stubFile])).to.be.false;
	});
});

describe('The latestRevisionFilterForDrives function', () => {
	it('returns true when only entry in array matches the search entry', () => {
		const stubDrive = stubPublicDrive();
		expect(latestRevisionFilterForDrives(stubDrive, 0, [stubDrive])).to.be.true;
	});

	it('returns true when search entry is the first in the entity array', () => {
		const stubDrive = stubPublicDrive();
		const stubDrive2 = stubPublicDrive();
		(stubDrive2 as Mutable<ArFSPublicDrive>).txId = TxID('0000000000000000000000000000000000000000001');
		expect(latestRevisionFilterForDrives(stubDrive, 0, [stubDrive, stubDrive2])).to.be.true;
	});

	it('returns false when search entry is not first in the entity array', () => {
		const stubDrive = stubPublicDrive();
		const stubDrive2 = stubPublicDrive();
		(stubDrive2 as Mutable<ArFSPublicDrive>).txId = TxID('0000000000000000000000000000000000000000001');
		expect(latestRevisionFilterForDrives(stubDrive, 0, [stubDrive2, stubDrive])).to.be.false;
	});
});

describe('The fileFilter function', () => {
	it('returns true for an ArFSPublicFile', () => {
		expect(fileFilter(stubPublicFile({}))).to.be.true;
	});

	it('returns true for an ArFSPrivateFile', async () => {
		expect(fileFilter(await stubPrivateFile({}))).to.be.true;
	});

	it('returns false for an ArFSPublicFolder', async () => {
		expect(fileFilter(stubPublicFolder({}))).to.be.false;
	});

	it('returns false for an ArFSPrivateFolder', async () => {
		expect(fileFilter(await stubPrivateFolder({}))).to.be.false;
	});
});

describe('The folderFilter function', () => {
	it('returns false for an ArFSPublicFile', () => {
		expect(folderFilter(stubPublicFile({}))).to.be.false;
	});

	it('returns false for an ArFSPrivateFile', async () => {
		expect(folderFilter(await stubPrivateFile({}))).to.be.false;
	});

	it('returns false for an ArFSPublicFolder', () => {
		expect(folderFilter(stubPublicFolder({}))).to.be.true;
	});

	it('returns false for an ArFSPrivateFolder', async () => {
		expect(folderFilter(await stubPrivateFolder({}))).to.be.true;
	});
});

// ---------------------------------------------------------------------------
// SYNC-46 PR1: O(n) latest-revision helpers (keepLatestRevisions /
// keepLatestRevisionsForDrives) must be byte-identical to the legacy O(n²)
// `.filter(latestRevisionFilter[ForDrives])` on EVERY input. These suites run
// BOTH implementations over the same fixtures (a parity oracle) and assert the
// output arrays are element-for-element reference-equal, including adversarial
// orderings and at 40k scale, plus an O(n) perf regression guard.
// ---------------------------------------------------------------------------

// Deterministic id builders. EntityID must match the uuid-ish regex; TransactionID
// must be a 43-char [\w-] string. Distinct numbers => distinct ids.
const eidStr = (n: number): string => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const txidStr = (n: number): string => `${n}`.padStart(43, '0');
const makeFile = (entityIdNum: number, txIdNum: number): ArFSPublicFile =>
	stubPublicFile({ fileId: EID(eidStr(entityIdNum)), txId: TxID(txidStr(txIdNum)) });
const makeDrive = (driveIdNum: number, txIdNum: number): ArFSPublicDrive => {
	const drive = stubPublicDrive() as Mutable<ArFSPublicDrive>;
	drive.driveId = EID(eidStr(driveIdNum));
	drive.txId = TxID(txidStr(txIdNum));
	return drive as ArFSPublicDrive;
};

// Parity oracle: legacy `.filter(latestRevisionFilter)` vs new `keepLatestRevisions`.
const assertFileParity = (entities: ArFSPublicFile[], label: string): void => {
	const legacy = entities.filter(latestRevisionFilter);
	const next = keepLatestRevisions(entities);
	expect(next.length, `${label}: survivor count`).to.equal(legacy.length);
	legacy.forEach((entity, i) => {
		// reference-equality: filter never clones, so survivors must be the very same objects, in order
		expect(next[i], `${label}: element ${i} identity/order`).to.equal(entity);
	});
};

const assertDriveParity = (entities: ArFSPublicDrive[], label: string): void => {
	const legacy = entities.filter(latestRevisionFilterForDrives);
	const next = keepLatestRevisionsForDrives(entities);
	expect(next.length, `${label}: survivor count`).to.equal(legacy.length);
	legacy.forEach((entity, i) => {
		expect(next[i], `${label}: element ${i} identity/order`).to.equal(entity);
	});
};

describe('The keepLatestRevisions function (O(n) latestRevisionFilter replacement)', () => {
	it('reproduces the three legacy latestRevisionFilter cases', () => {
		const a = makeFile(1, 0);
		const b = makeFile(1, 1);
		assertFileParity([a], 'single match');
		assertFileParity([a, b], 'search entry first');
		assertFileParity([b, a], 'search entry not first');
	});

	describe('adversarial-ordering parity (legacy oracle vs O(n))', () => {
		it('empty array', () => assertFileParity([], 'empty'));

		it('single element', () => assertFileParity([makeFile(1, 1)], 'single'));

		it('all-same-entityId (only first-occurring revision survives)', () => {
			const entities = [makeFile(1, 10), makeFile(1, 11), makeFile(1, 12)];
			assertFileParity(entities, 'all-same');
			expect(keepLatestRevisions(entities)).to.have.lengthOf(1);
		});

		it('all-unique-entityId (every element survives)', () => {
			const entities = [makeFile(1, 1), makeFile(2, 2), makeFile(3, 3)];
			assertFileParity(entities, 'all-unique');
			expect(keepLatestRevisions(entities)).to.have.lengthOf(3);
		});

		it('non-contiguous interleaved revisions of multiple entities', () => {
			// e1: idx0,2,5 · e2: idx1,4 · e3: idx3  -> survivors = idx0, idx1, idx3
			const entities = [
				makeFile(1, 10),
				makeFile(2, 20),
				makeFile(1, 11),
				makeFile(3, 30),
				makeFile(2, 21),
				makeFile(1, 12)
			];
			assertFileParity(entities, 'interleaved');
			expect(keepLatestRevisions(entities)).to.have.lengthOf(3);
		});

		it('txIds not monotonic (first-occurrence wins, not min/max txId)', () => {
			// The array is only *assumed* newest-first; the filter keeps the FIRST element per
			// entityId regardless of txId magnitude. tx99 and tx1 must both be dropped.
			const entities = [makeFile(1, 5), makeFile(1, 99), makeFile(1, 1)];
			assertFileParity(entities, 'reverse/random tx order');
		});

		it('reverse-order clusters (same set, reversed) still parity-match', () => {
			const forward = [makeFile(1, 10), makeFile(1, 11), makeFile(2, 20), makeFile(2, 21)];
			assertFileParity(forward, 'clustered forward');
			assertFileParity([...forward].reverse(), 'clustered reversed');
		});

		it('duplicate txId: two distinct objects share entityId AND txId (legacy keeps BOTH)', () => {
			// This is the fidelity linchpin: latestRevisionFilter compares txId (not object
			// identity), so BOTH duplicates survive. A reference-identity rewrite would keep
			// only one and silently diverge here — keepLatestRevisions must keep both.
			const a = makeFile(1, 7);
			const b = makeFile(1, 7);
			expect(a).to.not.equal(b); // genuinely distinct objects
			assertFileParity([a, b], 'duplicate txId contiguous');
			expect(keepLatestRevisions([a, b])).to.have.lengthOf(2);
		});

		it('duplicate txId non-contiguous (first and third share txId; middle differs)', () => {
			const a = makeFile(1, 7);
			const b = makeFile(1, 8);
			const c = makeFile(1, 7);
			const survivors = keepLatestRevisions([a, b, c]);
			assertFileParity([a, b, c], 'duplicate txId non-contiguous');
			expect(survivors).to.deep.equal([a, c]);
		});

		it('medium interleave: 200 entityIds × 5 spread revisions (1000 entities)', () => {
			const entities: ArFSPublicFile[] = [];
			for (let i = 0; i < 1000; i++) {
				entities.push(makeFile(i % 200, i));
			}
			assertFileParity(entities, 'medium interleave');
			expect(keepLatestRevisions(entities)).to.have.lengthOf(200);
		});
	});

	it('parity oracle at 40,000 entities (mix of unique + non-contiguous multi-revision)', function () {
		// Runs the legacy O(n²) filter at 40k as the oracle — intentionally slow (~15s).
		this.timeout(180000);
		const TOTAL_ENTITIES = 40000;
		const UNIQUE_ENTITY_IDS = 25000; // entityIds 0..14999 appear twice (idx k and k+25000); 15000..24999 once
		const entities: ArFSPublicFile[] = [];
		for (let i = 0; i < TOTAL_ENTITIES; i++) {
			entities.push(makeFile(i % UNIQUE_ENTITY_IDS, i));
		}
		assertFileParity(entities, '40k mixed');
		expect(keepLatestRevisions(entities)).to.have.lengthOf(UNIQUE_ENTITY_IDS); // 25,000 survivors
	});

	it('perf guard: processes 40,000 entities in well under the O(n) budget', function () {
		this.timeout(20000);
		const TOTAL_ENTITIES = 40000;
		const UNIQUE_ENTITY_IDS = 25000;
		const entities: ArFSPublicFile[] = [];
		for (let i = 0; i < TOTAL_ENTITIES; i++) {
			entities.push(makeFile(i % UNIQUE_ENTITY_IDS, i));
		}
		const start = performance.now();
		const survivors = keepLatestRevisions(entities);
		const elapsedMs = performance.now() - start;
		expect(survivors).to.have.lengthOf(UNIQUE_ENTITY_IDS);
		// O(n) regression guard: a single pass over 40k plain objects is single-digit ms in
		// practice (~13ms observed); the 500ms bound is deliberately generous to avoid flakiness
		// while still catching any accidental reintroduction of O(n²) behavior.
		expect(elapsedMs, `keepLatestRevisions(40k) took ${elapsedMs.toFixed(1)}ms`).to.be.lessThan(500);
	});
});

describe('The keepLatestRevisionsForDrives function (O(n) latestRevisionFilterForDrives replacement)', () => {
	it('reproduces the three legacy latestRevisionFilterForDrives cases', () => {
		const a = makeDrive(1, 0);
		const b = makeDrive(1, 1);
		assertDriveParity([a], 'single match');
		assertDriveParity([a, b], 'search entry first');
		assertDriveParity([b, a], 'search entry not first');
	});

	describe('adversarial-ordering parity (legacy oracle vs O(n))', () => {
		it('empty array', () => assertDriveParity([], 'empty'));

		it('single element', () => assertDriveParity([makeDrive(1, 1)], 'single'));

		it('all-same-driveId (only first-occurring revision survives)', () => {
			const entities = [makeDrive(1, 10), makeDrive(1, 11), makeDrive(1, 12)];
			assertDriveParity(entities, 'all-same');
			expect(keepLatestRevisionsForDrives(entities)).to.have.lengthOf(1);
		});

		it('all-unique-driveId (every element survives)', () => {
			const entities = [makeDrive(1, 1), makeDrive(2, 2), makeDrive(3, 3)];
			assertDriveParity(entities, 'all-unique');
			expect(keepLatestRevisionsForDrives(entities)).to.have.lengthOf(3);
		});

		it('non-contiguous interleaved revisions of multiple drives', () => {
			const entities = [
				makeDrive(1, 10),
				makeDrive(2, 20),
				makeDrive(1, 11),
				makeDrive(3, 30),
				makeDrive(2, 21),
				makeDrive(1, 12)
			];
			assertDriveParity(entities, 'interleaved');
			expect(keepLatestRevisionsForDrives(entities)).to.have.lengthOf(3);
		});

		it('duplicate txId: distinct objects share driveId AND txId (legacy keeps BOTH)', () => {
			const a = makeDrive(1, 7);
			const b = makeDrive(1, 7);
			expect(a).to.not.equal(b);
			assertDriveParity([a, b], 'duplicate txId');
			expect(keepLatestRevisionsForDrives([a, b])).to.have.lengthOf(2);
		});
	});

	it('large-N parity oracle at 10,000 drives (mix of unique + multi-revision)', function () {
		this.timeout(60000);
		const TOTAL_DRIVES = 10000;
		const UNIQUE_DRIVE_IDS = 6000;
		const entities: ArFSPublicDrive[] = [];
		for (let i = 0; i < TOTAL_DRIVES; i++) {
			entities.push(makeDrive(i % UNIQUE_DRIVE_IDS, i));
		}
		assertDriveParity(entities, '10k mixed');
		expect(keepLatestRevisionsForDrives(entities)).to.have.lengthOf(UNIQUE_DRIVE_IDS);
	});

	it('perf guard: processes 40,000 drives in well under the O(n) budget', function () {
		this.timeout(20000);
		const TOTAL_DRIVES = 40000;
		const UNIQUE_DRIVE_IDS = 25000;
		const entities: ArFSPublicDrive[] = [];
		for (let i = 0; i < TOTAL_DRIVES; i++) {
			entities.push(makeDrive(i % UNIQUE_DRIVE_IDS, i));
		}
		const start = performance.now();
		const survivors = keepLatestRevisionsForDrives(entities);
		const elapsedMs = performance.now() - start;
		expect(survivors).to.have.lengthOf(UNIQUE_DRIVE_IDS);
		expect(elapsedMs, `keepLatestRevisionsForDrives(40k) took ${elapsedMs.toFixed(1)}ms`).to.be.lessThan(500);
	});
});
