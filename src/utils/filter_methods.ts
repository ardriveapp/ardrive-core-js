import {
	ArFSDriveEntity,
	ArFSFileOrFolderEntity,
	ArFSPrivateFile,
	ArFSPrivateFolder,
	ArFSPublicFile,
	ArFSPublicFolder
} from '../arfs/arfs_entities';
import { EntityID, TransactionID } from '../types';

/**
 * @name lastRevisionFilter is a standard JS find/filter function intended to
 * filter only the last revision of entities within an array
 *
 * @deprecated Prefer {@link keepLatestRevisions}. Used as `array.filter(latestRevisionFilter)`,
 * this runs an O(n) scan of `allEntities` for every element — O(n²) overall, which stalls the
 * event loop on large drives (~40k entities ≈ 1.6 billion comparisons). `keepLatestRevisions`
 * computes the identical result in a single O(n) pass. Kept exported (unchanged) for backwards
 * compatibility with external consumers and the existing test contract.
 *
 * @param {ArFSFileOrFolderEntity} entity the iterated entity
 * @param {number} _index the iterated index
 * @param {ArFSFileOrFolderEntity[]} allEntities the array of all entities
 * @returns {boolean}
 */
export function latestRevisionFilter(
	entity: ArFSFileOrFolderEntity<'file' | 'folder'>,
	_index: number,
	allEntities: ArFSFileOrFolderEntity<'file' | 'folder'>[]
): boolean {
	const allRevisions = allEntities.filter((e) => e.entityId.equals(entity.entityId));
	const latestRevision = allRevisions[0];
	return entity.txId.equals(latestRevision.txId);
}

/**
 * @name latestRevisionFilterForDrives is a standard JS find/filter function intended to
 * filter only the last revision of entities within an array
 *
 * @deprecated Prefer {@link keepLatestRevisionsForDrives} — same O(n²) → O(n) rationale as
 * {@link latestRevisionFilter}. Kept exported (unchanged) for backwards compatibility.
 *
 * @param {ArFSDriveEntity} entity the iterated entity
 * @param {number} _index the iterated index
 * @param {ArFSDriveEntity[]} allEntities the array of all entities
 * @returns {boolean}
 */
export function latestRevisionFilterForDrives(
	entity: ArFSDriveEntity,
	_index: number,
	allEntities: ArFSDriveEntity[]
): boolean {
	const allRevisions = allEntities.filter((e) => e.driveId.equals(entity.driveId));
	const latestRevision = allRevisions[0];
	return entity.txId.equals(latestRevision.txId);
}

/**
 * Returns only the latest revision of each entity from an array assumed pre-sorted
 * newest-first, in a single O(n) pass. This is the O(n) drop-in replacement for
 * `entities.filter(latestRevisionFilter)` (which is O(n²)); see {@link latestRevisionFilter}.
 *
 * Output is byte-identical to `entities.filter(latestRevisionFilter)` for every input:
 * an entity is kept iff its `txId` equals the `txId` of the FIRST-occurring element (by
 * array order) that shares its `entityId`. Because `.filter()` preserves order, the survivors
 * appear in their original relative order (stable). Comparing `txId` (rather than object
 * identity) reproduces `latestRevisionFilter` exactly even in the degenerate case where two
 * distinct elements share both `entityId` and `txId` — the legacy filter keeps both, and so
 * does this. The `${...}` stringification of `entityId`/`txId` is equivalent to their
 * `.equals()` (both compare the underlying id string), so this is a faithful map-keyed rewrite.
 *
 * @param entities entities assumed pre-sorted newest-first (as the snapshot/listing path guarantees)
 */
export function keepLatestRevisions<T extends { entityId: EntityID; txId: TransactionID }>(entities: T[]): T[] {
	const firstRevisionTxIdByEntityId = new Map<string, string>();
	for (const entity of entities) {
		const key = `${entity.entityId}`;
		if (!firstRevisionTxIdByEntityId.has(key)) {
			firstRevisionTxIdByEntityId.set(key, `${entity.txId}`);
		}
	}
	return entities.filter((entity) => `${entity.txId}` === firstRevisionTxIdByEntityId.get(`${entity.entityId}`));
}

/**
 * Drive-keyed counterpart to {@link keepLatestRevisions}: the O(n) drop-in replacement for
 * `drives.filter(latestRevisionFilterForDrives)`. Keeps a drive iff its `txId` equals the
 * `txId` of the first-occurring element sharing its `driveId`. Output is byte-identical to
 * the legacy `.filter(latestRevisionFilterForDrives)` for every input (same reasoning as
 * {@link keepLatestRevisions}).
 *
 * @param entities drive entities assumed pre-sorted newest-first
 */
export function keepLatestRevisionsForDrives<T extends { driveId: EntityID; txId: TransactionID }>(entities: T[]): T[] {
	const firstRevisionTxIdByDriveId = new Map<string, string>();
	for (const entity of entities) {
		const key = `${entity.driveId}`;
		if (!firstRevisionTxIdByDriveId.has(key)) {
			firstRevisionTxIdByDriveId.set(key, `${entity.txId}`);
		}
	}
	return entities.filter((entity) => `${entity.txId}` === firstRevisionTxIdByDriveId.get(`${entity.driveId}`));
}

export function fileFilter<T extends ArFSPrivateFile | ArFSPublicFile>(
	entity: ArFSFileOrFolderEntity<'file' | 'folder'>
): entity is T {
	return entity.entityType === 'file';
}

export function folderFilter<T extends ArFSPublicFolder | ArFSPrivateFolder>(
	entity: ArFSFileOrFolderEntity<'file' | 'folder'>
): entity is T {
	return entity.entityType === 'folder';
}
