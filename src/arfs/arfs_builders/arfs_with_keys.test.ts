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
import { ArFSPrivateFileOrFolderWithPathsAndKeys, FolderHierarchy } from '../../exports';
import { DriveKey, FileKey } from '../../types';
import { urlEncodeHashKey } from '../../utils/common';
import { RootFolderID } from './arfs_folder_builders';

describe('ArFSPrivateFileOrFolderWithPathsAndKeys class', () => {
	/*
	 * The stubbed folders describes the following tree
	 * - The drive name/
	 * - The drive name/Funny stuff/
	 * - The drive name/Funny stuff/Funny folder #1/
	 * - The drive name/Funny stuff/Funny folder #2/
	 * - The drive name/Funny stuff/Funny folder #1/The funniest folder/
	 * - The drive name/Funny stuff/Funny folder #1/jokes.pdf
	 */

	// Root folder
	const stubRootFolder = stubPrivateFolder({
		folderId: stubEntityIDRoot,
		parentFolderId: new RootFolderID(),
		folderName: 'The drive name'
	});
	// Depth 0
	const stubParentFolder = stubPrivateFolder({
		folderId: stubEntityIDParent,
		parentFolderId: stubEntityIDRoot,
		folderName: 'Funny stuff'
	});
	// Depth 1
	const stubFolder_0 = stubPrivateFolder({
		folderId: stubEntityID,
		parentFolderId: stubEntityIDParent,
		folderName: 'Funny folder #1'
	});
	const stubFolder_1 = stubPrivateFolder({
		folderId: stubEntityIDAlt,
		parentFolderId: stubEntityIDParent,
		folderName: 'Funny folder #2'
	});
	// Depth 2
	const stubFolder_3 = stubPrivateFolder({
		folderId: stubEntityIDGrandchild,
		parentFolderId: stubEntityID,
		folderName: 'The funniest folder'
	});
	const stubFile = stubPrivateFile({
		fileId: stubEntityIDAltTwo,
		fileName: 'jokes.pdf'
	});

	const allFolders = [stubRootFolder, stubParentFolder, stubFolder_0, stubFolder_1, stubFolder_3];

	let stubHierarchy: FolderHierarchy;
	let driveKey: DriveKey;
	let fileKey: FileKey;

	before(async () => {
		stubHierarchy = FolderHierarchy.newFromEntities(allFolders);
		driveKey = await getStubDriveKey();
		fileKey = stubFile.fileKey;
	});

	it('Built folders will have the extra driveKey attribute set', async () => {
		const folderWithKeys = new ArFSPrivateFileOrFolderWithPathsAndKeys(stubFolder_0, stubHierarchy, driveKey);
		expect(folderWithKeys.driveKey).to.equal(urlEncodeHashKey(driveKey));
		expect(folderWithKeys.fileKey).to.be.undefined;
	});

	it('Built files will have the driveKey and fileKey attributes set', async () => {
		const fileWithKeys = new ArFSPrivateFileOrFolderWithPathsAndKeys(stubFile, stubHierarchy, driveKey);
		expect(fileWithKeys.driveKey).to.equal(urlEncodeHashKey(driveKey));
		expect(fileWithKeys.fileKey).to.equal(urlEncodeHashKey(fileKey));
	});
});
