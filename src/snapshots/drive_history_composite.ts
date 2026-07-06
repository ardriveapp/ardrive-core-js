import { ArweaveAddress, GQLNodeInterface, TransactionID } from '../types';
import { HeightRange } from './height_range';
import { computeSnapshotSubRanges, SnapshotSpan } from './snapshot_obscuring';
import { SnapshotData } from './snapshot_types';
import { SnapshotTagName } from './snapshot_tags';

/**
 * A drive snapshot paired with its already-parsed body. Extends {@link SnapshotSpan}
 * so it can be fed straight into {@link computeSnapshotSubRanges}. Snapshots that are
 * fully obscured by a newer snapshot may carry an empty body (`txSnapshots: []`) —
 * they contribute nothing and are skipped by the composite.
 */
export interface SnapshotWithBody extends SnapshotSpan {
	txId: TransactionID;
	data: SnapshotData;
}

/** A `txId -> metadata bytes` cache entry harvested from a snapshot body. */
export interface SnapshotMetadataCacheEntry {
	txId: string;
	data: Buffer;
}

/**
 * A block-height range that must still be walked over the live GraphQL API because
 * no snapshot covers it. `maxBlockHeight === undefined` means "open ended" (the
 * newest segment, above every snapshot — everything mined since the last snapshot).
 */
export interface TailQueryBound {
	minBlockHeight: number;
	maxBlockHeight?: number;
}

/**
 * The result of merging a drive's snapshots with the plan for its live tail.
 *
 * Ported from the model in ardrive-web's `DriveHistoryComposite`
 * (`lib/utils/snapshots/drive_history_composite.dart`): each block-height segment
 * of the drive's history is served by EXACTLY ONE source — a snapshot body or the
 * live GraphQL tail — with newer snapshots winning on overlap. Here we split that
 * into (a) the entity revision nodes the snapshots exclusively own and (b) the
 * disjoint tail bounds the caller must still query over GraphQL. Because the tail
 * bounds are the set-complement of the claimed range, the snapshot nodes and any
 * tail nodes are guaranteed block-disjoint — one source per segment.
 */
export interface DriveHistoryComposite {
	/** File/folder entity revision nodes owned by snapshots (already newest-wins de-obscured). */
	snapshotNodes: GQLNodeInterface[];
	/** `txId -> metadata bytes` entries to seed into the metadata cache before building entities. */
	metadataCache: SnapshotMetadataCacheEntry[];
	/** Block-height ranges the caller must still fetch from the live GraphQL API. */
	tailBounds: TailQueryBound[];
	/** The union of block heights claimed across all (non-obscured) snapshots. */
	claimed: HeightRange;
}

/** Entity types that appear in a drive listing (drive/snapshot entries are ignored). */
const LISTABLE_ENTITY_TYPES = new Set(['file', 'folder']);

function getTagValue(node: GQLNodeInterface, name: string): string | undefined {
	return node.tags?.find((tag) => tag.name === name)?.value;
}

function heightIsInRange(height: number, range: HeightRange): boolean {
	return range.rangeSegments.some((segment) => segment.isInRange(height));
}

/**
 * Computes the live-tail query bounds: the set-complement of the snapshot-claimed
 * heights within `[0, ∞)`. This generalizes the foundation's `computeLiveTail`
 * (which needs a finite upper bound) to an OPEN top segment, so the newest tail
 * segment does not require knowing the drive's current block height up front.
 *
 *  - a gap below the first claimed segment (if it doesn't start at 0) → bounded,
 *  - any gaps between claimed segments → bounded,
 *  - everything above the last claimed segment → open-ended (`maxBlockHeight` omitted).
 *
 * When nothing is claimed, the whole drive is the tail (`[{ min: 0 }]`).
 */
export function liveTailBounds(claimed: HeightRange): TailQueryBound[] {
	const segments = HeightRange.normalizeSegments(claimed.rangeSegments);
	if (segments.length === 0) {
		return [{ minBlockHeight: 0 }];
	}

	const bounds: TailQueryBound[] = [];

	// Heights below the first claimed segment.
	if (segments[0].start > 0) {
		bounds.push({ minBlockHeight: 0, maxBlockHeight: segments[0].start - 1 });
	}

	// Gaps strictly between consecutive claimed segments.
	for (let i = 0; i < segments.length - 1; i++) {
		const gapStart = segments[i].end + 1;
		const gapEnd = segments[i + 1].start - 1;
		if (gapStart <= gapEnd) {
			bounds.push({ minBlockHeight: gapStart, maxBlockHeight: gapEnd });
		}
	}

	// Everything above the last claimed segment (the live tail proper).
	bounds.push({ minBlockHeight: segments[segments.length - 1].end + 1 });

	return bounds;
}

