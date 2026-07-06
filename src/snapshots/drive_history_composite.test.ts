import { expect } from 'chai';
import { ADDR, GQLNodeInterface, TxID } from '../types';
import { HeightRange } from './height_range';
import { Range } from './range';
import {
	buildDriveHistoryComposite,
	liveTailBounds,
	SnapshotWithBody,
	sortNodesNewestFirst
} from './drive_history_composite';
import { SnapshotData } from './snapshot_types';

const OWNER = 'iKryOeZQMONi2965nKz528htMMN_sBcjlhc-VncoRjA';
const OTHER_OWNER = 'zzzzOeZQMONi2965nKz528htMMN_sBcjlhc-Vnczzzz';

/** Builds a minimal GQL node good enough for the composite (id/owner/block/tags). */
function node(params: {
	id: string;
	entityType: 'file' | 'folder' | 'drive' | 'snapshot';
	entityId: string;
	height: number | undefined;
	owner?: string;
	extraTags?: { name: string; value: string }[];
}): GQLNodeInterface {
	const idTagName = params.entityType === 'folder' ? 'Folder-Id' : 'File-Id';
	const tags = [
		{ name: 'Entity-Type', value: params.entityType },
		{ name: idTagName, value: params.entityId },
		...(params.extraTags ?? [])
	];
	return {
		id: params.id,
		owner: { address: params.owner ?? OWNER },
		block: params.height === undefined ? undefined : { height: params.height },
		tags
	} as unknown as GQLNodeInterface;
}

function snapshot(
	blockStart: number,
	blockEnd: number,
	txId: string,
	txSnapshots: SnapshotData['txSnapshots']
): SnapshotWithBody {
	return { blockStart, blockEnd, txId: TxID(txId.padEnd(43, 'a')), data: { txSnapshots } };
}

function bounds(hr: HeightRange): { min: number; max?: number }[] {
	return liveTailBounds(hr).map((b) => ({ min: b.minBlockHeight, max: b.maxBlockHeight }));
}

