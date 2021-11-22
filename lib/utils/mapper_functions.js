"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileConflictInfoMap = exports.folderToNameAndIdMap = exports.entityToNameMap = void 0;
function entityToNameMap(entity) {
    return entity.name;
}
exports.entityToNameMap = entityToNameMap;
function folderToNameAndIdMap(entity) {
    return { folderId: entity.entityId, folderName: entity.name };
}
exports.folderToNameAndIdMap = folderToNameAndIdMap;
function fileConflictInfoMap(entity) {
    return { fileId: entity.entityId, fileName: entity.name, lastModifiedDate: entity.lastModifiedDate };
}
exports.fileConflictInfoMap = fileConflictInfoMap;
