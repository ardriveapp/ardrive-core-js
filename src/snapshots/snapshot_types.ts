import { EID, EntityID, GQLNodeInterface, GQLTagInterface, TransactionID, TxID } from '../types';
import { SnapshotTagName } from './snapshot_tags';

/**
 * A parsed ArFS snapshot metadata transaction (the "index" of a snapshot).
 *
 * Ported from the concept in ardrive-web `lib/entities/snapshot_entity.dart`
 * and `SnapshotItem.fromGQLNode`. The `[blockStart, blockEnd]` span is the
 * range of drive history this snapshot captures; the actual per-entity data
 * lives in the snapshot body (see {@link SnapshotData}).
 */
export interface SnapshotEntity {
	txId: TransactionID;
	driveId: EntityID;
	snapshotId?: EntityID;
	blockStart: number;
	blockEnd: number;
	dataStart?: number;
	dataEnd?: number;
	/** The block height the snapshot tx was mined at (from the GQL node). */
	blockHeight?: number;
	/** The block timestamp the snapshot tx was mined at (from the GQL node). */
	timestamp?: number;
}

/**
 * A single entry inside a snapshot body: the original GQL node of an ArFS
 * entity revision PLUS that entity's metadata bytes, both captured at snapshot
 * time.
 *
 * This co-location is the whole point of snapshots: replaying `gqlNode` gives
 * the entity's tags/owner/block, and `jsonMetadata` gives its metadata JSON —
 * so NO per-entity data-transaction GET is needed to reconstruct history.
 *
 * Ported from ardrive-web `TxSnapshot` (`lib/utils/snapshots/snapshot_types.dart`).
 * `jsonMetadata` is kept as a raw string here (the reference client utf8-encodes
 * it into bytes downstream); it may be `null` for entities that have no metadata
 * body (e.g. an already-obscured revision recorded for its GQL node only).
 */
export interface TxSnapshot {
	gqlNode: GQLNodeInterface;
	jsonMetadata: string | null;
}

/**
 * The parsed snapshot body. On chain this is the JSON document
 * `{"txSnapshots":[{gqlNode, jsonMetadata}, ...]}` stored as the snapshot
 * transaction's data payload, sorted in GQL (block) order.
 */
export interface SnapshotData {
	txSnapshots: TxSnapshot[];
}

function findTagValue(tags: GQLTagInterface[], name: string): string | undefined {
	return tags.find((tag) => tag.name === name)?.value;
}

function parseIntTag(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	// Match Dart's int.parse: strict base-10 integer, no trailing garbage.
	if (!/^[+-]?\d+$/.test(value.trim())) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parses a snapshot GQL node into a {@link SnapshotEntity}, mirroring
 * ardrive-web `SnapshotItem.fromGQLNode`.
 *
 * Fails soft: returns `null` (rather than throwing) when a required tag is
 * missing or the block span is unparseable, so a single malformed snapshot
 * never aborts a listing. Required tags: `Drive-Id`, `Block-Start`, `Block-End`.
 */
export function snapshotEntityFromGQLNode(node: GQLNodeInterface): SnapshotEntity | null {
	const tags = node.tags ?? [];

	const driveIdValue = findTagValue(tags, SnapshotTagName.driveId);
	const blockStart = parseIntTag(findTagValue(tags, SnapshotTagName.blockStart));
	const blockEnd = parseIntTag(findTagValue(tags, SnapshotTagName.blockEnd));

	if (driveIdValue === undefined || blockStart === undefined || blockEnd === undefined) {
		return null;
	}
	if (blockStart > blockEnd || blockStart < 0 || blockEnd < 0) {
		return null;
	}

	let txId: TransactionID;
	let driveId: EntityID;
	try {
		txId = TxID(node.id);
		driveId = EID(driveIdValue);
	} catch {
		return null;
	}

	let snapshotId: EntityID | undefined;
	const snapshotIdValue = findTagValue(tags, SnapshotTagName.snapshotId);
	if (snapshotIdValue !== undefined) {
		try {
			snapshotId = EID(snapshotIdValue);
		} catch {
			snapshotId = undefined;
		}
	}

	return {
		txId,
		driveId,
		snapshotId,
		blockStart,
		blockEnd,
		dataStart: parseIntTag(findTagValue(tags, SnapshotTagName.dataStart)),
		dataEnd: parseIntTag(findTagValue(tags, SnapshotTagName.dataEnd)),
		blockHeight: node.block?.height,
		timestamp: node.block?.timestamp
	};
}
