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

	let stubHierarchy: FolderHierarchy;
	let stubHierarchyWithoutRoot: FolderHierarchy;

	before(() => {
		stubHierarchy = FolderHierarchy.newFromEntities(allFolders);
		stubHierarchyWithoutRoot = stubHierarchy.subTreeOf(stubEntityIDParent, Number.MAX_SAFE_INTEGER);
	});

	it('rootNode attribute always return a FolderTreeNode', () => {
		const treeRoot = stubHierarchy.rootNode;
		const subTreeRoot = stubHierarchyWithoutRoot.rootNode;
		expect(treeRoot).to.be.instanceOf(FolderTreeNode);
		expect(subTreeRoot).to.be.instanceOf(FolderTreeNode);
	});

	it('subTreeOf returns a new FolderHierarchy instance with the correct root node', () => {
		const subTree = stubHierarchy.subTreeOf(stubEntityIDParent);
		const subTreeAlt = stubHierarchyWithoutRoot.subTreeOf(stubEntityIDParent);
		expect(subTree).to.be.instanceOf(FolderHierarchy);
		expect(subTreeAlt).to.be.instanceOf(FolderHierarchy);
		expect(subTree.rootNode).to.be.instanceOf(FolderTreeNode);
		expect(subTreeAlt.rootNode).to.be.instanceOf(FolderTreeNode);
	});

	it('allFolderIDs returns an array of FolderIDs', () => {
		const allFolderIDs = stubHierarchy.allFolderIDs();
		// Ensures the array deeply (but not strictly) has members
		expect(allFolderIDs).to.have.deep.members(stubFolderIDs);
		const allFolderIDsWithoutRoot = stubHierarchyWithoutRoot.allFolderIDs();
		// Ensures the array deeply (but not strictly) has members
		expect(allFolderIDsWithoutRoot).to.have.deep.members(stubFolderIDsWithoutRoot);
	});

	it('nodeAndChildrenOf returns a flattened array of FolderTreeNode including the given node', () => {
		const rootNode = stubHierarchy.rootNode;
		const nodes = stubHierarchy.nodeAndChildrenOf(rootNode, Number.MAX_SAFE_INTEGER);
		expect(nodes).to.have.lengthOf(6);
		expect(nodes).to.include(rootNode);
		nodes.forEach((node) => expect(node).to.be.instanceOf(FolderTreeNode));
	});

	it('folderIdSubtreeFromFolderId return a flattened array of FolderIDs starting from the given node', () => {
		const rootNode = stubHierarchy.rootNode;
		const folderIDs = stubHierarchy.folderIdSubtreeFromFolderId(rootNode.folderId, Number.MAX_SAFE_INTEGER);
		expect(folderIDs).to.have.lengthOf(6);
		expect(folderIDs).to.include(rootNode.folderId);
		folderIDs.forEach((entityID) => {
			expect(entityID).to.be.instanceOf(EntityID);
		});
	});

	it('pathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive', () => {
		expect(() => stubHierarchyWithoutRoot.pathToFolderId(stubEntityIDGrandchild)).to.throw(
			"Can't compute paths from sub-tree"
		);
	});

	it('pathToFolderId returns a path-like string', () => {
		const namesPath = stubHierarchy.pathToFolderId(stubEntityIDGrandchild);
		expect(namesPath).to.equal('/The drive name/Funny stuff/Funny folder #1/The funniest folder/');
	});

	it('entityPathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive', () => {
		expect(() => stubHierarchyWithoutRoot.entityPathToFolderId(stubEntityIDGrandchild)).to.throw(
			"Can't compute paths from sub-tree"
		);
	});

	it('entityPathToFolderId returns a path-like string', () => {
		const namesPath = stubHierarchy.entityPathToFolderId(stubEntityIDGrandchild);
		expect(namesPath).to.equal(
			'/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000005/'
		);
	});

	it('txPathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive', () => {
		expect(() => stubHierarchyWithoutRoot.txPathToFolderId(stubEntityIDGrandchild)).to.throw(
			"Can't compute paths from sub-tree"
		);
	});

	it('txPathToFolderId returns a path-like string', () => {
		const namesPath = stubHierarchy.txPathToFolderId(stubEntityIDGrandchild);
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
			expect(() => new FolderTreeNode(stubEntityID, stubHierarchy.rootNode)).to.not.throw();
		});
	});
});
