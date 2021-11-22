"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArFSDAOAnonymous = exports.ArFSDAOType = exports.graphQLURL = void 0;
const query_1 = require("../utils/query");
const types_1 = require("../types");
const filter_methods_1 = require("../utils/filter_methods");
const folderHierarchy_1 = require("./folderHierarchy");
const arfs_drive_builders_1 = require("./arfs_builders/arfs_drive_builders");
const arfs_folder_builders_1 = require("./arfs_builders/arfs_folder_builders");
const arfs_file_builders_1 = require("./arfs_builders/arfs_file_builders");
const arfs_entities_1 = require("./arfs_entities");
exports.graphQLURL = 'https://arweave.net/graphql';
class ArFSDAOType {
}
exports.ArFSDAOType = ArFSDAOType;
/**
 * Performs all ArFS spec operations that do NOT require a wallet for signing or decryption
 */
class ArFSDAOAnonymous extends ArFSDAOType {
    constructor(arweave, appName = types_1.DEFAULT_APP_NAME, appVersion = types_1.DEFAULT_APP_VERSION) {
        super();
        this.arweave = arweave;
        this.appName = appName;
        this.appVersion = appVersion;
    }
    getOwnerForDriveId(driveId) {
        return __awaiter(this, void 0, void 0, function* () {
            const gqlQuery = query_1.buildQuery({
                tags: [
                    { name: 'Drive-Id', value: `${driveId}` },
                    { name: 'Entity-Type', value: 'drive' }
                ],
                sort: query_1.ASCENDING_ORDER
            });
            const response = yield this.arweave.api.post(exports.graphQLURL, gqlQuery);
            const edges = response.data.data.transactions.edges;
            if (!edges.length) {
                throw new Error(`Could not find a transaction with "Drive-Id": ${driveId}`);
            }
            const edgeOfFirstDrive = edges[0];
            const driveOwnerAddress = edgeOfFirstDrive.node.owner.address;
            return types_1.ADDR(driveOwnerAddress);
        });
    }
    getDriveIDForEntityId(entityId, gqlTypeTag) {
        return __awaiter(this, void 0, void 0, function* () {
            const gqlQuery = query_1.buildQuery({ tags: [{ name: gqlTypeTag, value: `${entityId}` }] });
            const response = yield this.arweave.api.post(exports.graphQLURL, gqlQuery);
            const { data } = response.data;
            const { transactions } = data;
            const edges = transactions.edges;
            if (!edges.length) {
                throw new Error(`Entity with ${gqlTypeTag} ${entityId} not found!`);
            }
            const driveIdTag = edges[0].node.tags.find((t) => t.name === 'Drive-Id');
            if (driveIdTag) {
                return types_1.EID(driveIdTag.value);
            }
            throw new Error(`No Drive-Id tag found for meta data transaction of ${gqlTypeTag}: ${entityId}`);
        });
    }
    getDriveOwnerForFolderId(folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getOwnerForDriveId(yield this.getDriveIdForFolderId(folderId));
        });
    }
    getDriveOwnerForFileId(fileId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getOwnerForDriveId(yield this.getDriveIdForFileId(fileId));
        });
    }
    getDriveIdForFileId(fileId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getDriveIDForEntityId(fileId, 'File-Id');
        });
    }
    getDriveIdForFolderId(folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getDriveIDForEntityId(folderId, 'Folder-Id');
        });
    }
    // Convenience function for known-public use cases
    getPublicDrive(driveId, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return new arfs_drive_builders_1.ArFSPublicDriveBuilder({ entityId: driveId, arweave: this.arweave, owner }).build();
        });
    }
    // Convenience function for known-private use cases
    getPublicFolder(folderId, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return new arfs_folder_builders_1.ArFSPublicFolderBuilder({ entityId: folderId, arweave: this.arweave, owner }).build();
        });
    }
    getPublicFile(fileId, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return new arfs_file_builders_1.ArFSPublicFileBuilder({ entityId: fileId, arweave: this.arweave, owner }).build();
        });
    }
    getAllDrivesForAddress(address, privateKeyData, latestRevisionsOnly = true) {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '';
            let hasNextPage = true;
            const allDrives = [];
            while (hasNextPage) {
                const gqlQuery = query_1.buildQuery({ tags: [{ name: 'Entity-Type', value: 'drive' }], cursor, owner: address });
                const response = yield this.arweave.api.post(exports.graphQLURL, gqlQuery);
                const { data } = response.data;
                const { transactions } = data;
                const { edges } = transactions;
                hasNextPage = transactions.pageInfo.hasNextPage;
                const drives = edges.map((edge) => __awaiter(this, void 0, void 0, function* () {
                    const { node } = edge;
                    cursor = edge.cursor;
                    const driveBuilder = arfs_drive_builders_1.SafeArFSDriveBuilder.fromArweaveNode(node, this.arweave, privateKeyData);
                    return driveBuilder.build(node);
                }));
                allDrives.push(...(yield Promise.all(drives)));
            }
            return latestRevisionsOnly ? allDrives.filter(filter_methods_1.latestRevisionFilterForDrives) : allDrives;
        });
    }
    getPublicFilesWithParentFolderIds(folderIDs, owner, latestRevisionsOnly = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '';
            let hasNextPage = true;
            const allFiles = [];
            while (hasNextPage) {
                const gqlQuery = query_1.buildQuery({
                    tags: [
                        { name: 'Parent-Folder-Id', value: folderIDs.map((fid) => fid.toString()) },
                        { name: 'Entity-Type', value: 'file' }
                    ],
                    cursor,
                    owner
                });
                const response = yield this.arweave.api.post(exports.graphQLURL, gqlQuery);
                const { data } = response.data;
                const { transactions } = data;
                const { edges } = transactions;
                hasNextPage = transactions.pageInfo.hasNextPage;
                const files = edges.map((edge) => __awaiter(this, void 0, void 0, function* () {
                    const { node } = edge;
                    cursor = edge.cursor;
                    const fileBuilder = arfs_file_builders_1.ArFSPublicFileBuilder.fromArweaveNode(node, this.arweave);
                    return fileBuilder.build(node);
                }));
                allFiles.push(...(yield Promise.all(files)));
            }
            return latestRevisionsOnly ? allFiles.filter(filter_methods_1.latestRevisionFilter) : allFiles;
        });
    }
    getAllFoldersOfPublicDrive({ driveId, owner, latestRevisionsOnly = false }) {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '';
            let hasNextPage = true;
            const allFolders = [];
            while (hasNextPage) {
                const gqlQuery = query_1.buildQuery({
                    tags: [
                        { name: 'Drive-Id', value: `${driveId}` },
                        { name: 'Entity-Type', value: 'folder' }
                    ],
                    cursor,
                    owner
                });
                const response = yield this.arweave.api.post(exports.graphQLURL, gqlQuery);
                const { data } = response.data;
                const { transactions } = data;
                const { edges } = transactions;
                hasNextPage = transactions.pageInfo.hasNextPage;
                const folders = edges.map((edge) => __awaiter(this, void 0, void 0, function* () {
                    const { node } = edge;
                    cursor = edge.cursor;
                    const folderBuilder = arfs_folder_builders_1.ArFSPublicFolderBuilder.fromArweaveNode(node, this.arweave);
                    return yield folderBuilder.build(node);
                }));
                allFolders.push(...(yield Promise.all(folders)));
            }
            return latestRevisionsOnly ? allFolders.filter(filter_methods_1.latestRevisionFilter) : allFolders;
        });
    }
    /**
     * Lists the children of certain public folder
     * @param {FolderID} folderId the folder ID to list children of
     * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
     * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
     * @returns {ArFSPublicFileOrFolderWithPaths[]} an array representation of the children and parent folder
     */
    listPublicFolder({ folderId, maxDepth, includeRoot, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Number.isInteger(maxDepth) || maxDepth < 0) {
                throw new Error('maxDepth should be a non-negative integer!');
            }
            const folder = yield this.getPublicFolder(folderId, owner);
            // Fetch all of the folder entities within the drive
            const driveIdOfFolder = folder.driveId;
            const allFolderEntitiesOfDrive = yield this.getAllFoldersOfPublicDrive({
                driveId: driveIdOfFolder,
                owner,
                latestRevisionsOnly: true
            });
            // Feed entities to FolderHierarchy
            const hierarchy = folderHierarchy_1.FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
            const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth - 1);
            const [, ...subFolderIDs] = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth);
            const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) => subFolderIDs.some((fid) => fid.equals(folder.entityId)));
            if (includeRoot) {
                childrenFolderEntities.unshift(folder);
            }
            // Fetch all file entities within all Folders of the drive
            const childrenFileEntities = yield this.getPublicFilesWithParentFolderIds(searchFolderIDs, owner, true);
            const children = [...childrenFolderEntities, ...childrenFileEntities];
            const entitiesWithPath = children.map((entity) => new arfs_entities_1.ArFSPublicFileOrFolderWithPaths(entity, hierarchy));
            return entitiesWithPath;
        });
    }
}
exports.ArFSDAOAnonymous = ArFSDAOAnonymous;
