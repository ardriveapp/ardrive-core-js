describe('FolderHierarchy class', () => {
	before(() => {
		// TODO: construct a Hierarchy from stubbed entities
	});

	it('rootNode attribute always return a FolderTreeNode');
	it('subTreeOf returns a new FolderHierarchy instance with the correct root node');
	it('allFolderIDs returns an array of FolderIDs');
	it('nodeAndChildrenOf returns a flattened array of FolderTreeNode including the given node');
	it('folderIdSubtreeFromFolderId return a flattened array of FolderIDs starting from the given node');
	it('pathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive');
	it('pathToFolderId returns a path-like string');
	it('entityPathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive');
	it('entityPathToFolderId returns a path-like string');
	it('txPathToFolderId throws if the rootNode of the whole HierarchyTree is not the root of the drive');
	it('txPathToFolderId returns a path-like string');

	describe('FolderTreeNode class', () => {
		it('Can be constructed from an entity');
		it('Can be constructed from a folderId');
	});
});