/**
 * Builds the {@link DriveHistoryComposite} for a drive from its snapshots (newest
 * first, with parsed bodies) and the drive owner.
 *
 * For each snapshot, this:
 *  1. computes the sub-ranges it EXCLUSIVELY owns via the newest-snapshot-wins
 *     obscuring model ({@link computeSnapshotSubRanges}); fully-obscured snapshots
 *     contribute nothing;
 *  2. emits every file/folder entity node in its body whose block height falls in
 *     an owned sub-range AND whose owner matches the drive owner (matching the
 *     owner-scoped live GraphQL queries — a snapshot must never inject an entity a
 *     normal owner-scoped walk wouldn't see);
 *  3. harvests each such entity's embedded `jsonMetadata` into the metadata cache.
 *     For private drives the stored `jsonMetadata` is base64(ciphertext) (verified
 *     against ardrive-web's `create_snapshot_cubit.dart`), so it is base64-decoded
 *     back to ciphertext bytes; the entity builder still decrypts it with the drive
 *     key. For public drives it is plaintext JSON (utf8 bytes).
 *
 * Pure and side-effect-free: the caller decides what to do with the nodes, cache,
 * and tail bounds. Never throws — a malformed span is skipped by the obscuring model.
 */
export function buildDriveHistoryComposite(params: {
	snapshotsNewestFirst: SnapshotWithBody[];
	owner: ArweaveAddress;
	isPrivate: boolean;
	lastBlockHeight?: number;
}): DriveHistoryComposite {
	const { snapshotsNewestFirst, owner, isPrivate, lastBlockHeight } = params;
	const ownerAddress = `${owner}`;

	const { obscured, claimed } = computeSnapshotSubRanges(snapshotsNewestFirst, lastBlockHeight);

	const snapshotNodes: GQLNodeInterface[] = [];
	const metadataCache: SnapshotMetadataCacheEntry[] = [];
	const seenTxIds = new Set<string>();

	for (const { snapshot, subRanges } of obscured) {
		if (subRanges.rangeSegments.length === 0) {
			// Fully obscured by a newer snapshot — owns no heights, contributes nothing.
			continue;
		}

		for (const entry of snapshot.data.txSnapshots) {
			const node = entry.gqlNode;

			const entityType = getTagValue(node, SnapshotTagName.entityType);
			if (entityType === undefined || !LISTABLE_ENTITY_TYPES.has(entityType)) {
				continue;
			}

			// Owner-scope: match the owner-scoped live GraphQL queries exactly.
			if (node.owner?.address !== ownerAddress) {
				continue;
			}

			const height = node.block?.height;
			if (height === undefined || height === null) {
				continue;
			}
			if (!heightIsInRange(height, subRanges)) {
				continue;
			}

			// A newer snapshot's owned range never overlaps an older one's, so a txId
			// can only appear once across owned ranges; guard against duplicate bodies.
			if (seenTxIds.has(node.id)) {
				continue;
			}
			seenTxIds.add(node.id);

			snapshotNodes.push(node);

			if (entry.jsonMetadata !== null && entry.jsonMetadata !== undefined) {
				const bytes = isPrivate
					? Buffer.from(entry.jsonMetadata, 'base64')
					: Buffer.from(entry.jsonMetadata, 'utf8');
				metadataCache.push({ txId: node.id, data: bytes });
			}
		}
	}

	return {
		snapshotNodes,
		metadataCache,
		tailBounds: liveTailBounds(claimed),
		claimed
	};
}

/**
 * Orders entity revision nodes newest-first (descending block height). The listing
 * path's `latestRevisionFilter` treats index 0 of an entity's revisions as the
 * latest, so the merged snapshot+tail node stream MUST be newest-first or a stale
 * revision would win — a data-integrity bug. Nodes with no block height (unmined)
 * sort to the front (treated as newest), matching the gateway's HEIGHT_DESC order.
 */
export function sortNodesNewestFirst(nodes: GQLNodeInterface[]): GQLNodeInterface[] {
	return [...nodes].sort((a, b) => {
		const ah = a.block?.height ?? Number.MAX_SAFE_INTEGER;
		const bh = b.block?.height ?? Number.MAX_SAFE_INTEGER;
		return bh - ah;
	});
}
