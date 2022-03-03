import { expect } from 'chai';
import {
	getStubDriveKey,
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDAltTwo,
	stubEntityIDGrandchild,
	stubEntityIDParent,
	stubEntityIDRoot,
	stubPrivateFile,
	stubPrivateFolder
} from '../../../tests/stubs';
import {
	ArFSPrivateFile,
	ArFSPrivateFileWithPaths,
	ArFSPrivateFolder,
	FolderHierarchy,
	privateEntityWithPathsFactory,
	privateEntityWithPathsKeylessFactory
} from '../../exports';
import { DriveKey, FileKey } from '../../types';
import { RootFolderID } from './arfs_folder_builders';

describe('Entities with paths classes', () => {
	/*
	 * The stubbed folders describes the following tree
	 * - Root Folder/
	 * - Root Folder/Parent Folder/
	 * - Root Folder/Parent Folder/Child folder #1/
	 * - Root Folder/Parent Folder/Child folder #2/
	 * - Root Folder/Parent Folder/Child folder #1/Grand child folder/
	 * - Root Folder/Parent Folder/Child folder #1/Child file.pdf
	 */

	let stubRootFolder: ArFSPrivateFolder;
	let stubParentFolder: ArFSPrivateFolder;
	let stubFolder_0: ArFSPrivateFolder;
	let stubFolder_1: ArFSPrivateFolder;
	let stubFolder_3: ArFSPrivateFolder;
	let stubFile: ArFSPrivateFile;

	let allFolders;

	let stubHierarchy: FolderHierarchy;
	let driveKey: DriveKey;
	let fileKey: FileKey;

	before(async () => {
		// Root folder (Depth 0)
		stubRootFolder = await stubPrivateFolder({
			folderId: stubEntityIDRoot,
			parentFolderId: new RootFolderID(),
			folderName: 'Root Folder'
		});
		// Depth 1
		stubParentFolder = await stubPrivateFolder({
			folderId: stubEntityIDParent,
			parentFolderId: stubEntityIDRoot,
			folderName: 'Parent folder'
		});
		// Depth 2
		stubFolder_0 = await stubPrivateFolder({
			folderId: stubEntityID,
			parentFolderId: stubEntityIDParent,
			folderName: 'Child folder #1'
		});
		stubFolder_1 = await stubPrivateFolder({
			folderId: stubEntityIDAlt,
			parentFolderId: stubEntityIDParent,
			folderName: 'Child folder #2'
		});
		// Depth 3
		stubFolder_3 = await stubPrivateFolder({
			folderId: stubEntityIDGrandchild,
			parentFolderId: stubEntityID,
			folderName: 'Grand child folder'
		});
		stubFile = await stubPrivateFile({
			fileId: stubEntityIDAltTwo,
			fileName: 'Child file.pdf',
			parentFolderId: stubEntityID
		});
		allFolders = [stubRootFolder, stubParentFolder, stubFolder_0, stubFolder_1, stubFolder_3];

		stubHierarchy = FolderHierarchy.newFromEntities(allFolders);
		driveKey = await getStubDriveKey();
		fileKey = stubFile.fileKey;
	});

	it('Built folders will have the extra driveKey attribute set', async () => {
		const folderWithKeys = privateEntityWithPathsFactory(stubFolder_0, stubHierarchy);
		expect(`${folderWithKeys.driveKey}`).to.equal(`${driveKey}`);
		expect((folderWithKeys as ArFSPrivateFileWithPaths).fileKey).to.be.undefined;
	});

	it('Built files will have the driveKey and fileKey attributes set', async () => {
		const fileWithKeys = privateEntityWithPathsFactory(stubFile, stubHierarchy) as ArFSPrivateFileWithPaths;
		expect(`${fileWithKeys.driveKey}`).to.equal(`${driveKey}`);
		expect(`${fileWithKeys.fileKey}`).to.equal(`${fileKey}`);
	});

	it('Folders built with the Keyless factory will not expose its keys', async () => {
		const fileWithKeys = privateEntityWithPathsKeylessFactory(stubFile, stubHierarchy) as ArFSPrivateFileWithPaths;
		expect(fileWithKeys.driveKey).to.be.undefined;
		expect(fileWithKeys.fileKey).to.be.undefined;
	});

	it('Files built with the Keyless factory will not expose its keys', async () => {
		const fileWithKeys = privateEntityWithPathsKeylessFactory(stubFile, stubHierarchy) as ArFSPrivateFileWithPaths;
		expect(fileWithKeys.driveKey).to.be.undefined;
		expect(fileWithKeys.fileKey).to.be.undefined;
	});
});