describe('DriveHistoryComposite', () => {
	describe('liveTailBounds', () => {
		it('opens the tail above a single [0, X] claim', () => {
			expect(bounds(new HeightRange([new Range(0, 100)]))).to.deep.equal([{ min: 101, max: undefined }]);
		});

		it('covers the range below a claim that does not start at 0', () => {
			expect(bounds(new HeightRange([new Range(10, 100)]))).to.deep.equal([
				{ min: 0, max: 9 },
				{ min: 101, max: undefined }
			]);
		});

		it('fills interior gaps between claimed segments and opens the top', () => {
			expect(bounds(new HeightRange([new Range(0, 50), new Range(100, 150)]))).to.deep.equal([
				{ min: 51, max: 99 },
				{ min: 151, max: undefined }
			]);
		});

		it('treats an empty claim as an entirely-live drive', () => {
			expect(bounds(new HeightRange([]))).to.deep.equal([{ min: 0, max: undefined }]);
		});
	});

	describe('sortNodesNewestFirst', () => {
		it('orders by descending block height so latest-revision selection is correct', () => {
			const nodes = [
				node({ id: 'a', entityType: 'file', entityId: 'f1', height: 10 }),
				node({ id: 'b', entityType: 'file', entityId: 'f1', height: 30 }),
				node({ id: 'c', entityType: 'file', entityId: 'f1', height: 20 })
			];
			expect(sortNodesNewestFirst(nodes).map((n) => n.id)).to.deep.equal(['b', 'c', 'a']);
		});

		it('sorts unmined (no block) nodes to the front as newest', () => {
			const nodes = [
				node({ id: 'a', entityType: 'file', entityId: 'f1', height: 10 }),
				node({ id: 'pending', entityType: 'file', entityId: 'f1', height: undefined })
			];
			expect(sortNodesNewestFirst(nodes)[0].id).to.equal('pending');
		});
	});

	describe('buildDriveHistoryComposite', () => {
		it('returns an all-live tail and no nodes for empty snapshots', () => {
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes).to.deep.equal([]);
			expect(result.metadataCache).to.deep.equal([]);
			expect(bounds(result.claimed)).to.deep.equal([{ min: 0, max: undefined }]);
		});

		it('emits a snapshot body entity within the owned range and caches its metadata', () => {
			const entry = {
				gqlNode: node({ id: 'file-tx', entityType: 'file', entityId: 'f1', height: 50 }),
				jsonMetadata: '{"name":"a.txt"}'
			};
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [snapshot(0, 100, 'snapA', [entry])],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes.map((n) => n.id)).to.deep.equal(['file-tx']);
			expect(result.metadataCache).to.have.lengthOf(1);
			expect(result.metadataCache[0].txId).to.equal('file-tx');
			// public: metadata stored as plaintext utf8 bytes
			expect(result.metadataCache[0].data.toString('utf8')).to.equal('{"name":"a.txt"}');
			// tail opens above the [0,100] claim
			expect(bounds(result.claimed)).to.deep.equal([{ min: 101, max: undefined }]);
		});

		it('newest-snapshot-wins: entities of a fully-obscured older snapshot are dropped', () => {
			const newer = snapshot(0, 100, 'snapNew', [
				{
					gqlNode: node({ id: 'new-file', entityType: 'file', entityId: 'f1', height: 40 }),
					jsonMetadata: '{"name":"new"}'
				}
			]);
			const older = snapshot(0, 50, 'snapOld', [
				{
					gqlNode: node({ id: 'old-file', entityType: 'file', entityId: 'f1', height: 40 }),
					jsonMetadata: '{"name":"old"}'
				}
			]);
			// Newest-first order.
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [newer, older],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			// Only the newer snapshot's node survives; the older is fully obscured.
			expect(result.snapshotNodes.map((n) => n.id)).to.deep.equal(['new-file']);
		});

		it('splits ownership at the segment boundary of an overlap', () => {
			// newer owns [51,100], older owns [0,50].
			const newer = snapshot(51, 100, 'snapNew', [
				{
					gqlNode: node({ id: 'new-in', entityType: 'file', entityId: 'f1', height: 60 }),
					jsonMetadata: '{"n":1}'
				},
				// A body row below the owned range must be ignored (obscured to older).
				{
					gqlNode: node({ id: 'new-below', entityType: 'file', entityId: 'f2', height: 20 }),
					jsonMetadata: '{"n":2}'
				}
			]);
			const older = snapshot(0, 50, 'snapOld', [
				{
					gqlNode: node({ id: 'old-in', entityType: 'file', entityId: 'f3', height: 20 }),
					jsonMetadata: '{"n":3}'
				}
			]);
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [newer, older],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes.map((n) => n.id).sort()).to.deep.equal(['new-in', 'old-in']);
			// Contiguous [0,100] claim → single open tail.
			expect(bounds(result.claimed)).to.deep.equal([{ min: 101, max: undefined }]);
		});

		it('excludes body entities whose height is outside the owned sub-range', () => {
			const entry = {
				gqlNode: node({ id: 'too-high', entityType: 'file', entityId: 'f1', height: 200 }),
				jsonMetadata: '{"n":1}'
			};
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [snapshot(0, 100, 'snapA', [entry])],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes).to.deep.equal([]);
			expect(result.metadataCache).to.deep.equal([]);
		});

		it('excludes body entities not owned by the drive owner', () => {
			const entry = {
				gqlNode: node({ id: 'foreign', entityType: 'file', entityId: 'f1', height: 50, owner: OTHER_OWNER }),
				jsonMetadata: '{"n":1}'
			};
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [snapshot(0, 100, 'snapA', [entry])],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes).to.deep.equal([]);
		});

		it('ignores non-listable (drive/snapshot) body entries', () => {
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [
					snapshot(0, 100, 'snapA', [
						{
							gqlNode: node({ id: 'drive-tx', entityType: 'drive', entityId: 'd1', height: 10 }),
							jsonMetadata: '{}'
						},
						{
							gqlNode: node({ id: 'snap-tx', entityType: 'snapshot', entityId: 's1', height: 10 }),
							jsonMetadata: '{}'
						},
						{
							gqlNode: node({ id: 'folder-tx', entityType: 'folder', entityId: 'fo1', height: 10 }),
							jsonMetadata: '{"name":"root"}'
						}
					])
				],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes.map((n) => n.id)).to.deep.equal(['folder-tx']);
		});

		it('does not cache when a body entry has null metadata (cache miss stays a network path)', () => {
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [
					snapshot(0, 100, 'snapA', [
						{
							gqlNode: node({ id: 'no-meta', entityType: 'file', entityId: 'f1', height: 50 }),
							jsonMetadata: null
						}
					])
				],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			// The node is still surfaced (its GQL revision counts) but there is no cache seed.
			expect(result.snapshotNodes.map((n) => n.id)).to.deep.equal(['no-meta']);
			expect(result.metadataCache).to.deep.equal([]);
		});

		it('base64-decodes private metadata back to ciphertext for the decrypt path', () => {
			const ciphertext = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
			const entry = {
				gqlNode: node({
					id: 'priv-file',
					entityType: 'file',
					entityId: 'f1',
					height: 50,
					extraTags: [{ name: 'Cipher-IV', value: 'someiv' }]
				}),
				jsonMetadata: ciphertext.toString('base64')
			};
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [snapshot(0, 100, 'snapA', [entry])],
				owner: ADDR(OWNER),
				isPrivate: true
			});
			expect(result.metadataCache).to.have.lengthOf(1);
			// Stored bytes must equal the raw ciphertext so the builder can AES-GCM decrypt it.
			expect([...result.metadataCache[0].data]).to.deep.equal([...ciphertext]);
		});

		it('drops a malformed-span snapshot (range becomes live tail) — fail soft', () => {
			// blockStart > blockEnd is malformed → obscuring skips it → nothing claimed.
			const result = buildDriveHistoryComposite({
				snapshotsNewestFirst: [
					snapshot(100, 50, 'badSnap', [
						{
							gqlNode: node({ id: 'x', entityType: 'file', entityId: 'f1', height: 60 }),
							jsonMetadata: '{}'
						}
					])
				],
				owner: ADDR(OWNER),
				isPrivate: false
			});
			expect(result.snapshotNodes).to.deep.equal([]);
			// Nothing claimed → the entire drive is queried live (full-replay-equivalent tail).
			expect(bounds(result.claimed)).to.deep.equal([{ min: 0, max: undefined }]);
		});
	});
});
