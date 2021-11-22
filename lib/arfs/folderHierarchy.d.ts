import { ArFSFileOrFolderEntity } from './arfs_entities';
import { FolderID } from '../types';
export declare class FolderTreeNode {
    readonly folderId: FolderID;
    readonly parent?: FolderTreeNode | undefined;
    children: FolderTreeNode[];
    constructor(folderId: FolderID, parent?: FolderTreeNode | undefined, children?: FolderTreeNode[]);
    static fromEntity(folderEntity: ArFSFileOrFolderEntity): FolderTreeNode;
}
export declare class FolderHierarchy {
    private readonly folderIdToEntityMap;
    private readonly folderIdToNodeMap;
    private _rootNode?;
    constructor(folderIdToEntityMap: {
        [k: string]: ArFSFileOrFolderEntity;
    }, folderIdToNodeMap: {
        [k: string]: FolderTreeNode;
    });
    static newFromEntities(entities: ArFSFileOrFolderEntity[]): FolderHierarchy;
    private static setupNodesWithEntity;
    get rootNode(): FolderTreeNode;
    subTreeOf(folderId: FolderID, maxDepth?: number): FolderHierarchy;
    allFolderIDs(): FolderID[];
    nodeAndChildrenOf(node: FolderTreeNode, maxDepth: number): FolderTreeNode[];
    folderIdSubtreeFromFolderId(folderId: FolderID, maxDepth: number): FolderID[];
    pathToFolderId(folderId: FolderID): string;
    entityPathToFolderId(folderId: FolderID): string;
    txPathToFolderId(folderId: FolderID): string;
}
