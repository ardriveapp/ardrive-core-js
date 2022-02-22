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
	 * - The drive name/
	 * - The drive name/Funny stuff/
	 * - The drive name/Funny stuff/Funny folder #1/
	 * - The drive name/Funny stuff/Funny folder #2/
	 * - The drive name/Funny stuff/Funny folder #1/The funniest folder/
	 * - The drive name/Funny stuff/Funny folder #1/jokes.pdf
	 */

	// Root folder (Depth 0)
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
		// Root folder
		stubRootFolder = await stubPrivateFolder({
			folderId: stubEntityIDRoot,
			parentFolderId: new RootFolderID(),
			folderName: 'The drive name'
		});
		// Depth 1
		stubParentFolder = await stubPrivateFolder({
			folderId: stubEntityIDParent,
			parentFolderId: stubEntityIDRoot,
			folderName: 'Funny stuff'
		});
		// Depth 2
		stubFolder_0 = await stubPrivateFolder({
			folderId: stubEntityID,
			parentFolderId: stubEntityIDParent,
			folderName: 'Funny folder #1'
		});
		stubFolder_1 = await stubPrivateFolder({
			folderId: stubEntityIDAlt,
			parentFolderId: stubEntityIDParent,
			folderName: 'Funny folder #2'
		});
		// Depth 3
		stubFolder_3 = await stubPrivateFolder({
			folderId: stubEntityIDGrandchild,
			parentFolderId: stubEntityID,
			folderName: 'The funniest folder'
		});
		stubFile = await stubPrivateFile({
			fileId: stubEntityIDAltTwo,
			fileName: 'jokes.pdf'
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
