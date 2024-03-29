import { expect } from 'chai';
import {
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDAltTwo,
	stubEntityIDGrandchild,
	stubEntityIDParent,
	stubEntityIDRoot,
	stubPublicFolder
} from '../../tests/stubs';
import { FolderHierarchy, FolderTreeNode } from '../exports';
import { EntityID } from '../types';
import { RootFolderID } from './arfs_builders/arfs_folder_builders';

describe('FolderHierarchy class', () => {
	/*
	 * The stubbed folders describes the following tree
	 * - Root Folder/
	 * - Root Folder/Parent Folder/
	 * - Root Folder/Parent Folder/Child Folder #1/
	 * - Root Folder/Parent Folder/Child Folder #2/
	 * - Root Folder/Parent Folder/Child Folder #3/
	 * - Root Folder/Parent Folder/Child Folder #1/Grand child folder/
	 */

	// Root folder
	const stubRootFolder = stubPublicFolder({
		folderId: stubEntityIDRoot,
		parentFolderId: new RootFolderID(),
		folderName: 'Root Folder'
	});
	// Depth 1
	const stubParentFolder = stubPublicFolder({
		folderId: stubEntityIDParent,
		parentFolderId: stubEntityIDRoot,
		folderName: 'Parent Folder'
	});
	// Depth 2
	const stubFolder_0 = stubPublicFolder({
		folderId: stubEntityID,
		parentFolderId: stubEntityIDParent,
		folderName: 'Child Folder #1'
	});
	const stubFolder_1 = stubPublicFolder({
		folderId: stubEntityIDAlt,
		parentFolderId: stubEntityIDParent,
		folderName: 'Child Folder #2'
	});
	const stubFolder_2 = stubPublicFolder({
		folderId: stubEntityIDAltTwo,
		parentFolderId: stubEntityIDParent,
		folderName: 'Child Folder #3'
	});
	// Depth 3
	const stubFolder_3 = stubPublicFolder({
		folderId: stubEntityIDGrandchild,
		parentFolderId: stubEntityID,
		folderName: 'Grand child folder'
	});
	const allFolders = [stubRootFolder, stubParentFolder, stubFolder_0, stubFolder_1, stubFolder_2, stubFolder_3];
	const stubFolderIDs = [
		stubEntityIDRoot,
		stubEntityIDParent,
		stubEntityIDGrandchild,
		stubEntityID,
		stubEntityIDAlt,
		stubEntityIDAltTwo
	];
	const stubFolderIDsWithoutRoot = stubFolderIDs.slice(1);

	let folderHierarchy: FolderHierarchy;
	let folderHierarchyWithoutRoot: FolderHierarchy;

	before(() => {
		folderHierarchy = FolderHierarchy.newFromEntities(allFolders);
		folderHierarchyWithoutRoot = folderHierarchy.subTreeOf(stubEntityIDParent, Number.MAX_SAFE_INTEGER);
	});

	it('rootNode attribute always returns a FolderTreeNode', () => {
		const treeRoot = folderHierarchy.rootNode;
		const subTreeRoot = folderHierarchyWithoutRoot.rootNode;
		expect(`${treeRoot.folderId}`).to.equal(`${stubRootFolder.folderId}`);
		expect(treeRoot.parent).to.be.undefined;
		expect(treeRoot.children).to.be.instanceOf(Array);
		expect(`${subTreeRoot.folderId}`).to.equal(`${stubParentFolder.folderId}`);
		expect(subTreeRoot.parent).to.not.be.undefined;
		expect(subTreeRoot.children).to.be.instanceOf(Array);
	});

	it('subTreeOf returns a new FolderHierarchy instance with the correct root node', () => {
		const subTree = folderHierarchy.subTreeOf(stubEntityIDParent);
		const subTreeAlt = folderHierarchyWithoutRoot.subTreeOf(stubEntityIDParent);
		const subTreeRoot = subTree.rootNode;
		const subTreeAltRoot = subTreeAlt.rootNode;
		expect(subTree).to.be.instanceOf(FolderHierarchy);
		expect(subTreeAlt).to.be.instanceOf(FolderHierarchy);
		expect(`${subTreeRoot.folderId}`).to.equal(`${stubParentFolder.folderId}`);
		expect(`${subTreeAltRoot.folderId}`).to.equal(`${stubParentFolder.folderId}`);
	});

	it('allFolderIDs returns an array of FolderIDs', () => {
		const allFolderIDs = folderHierarchy.allFolderIDs();
		// Ensures the array deeply (but not strictly) has members
		expect(allFolderIDs).to.have.deep.members(stubFolderIDs);
		expect(allFolderIDs.length).to.equal(stubFolderIDs.length);

		const allFolderIDsWithoutRoot = folderHierarchyWithoutRoot.allFolderIDs();
		// Ensures the array deeply (but not strictly) has members
		expect(allFolderIDsWithoutRoot).to.have.deep.members(stubFolderIDsWithoutRoot);
		expect(allFolderIDsWithoutRoot.length).to.equal(stubFolderIDs.length - 1);
	});

	it('nodeAndChildrenOf returns a flattened array of FolderTreeNode including the given node', () => {
		const rootNode = folderHierarchy.rootNode;
		const nodes = folderHierarchy.nodeAndChildrenOf(rootNode, Number.MAX_SAFE_INTEGER);
		expect(nodes).to.have.lengthOf(6);
		expect(nodes).to.include(rootNode);
		nodes.forEach((node) => expect(node).to.be.instanceOf(FolderTreeNode));
	});

	it('folderIdSubtreeFromFolderId return a flattened array of FolderIDs starting from the given node', () => {
		const rootNode = folderHierarchy.rootNode;
		const folderIDs = folderHierarchy.folderIdSubtreeFromFolderId(rootNode.folderId, Number.MAX_SAFE_INTEGER);
		expect(folderIDs).to.have.lengthOf(6);
		expect(folderIDs).to.include(rootNode.folderId);
		folderIDs.forEach((entityID) => {
			expect(entityID).to.be.instanceOf(EntityID);
		});
	});

	it('pathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive', () => {
		expect(() => folderHierarchyWithoutRoot.pathToFolderId(stubEntityIDGrandchild)).to.throw(
			"Can't compute paths from sub-tree"
		);
	});

	it('pathToFolderId returns a path-like string', () => {
		const namesPath = folderHierarchy.pathToFolderId(stubEntityIDGrandchild);
		expect(namesPath).to.equal('/Root Folder/Parent Folder/Child Folder #1/Grand child folder/');
	});

	it('entityPathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive', () => {
		expect(() => folderHierarchyWithoutRoot.entityPathToFolderId(stubEntityIDGrandchild)).to.throw(
			"Can't compute paths from sub-tree"
		);
	});

	it('entityPathToFolderId returns a path-like string', () => {
		const namesPath = folderHierarchy.entityPathToFolderId(stubEntityIDGrandchild);
		expect(namesPath).to.equal(
			'/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000005/'
		);
	});

	it('txPathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive', () => {
		expect(() => folderHierarchyWithoutRoot.txPathToFolderId(stubEntityIDGrandchild)).to.throw(
			"Can't compute paths from sub-tree"
		);
	});

	it('txPathToFolderId returns a path-like string', () => {
		const namesPath = folderHierarchy.txPathToFolderId(stubEntityIDGrandchild);
		expect(namesPath).to.equal(
			'/0000000000000000000000000000000000000000000/0000000000000000000000000000000000000000000/0000000000000000000000000000000000000000000/0000000000000000000000000000000000000000000/'
		);
	});

	describe('FolderTreeNode class', () => {
		it('Can be constructed from an entity', () => {
			expect(() => FolderTreeNode.fromEntity(stubFolder_0)).to.not.throw();
		});

		it('Can be constructed from a folderId', () => {
			expect(() => new FolderTreeNode(stubEntityID)).to.not.throw();
			expect(() => new FolderTreeNode(stubEntityID, folderHierarchy.rootNode)).to.not.throw();
		});

		describe('the maxDepth parameter', () => {
			it.skip('the sub-tree of maxDepth zero has only one node on it', () => {
				// Skipped until PE-1012 gets done
				const subTree = folderHierarchy.subTreeOf(stubRootFolder.folderId, 0);
				const rootNode = subTree.rootNode;
				const allNodesOfSubTree = subTree.nodeAndChildrenOf(rootNode, Number.MAX_SAFE_INTEGER);
				expect(allNodesOfSubTree.length, `Wrong sub-tree length!`).to.equal(1);
			});

			it('maxDepth of zero', () => {
				const rootNode = folderHierarchy.rootNode;
				const allNodesOfSubTree = folderHierarchy.nodeAndChildrenOf(rootNode, 0);
				const allFolderIDs = folderHierarchy.folderIdSubtreeFromFolderId(rootNode.folderId, 0);
				expect(allNodesOfSubTree.length, `Wrong sub-tree length!`).to.equal(1);
				expect(allFolderIDs.length, `Wrong folder ID length`).to.equal(1);
			});

			it('maxDepth of two', () => {
				const subTree = folderHierarchy.subTreeOf(stubRootFolder.folderId, 2);
				const rootNode = subTree.rootNode;
				const allNodesOfSubTree = subTree.nodeAndChildrenOf(rootNode, 2);
				const allFolderIDs = folderHierarchy.folderIdSubtreeFromFolderId(rootNode.folderId, 2);
				expect(allNodesOfSubTree.length, `Wrong sub-tree length!`).to.equal(5);
				expect(allFolderIDs.length, `Wrong folder ID length`).to.equal(5);
			});
		});
	});
});
