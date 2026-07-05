/**
 * On-chain ArFS snapshot tag constants.
 *
 * These MUST match the tag names/values the reference client (ardrive-web)
 * writes on chain, or snapshots produced by one client will be invisible to the
 * other. Verified against ardrive-web
 * `packages/ardrive_utils/lib/src/entity_tag.dart` (EntityTag / EntityTypeTag /
 * ContentTypeTag) and the `SnapshotEntityHistory` GQL query.
 */

/** Tag names carried by an ArFS snapshot metadata transaction. */
export const SnapshotTagName = {
	entityType: 'Entity-Type',
	driveId: 'Drive-Id',
	snapshotId: 'Snapshot-Id',
	blockStart: 'Block-Start',
	blockEnd: 'Block-End',
	dataStart: 'Data-Start',
	dataEnd: 'Data-End',
	contentType: 'Content-Type'
} as const;

/** The `Entity-Type` tag value that identifies a snapshot transaction. */
export const SNAPSHOT_ENTITY_TYPE = 'snapshot';

/** The `Content-Type` tag value of a snapshot body (always plain JSON). */
export const SNAPSHOT_CONTENT_TYPE = 'application/json';

/** Tag names that MUST be present for a snapshot transaction to be usable. */
export const REQUIRED_SNAPSHOT_TAG_NAMES = [
	SnapshotTagName.driveId,
	SnapshotTagName.blockStart,
	SnapshotTagName.blockEnd
] as const;
