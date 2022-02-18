import {
	ArFSDriveEntity,
	ArFSFileOrFolderEntity,
	ArFSPrivateFile,
	ArFSPrivateFolder,
	ArFSPublicFile,
	ArFSPublicFolder
} from '../arfs/arfs_entities';

/**
 * @name lastRevisionFilter is a standard JS find/filter function intended to
 * filter only the last revision of entities within an array
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
