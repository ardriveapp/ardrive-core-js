import {
	ArFSDriveEntity,
	ArFSFileOrFolderEntity,
	ArFSPrivateFile,
	ArFSPrivateFolder,
	ArFSPublicFile,
	ArFSPublicFolder
} from '../arfs/arfs_entities';
import { EntityID, TransactionID } from '../types';
import { isSameBlockLaterRevision, RevisionOrderFields } from './revision_order';

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
 * Keeps the latest revision per key from an array assumed pre-sorted newest-first, in one O(n)
 * pass. The first-occurring revision wins, unless a later one is from the same block with a later
 * Unix-Time ({@link isSameBlockLaterRevision}). Survivors keep their original relative order, and
 * survival is by `txId`, so two elements sharing both key and `txId` both survive.
 */
function keepLatestRevisionsByKey<T extends { txId: TransactionID } & RevisionOrderFields>(
	entities: T[],
	keyOf: (entity: T) => string
): T[] {
	const latestByKey = new Map<string, T>();
	for (const entity of entities) {
		const key = keyOf(entity);
		const incumbent = latestByKey.get(key);
		if (incumbent === undefined || isSameBlockLaterRevision(entity, incumbent)) {
			latestByKey.set(key, entity);
		}
	}
	return entities.filter((entity) => `${entity.txId}` === `${latestByKey.get(keyOf(entity))?.txId}`);
}

/**
 * Returns only the latest revision of each entity from an array assumed pre-sorted
 * newest-first, in a single O(n) pass. This is the O(n) replacement for
 * `entities.filter(latestRevisionFilter)` (which is O(n²)); see {@link latestRevisionFilter}.
 *
 * An entity is kept iff its `txId` equals the `txId` of the FIRST-occurring element (by array
 * order) that shares its `entityId`, with one exception: among revisions mined in the same
 * block, the one with the later `Unix-Time` wins (see {@link isSameBlockLaterRevision}). A
 * gateway orders a block's revisions by position in the block, not by when they were written,
 * so without this a file hidden, renamed or re-uploaded moments after an earlier edit can show
 * the earlier edit. Where no two revisions of an entity share a known block height, the output
 * matches `entities.filter(latestRevisionFilter)` exactly.
 *
 * Because `.filter()` preserves order, the survivors appear in their original relative order.
 * Comparing `txId` (rather than object identity) keeps both elements in the degenerate case
 * where two distinct elements share both `entityId` and `txId`, as the legacy filter does.
 *
 * @param entities entities assumed pre-sorted newest-first (as the snapshot/listing path guarantees)
 */
export function keepLatestRevisions<T extends { entityId: EntityID; txId: TransactionID } & RevisionOrderFields>(
	entities: T[]
): T[] {
	return keepLatestRevisionsByKey(entities, (entity) => `${entity.entityId}`);
}

/**
 * Drive-keyed counterpart to {@link keepLatestRevisions}: the O(n) replacement for
 * `drives.filter(latestRevisionFilterForDrives)`, with the same same-block `Unix-Time` rule.
 *
 * @param entities drive entities assumed pre-sorted newest-first
 */
export function keepLatestRevisionsForDrives<
	T extends { driveId: EntityID; txId: TransactionID } & RevisionOrderFields
>(entities: T[]): T[] {
	return keepLatestRevisionsByKey(entities, (entity) => `${entity.driveId}`);
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
