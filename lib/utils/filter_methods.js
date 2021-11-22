"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.folderFilter = exports.fileFilter = exports.latestRevisionFilterForDrives = exports.latestRevisionFilter = void 0;
/**
 * @name lastRevisionFilter is a standard JS find/filter function intended to
 * filter only the last revision of entities within an array
 *
 * @param {ArFSFileOrFolderEntity} entity the iterated entity
 * @param {number} _index the iterated index
 * @param {ArFSFileOrFolderEntity[]} allEntities the array of all entities
 * @returns {boolean}
 */
function latestRevisionFilter(entity, _index, allEntities) {
    const allRevisions = allEntities.filter((e) => e.entityId.equals(entity.entityId));
    const latestRevision = allRevisions[0];
    return entity.txId.equals(latestRevision.txId);
}
exports.latestRevisionFilter = latestRevisionFilter;
/**
 * @name latestRevisionFilterForDrives is a standard JS find/filter function intended to
 * filter only the last revision of entities within an array
 *
 * @param {ArFSDriveEntity} entity the iterated entity
 * @param {number} _index the iterated index
 * @param {ArFSDriveEntity[]} allEntities the array of all entities
 * @returns {boolean}
 */
function latestRevisionFilterForDrives(entity, _index, allEntities) {
    const allRevisions = allEntities.filter((e) => e.driveId.equals(entity.driveId));
    const latestRevision = allRevisions[0];
    return entity.txId.equals(latestRevision.txId);
}
exports.latestRevisionFilterForDrives = latestRevisionFilterForDrives;
function fileFilter(entity) {
    return entity.entityType === 'file';
}
exports.fileFilter = fileFilter;
function folderFilter(entity) {
    return entity.entityType === 'folder';
}
exports.folderFilter = folderFilter;
