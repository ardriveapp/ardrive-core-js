"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FolderHierarchy = exports.FolderTreeNode = void 0;
const types_1 = require("../types");
const arfs_folder_builders_1 = require("./arfs_builders/arfs_folder_builders");
class FolderTreeNode {
    constructor(folderId, parent, children = []) {
        this.folderId = folderId;
        this.parent = parent;
        this.children = children;
    }
    static fromEntity(folderEntity) {
        const node = new FolderTreeNode(folderEntity.entityId);
        return node;
    }
}
exports.FolderTreeNode = FolderTreeNode;
class FolderHierarchy {
    constructor(folderIdToEntityMap, folderIdToNodeMap) {
        this.folderIdToEntityMap = folderIdToEntityMap;
        this.folderIdToNodeMap = folderIdToNodeMap;
    }
    static newFromEntities(entities) {
        const folderIdToEntityMap = entities.reduce((accumulator, entity) => {
            return Object.assign(accumulator, { [`${entity.entityId}`]: entity });
        }, {});
        const folderIdToNodeMap = {};
        for (const entity of entities) {
            this.setupNodesWithEntity(entity, folderIdToEntityMap, folderIdToNodeMap);
        }
        return new FolderHierarchy(folderIdToEntityMap, folderIdToNodeMap);
    }
    static setupNodesWithEntity(entity, folderIdToEntityMap, folderIdToNodeMap) {
        const folderIdKeyIsPresent = Object.keys(folderIdToNodeMap).includes(`${entity.entityId}`);
        const parentFolderIdKeyIsPresent = Object.keys(folderIdToNodeMap).includes(`${entity.parentFolderId}`);
        if (!folderIdKeyIsPresent) {
            if (!parentFolderIdKeyIsPresent) {
                const parentFolderEntity = folderIdToEntityMap[`${entity.parentFolderId}`];
                if (parentFolderEntity) {
                    this.setupNodesWithEntity(parentFolderEntity, folderIdToEntityMap, folderIdToNodeMap);
                }
            }
            const parent = folderIdToNodeMap[`${entity.parentFolderId}`];
            if (parent) {
                const node = new FolderTreeNode(entity.entityId, parent);
                parent.children.push(node);
                folderIdToNodeMap[`${entity.entityId}`] = node;
            }
            else {
                // this one is supposed to be the new root
                const rootNode = new FolderTreeNode(entity.entityId);
                folderIdToNodeMap[`${entity.entityId}`] = rootNode;
            }
        }
    }
    get rootNode() {
        if (this._rootNode) {
            return this._rootNode;
        }
        const someFolderId = Object.keys(this.folderIdToEntityMap)[0];
        let tmpNode = this.folderIdToNodeMap[someFolderId];
        while (tmpNode.parent && this.folderIdToNodeMap[`${tmpNode.parent.folderId}`]) {
            tmpNode = tmpNode.parent;
        }
        this._rootNode = tmpNode;
        return tmpNode;
    }
    subTreeOf(folderId, maxDepth = Number.MAX_SAFE_INTEGER) {
        const newRootNode = this.folderIdToNodeMap[`${folderId}`];
        const subTreeNodes = this.nodeAndChildrenOf(newRootNode, maxDepth);
        const entitiesMapping = subTreeNodes.reduce((accumulator, node) => {
            return Object.assign(accumulator, { [`${node.folderId}`]: this.folderIdToEntityMap[`${node.folderId}`] });
        }, {});
        const nodesMapping = subTreeNodes.reduce((accumulator, node) => {
            return Object.assign(accumulator, { [`${node.folderId}`]: node });
        }, {});
        return new FolderHierarchy(entitiesMapping, nodesMapping);
    }
    allFolderIDs() {
        return Object.keys(this.folderIdToEntityMap).map((eid) => types_1.EID(eid));
    }
    nodeAndChildrenOf(node, maxDepth) {
        const subTreeEntities = [node];
        if (maxDepth > 0) {
            node.children.forEach((child) => {
                subTreeEntities.push(...this.nodeAndChildrenOf(child, maxDepth - 1));
            });
        }
        return subTreeEntities;
    }
    folderIdSubtreeFromFolderId(folderId, maxDepth) {
        const rootNode = this.folderIdToNodeMap[`${folderId}`];
        const subTree = [rootNode.folderId];
        switch (maxDepth) {
            case -1:
                // Recursion stopping condition - hit the max allowable depth
                break;
            default: {
                // Recursion stopping condition - no further child nodes to recurse to
                rootNode.children
                    .map((node) => node.folderId)
                    .forEach((childFolderID) => {
                    subTree.push(...this.folderIdSubtreeFromFolderId(childFolderID, maxDepth - 1));
                });
                break;
            }
        }
        return subTree;
    }
    pathToFolderId(folderId) {
        if (this.rootNode.parent) {
            throw new Error(`Can't compute paths from sub-tree`);
        }
        if (`${folderId}` === arfs_folder_builders_1.ROOT_FOLDER_ID_PLACEHOLDER) {
            return '/';
        }
        let folderNode = this.folderIdToNodeMap[`${folderId}`];
        const nodesInPathToFolder = [folderNode];
        while (folderNode.parent && !folderNode.folderId.equals(this.rootNode.folderId)) {
            folderNode = folderNode.parent;
            nodesInPathToFolder.push(folderNode);
        }
        const olderFirstNodesInPathToFolder = nodesInPathToFolder.reverse();
        const olderFirstNamesOfNodesInPath = olderFirstNodesInPathToFolder.map((n) => this.folderIdToEntityMap[`${n.folderId}`].name);
        const stringPath = olderFirstNamesOfNodesInPath.join('/');
        return `/${stringPath}/`;
    }
    entityPathToFolderId(folderId) {
        if (this.rootNode.parent) {
            throw new Error(`Can't compute paths from sub-tree`);
        }
        if (`${folderId}` === arfs_folder_builders_1.ROOT_FOLDER_ID_PLACEHOLDER) {
            return '/';
        }
        let folderNode = this.folderIdToNodeMap[`${folderId}`];
        const nodesInPathToFolder = [folderNode];
        while (folderNode.parent && !folderNode.folderId.equals(this.rootNode.folderId)) {
            folderNode = folderNode.parent;
            nodesInPathToFolder.push(folderNode);
        }
        const olderFirstNodesInPathToFolder = nodesInPathToFolder.reverse();
        const olderFirstFolderIDsOfNodesInPath = olderFirstNodesInPathToFolder.map((n) => n.folderId);
        const stringPath = olderFirstFolderIDsOfNodesInPath.join('/');
        return `/${stringPath}/`;
    }
    txPathToFolderId(folderId) {
        if (this.rootNode.parent) {
            throw new Error(`Can't compute paths from sub-tree`);
        }
        if (`${folderId}` === arfs_folder_builders_1.ROOT_FOLDER_ID_PLACEHOLDER) {
            return '/';
        }
        let folderNode = this.folderIdToNodeMap[`${folderId}`];
        const nodesInPathToFolder = [folderNode];
        while (folderNode.parent && !folderNode.folderId.equals(this.rootNode.folderId)) {
            folderNode = folderNode.parent;
            nodesInPathToFolder.push(folderNode);
        }
        const olderFirstNodesInPathToFolder = nodesInPathToFolder.reverse();
        const olderFirstTxTDsOfNodesInPath = olderFirstNodesInPathToFolder.map((n) => this.folderIdToEntityMap[`${n.folderId}`].txId);
        const stringPath = olderFirstTxTDsOfNodesInPath.join('/');
        return `/${stringPath}/`;
    }
}
exports.FolderHierarchy = FolderHierarchy;
