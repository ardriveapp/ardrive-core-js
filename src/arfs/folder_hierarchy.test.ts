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
	 * - The drive name/
	 * - The drive name/Funny stuff/
	 * - The drive name/Funny stuff/Funny folder #1/
	 * - The drive name/Funny stuff/Funny folder #2/
	 * - The drive name/Funny stuff/Funny folder #3/
	 * - The drive name/Funny stuff/Funny folder #1/The funniest folder/
	 */

	// Root folder
	const stubRootFolder = stubPublicFolder({
		folderId: stubEntityIDRoot,
		parentFolderId: new RootFolderID(),
		folderName: 'The drive name'
	});
	// Depth 0
	const stubParentFolder = stubPublicFolder({
		folderId: stubEntityIDParent,
		parentFolderId: stubEntityIDRoot,
		folderName: 'Funny stuff'
	});
	// Depth 1
	const stubFolder_0 = stubPublicFolder({
		folderId: stubEntityID,
		parentFolderId: stubEntityIDParent,
		folderName: 'Funny folder #1'
	});
	const stubFolder_1 = stubPublicFolder({
		folderId: stubEntityIDAlt,
		parentFolderId: stubEntityIDParent,
		folderName: 'Funny folder #2'
	});
	const stubFolder_2 = stubPublicFolder({
		folderId: stubEntityIDAltTwo,
		parentFolderId: stubEntityIDParent,
		folderName: 'Funny folder #3'
	});
	// Depth 2
	const stubFolder_3 = stubPublicFolder({
		folderId: stubEntityIDGrandchild,
		parentFolderId: stubEntityID,
		folderName: 'The funniest folder'
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
		const allFolderIDsWithoutRoot = folderHierarchyWithoutRoot.allFolderIDs();
		// Ensures the array deeply (but not strictly) has members
		expect(allFolderIDsWithoutRoot).to.have.deep.members(stubFolderIDsWithoutRoot);
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
		expect(namesPath).to.equal('/The drive name/Funny stuff/Funny folder #1/The funniest folder/');
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
	});
});
