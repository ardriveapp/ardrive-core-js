import { expect } from 'chai';
import { stub } from 'sinon';
import {
	stubEmptyFolderToUpload,
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDAltTwo,
	stubFileToUpload,
	stubEmptyFolderStats,
	stubFileUploadStats
} from '../../tests/stubs';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { ArFSFileToUpload, wrapFileOrFolder, ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';
import {
	errorOnConflict,
	FileConflictPrompts,
	FolderConflictPrompts,
	skipOnConflicts,
	UnixTime,
	UploadStats,
	upsertOnConflicts
} from '../types';
import { NameConflictInfo } from './mapper_functions';
import {
	assertConflictsWithinFolder,
	assertLocalNameConflicts,
	resolveFileNameConflicts,
	resolveFolderNameConflicts
} from './upload_conflict_resolution';

const stubbedFileAskPrompts: FileConflictPrompts = {
	fileToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
	fileToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' })
};

const stubConflictInfo: NameConflictInfo = {
	files: [
		{
			fileName: 'CONFLICTING_FILE_NAME',
			fileId: stubEntityID,
			lastModifiedDate: new UnixTime(123456789)
		},
		{
			fileName: 'ANOTHER_CONFLICTING_NAME',
			fileId: stubEntityIDAltTwo,
			lastModifiedDate: new UnixTime(987654321)
		}
	],
	folders: [
		{
			folderName: 'CONFLICTING_FOLDER_NAME',
			folderId: stubEntityIDAlt
		}
	]
};

describe('The resolveFileNameConflicts function', () => {
	let wrappedFile: ArFSFileToUpload;

	beforeEach(() => {
		// Start each test with a newly wrapped file object
		wrappedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
	});

	it('resolves wrappedFile.conflictResolution to undefined when there are no conflicts in the destination folder', async () => {
		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'non-conflicting-test-name',
			destFolderId: stubEntityID
		});

		expect(wrappedFile.destName).to.equal('non-conflicting-test-name');
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.undefined;
	});

	it('resolves wrappedFile.conflictResolution to undefined and uses the existing File ID when there is a file to file name conflict in the destination folder and the file has a DIFFERENT last modified date  and the resolution is set to upsert', async () => {
		stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(987654321));

		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID
		});

		expect(wrappedFile.conflictResolution).to.be.undefined;
		expect(wrappedFile.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFile.existingId?.equals(stubEntityID)).to.be.true;
	});

	it('resolves wrappedFile.conflictResolution to upsert when there is a file to file name conflict in the destination folder and the file has a MATCHING last modified date and the resolution is set to upsert', async () => {
		stub(wrappedFile, 'lastModifiedDate').get(() => new UnixTime(123456789));

		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID
		});

		expect(wrappedFile.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(upsertOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to file name conflict in the destination folder and the resolution is set to skip', async () => {
		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'skip',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID
		});

		expect(wrappedFile.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(skipOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to undefined and re-uses the existing file ID when there is a file to file name conflict in the destination folder and the resolution is set to replace', async () => {
		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'replace',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID
		});

		expect(wrappedFile.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFile.existingId?.equals(stubEntityID)).to.be.true;
	});

	it('resolves wrappedFile.conflictResolution to an error when there is a file to folder name conflict in the destination folder', async () => {
		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'CONFLICTING_FOLDER_NAME',
			destFolderId: stubEntityID
		});

		expect(wrappedFile.destName).to.equal('CONFLICTING_FOLDER_NAME');
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(errorOnConflict);
	});

	it('throws an error if resolution is set to ask and there are no prompts defined', async () => {
		await expectAsyncErrorThrow({
			promiseToError: resolveFileNameConflicts({
				getConflictInfoFn: stubGetConflictInfoFn,
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				destFolderId: stubEntityID
			}),
			errorMessage: 'App must provide file name conflict resolution prompts to use the `ask` conflict resolution!'
		});
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the file', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({ resolution: 'skip' });

		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(skipOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the file', async () => {
		stub(stubbedFileAskPrompts, 'fileToFolderNameConflict').resolves({ resolution: 'skip' });

		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FOLDER_NAME',
			destFolderId: stubEntityID,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.destName).to.equal('CONFLICTING_FOLDER_NAME');
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(skipOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to undefined and re-uses the existing File ID when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to replace the file', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({ resolution: 'replace' });

		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.conflictResolution).to.be.undefined;
		expect(wrappedFile.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFile.existingId?.equals(stubEntityID)).to.be.true;
	});

	it('resolves wrappedFile.conflictResolution to undefined and assigns the new name field when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the file to a non conflicting name', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
			resolution: 'rename',
			newFileName: 'non-conflicting-name'
		});

		await resolveFileNameConflicts({
			getConflictInfoFn: stubGetConflictInfoFn,
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.conflictResolution).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.destName).to.equal('non-conflicting-name');
	});

	it('throws an error when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the file to another conflicting name', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
			resolution: 'rename',
			newFileName: 'ANOTHER_CONFLICTING_NAME'
		});

		await expectAsyncErrorThrow({
			promiseToError: resolveFileNameConflicts({
				getConflictInfoFn: stubGetConflictInfoFn,
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				destFolderId: stubEntityID,
				prompts: stubbedFileAskPrompts
			}),
			errorMessage: 'That name also exists within dest folder!'
		});
	});

	it('throws an error when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the file to the same name', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
			resolution: 'rename',
			newFileName: 'CONFLICTING_FILE_NAME'
		});

		await expectAsyncErrorThrow({
			promiseToError: resolveFileNameConflicts({
				getConflictInfoFn: stubGetConflictInfoFn,
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				destFolderId: stubEntityID,
				prompts: stubbedFileAskPrompts
			}),
			errorMessage: 'You must provide a different name!'
		});
	});
});

const stubGetConflictInfoFn = () => Promise.resolve(stubConflictInfo);

const stubbedFolderAskPrompts: FolderConflictPrompts = {
	...stubbedFileAskPrompts,
	folderToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
	folderToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' })
};

describe('The resolveFolderNameConflicts function', () => {
	let wrappedFolder: ArFSFolderToUpload;

	beforeEach(() => {
		// Start each test with a newly wrapped folder
		wrappedFolder = wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;
	});

	it('resolves wrappedFolder.conflictResolution to undefined when there are no conflicts in the destination folder', async () => {
		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'upsert',
			destinationFolderName: 'non-conflicting-test-name',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn
		});

		expect(wrappedFolder.destName).to.equal('non-conflicting-test-name');
		expect(wrappedFolder.existingId).to.be.undefined;
		expect(wrappedFolder.conflictResolution).to.be.undefined;
	});

	it('resolves wrappedFolder.conflictResolution to skip when there is a folder to file name conflict in the destination folder', async () => {
		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'upsert',
			destinationFolderName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn
		});

		expect(wrappedFolder.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFolder.existingId).to.be.undefined;
		expect(wrappedFolder.conflictResolution).to.equal(errorOnConflict);
	});

	it('resolves wrappedFolder.conflictResolution to undefined and re-uses existing Folder ID when there is a folder to folder name conflict in the destination folder', async () => {
		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'upsert',
			destinationFolderName: 'CONFLICTING_FOLDER_NAME',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn
		});

		expect(wrappedFolder.conflictResolution).to.be.undefined;
		expect(wrappedFolder.existingId?.equals(stubEntityIDAlt)).to.be.true;
		expect(wrappedFolder.destName).to.equal('CONFLICTING_FOLDER_NAME');
	});

	it('throws an error if resolution is set to ask and there are no prompts defined', async () => {
		await expectAsyncErrorThrow({
			promiseToError: resolveFolderNameConflicts({
				wrappedFolder,
				conflictResolution: 'ask',
				destinationFolderName: 'CONFLICTING_FILE_NAME',
				destFolderId: stubEntityID,
				getConflictInfoFn: stubGetConflictInfoFn
			}),
			errorMessage:
				'App must provide folder and file name conflict resolution prompts to use the `ask` conflict resolution!'
		});
	});

	it('resolves wrappedFolder.conflictResolution to skip when there is a folder to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the folder', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFolderNameConflict').resolves({ resolution: 'skip' });

		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'ask',
			destinationFolderName: 'CONFLICTING_FOLDER_NAME',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.equal(skipOnConflicts);
		expect(wrappedFolder.destName).to.equal('CONFLICTING_FOLDER_NAME');
		expect(wrappedFolder.existingId).to.be.undefined;
	});

	it('resolves wrappedFolder.conflictResolution to skip a when there is a folder to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the folder', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFileNameConflict').resolves({ resolution: 'skip' });

		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'ask',
			destinationFolderName: 'CONFLICTING_FILE_NAME',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.equal(skipOnConflicts);
		expect(wrappedFolder.destName).to.equal('CONFLICTING_FILE_NAME');
		expect(wrappedFolder.existingId).to.be.undefined;
	});

	it('resolves wrappedFolder.conflictResolution to undefined and re-uses the existing Folder ID when there is a folder to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to re-use the folder', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFolderNameConflict').resolves({ resolution: 'useFolder' });

		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'ask',
			destinationFolderName: 'CONFLICTING_FOLDER_NAME',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.be.undefined;
		expect(wrappedFolder.existingId?.equals(stubEntityIDAlt)).to.be.true;
		expect(wrappedFolder.destName).to.equal('CONFLICTING_FOLDER_NAME');
	});

	it('resolves wrappedFolder.conflictResolution to undefined and assigns the new folder name when there is a folder to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the folder to a non conflicting name', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFolderNameConflict').resolves({
			resolution: 'rename',
			newFolderName: 'non-conflicting-name'
		});

		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'ask',
			destinationFolderName: 'CONFLICTING_FOLDER_NAME',
			destFolderId: stubEntityID,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.be.undefined;
		expect(wrappedFolder.destName).to.equal('non-conflicting-name');
		expect(wrappedFolder.existingId).to.be.undefined;
	});

	it('throws an error when there is a folder to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the folder to another conflicting name', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFolderNameConflict').resolves({
			resolution: 'rename',
			newFolderName: 'ANOTHER_CONFLICTING_NAME'
		});

		await expectAsyncErrorThrow({
			promiseToError: resolveFolderNameConflicts({
				wrappedFolder,
				conflictResolution: 'ask',
				destinationFolderName: 'CONFLICTING_FOLDER_NAME',
				destFolderId: stubEntityID,
				getConflictInfoFn: stubGetConflictInfoFn,
				prompts: stubbedFolderAskPrompts
			}),
			errorMessage: 'That name also exists within dest folder!'
		});
	});

	it('throws an error when there is a folder to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the folder to the same conflicting name', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFolderNameConflict').resolves({
			resolution: 'rename',
			newFolderName: 'CONFLICTING_FOLDER_NAME'
		});

		await expectAsyncErrorThrow({
			promiseToError: resolveFolderNameConflicts({
				wrappedFolder,
				conflictResolution: 'ask',
				destinationFolderName: 'CONFLICTING_FOLDER_NAME',
				destFolderId: stubEntityID,
				getConflictInfoFn: stubGetConflictInfoFn,
				prompts: stubbedFolderAskPrompts
			}),
			errorMessage: 'You must provide a different name!'
		});
	});
});

describe('assertConflictsWithinFolder function', () => {
	it('throws an error if a folder has multiple folders with the same destinationBaseName', () => {
		const folderToUpload = stubEmptyFolderToUpload();
		folderToUpload.folders = [stubEmptyFolderToUpload('same name'), stubEmptyFolderToUpload('same name')];

		expect(() => assertConflictsWithinFolder(folderToUpload)).to.throw(
			Error,
			'Folders cannot contain identical destination names!'
		);
	});

	it('throws an error if a folder has multiple files with the same destinationBaseName', () => {
		const folderToUpload = stubEmptyFolderToUpload();
		folderToUpload.files = [stubFileToUpload('same name'), stubFileToUpload('same name')];

		expect(() => assertConflictsWithinFolder(folderToUpload)).to.throw(
			Error,
			'Folders cannot contain identical destination names!'
		);
	});

	it('throws an error if a folder has a file and a folder with the same destinationBaseName', () => {
		const folderToUpload = stubEmptyFolderToUpload();
		folderToUpload.files = [stubFileToUpload('same name')];
		folderToUpload.folders = [stubEmptyFolderToUpload('same name')];

		expect(() => assertConflictsWithinFolder(folderToUpload)).to.throw(
			Error,
			'Folders cannot contain identical destination names!'
		);
	});

	it('throws an error if a folder within the recursive structure has a file and a folder with the same destinationBaseName', () => {
		const rootFolder = stubEmptyFolderToUpload();
		const parentFolder = stubEmptyFolderToUpload();
		const childFolder = stubEmptyFolderToUpload();

		childFolder.files = [stubFileToUpload('same name')];
		childFolder.folders = [stubEmptyFolderToUpload('same name')];

		parentFolder.folders = [childFolder];
		rootFolder.folders = [parentFolder];

		expect(() => assertConflictsWithinFolder(rootFolder)).to.throw(
			Error,
			'Folders cannot contain identical destination names!'
		);
	});

	it('succeeds without error if a folder has a files and a folders with the different destinationBaseNames', () => {
		const folderToUpload = stubEmptyFolderToUpload();
		folderToUpload.files = [stubFileToUpload('diff name 0'), stubFileToUpload('diff name 1')];
		folderToUpload.folders = [stubEmptyFolderToUpload('diff name 2'), stubEmptyFolderToUpload('diff name 3')];

		expect(() => assertConflictsWithinFolder(folderToUpload)).to.not.throw(Error);
	});
});

describe('assertLocalNameConflicts function', () => {
	it('throws an error if a an upload has a file and a folder with the same destFolderId and destName', () => {
		const folderUploadStats: UploadStats = { ...stubEmptyFolderStats(stubEntityID), destName: 'same-name' };
		const fileUploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID), destName: 'same-name' };

		expect(() => assertLocalNameConflicts([folderUploadStats, fileUploadStats])).to.throw(
			Error,
			'Upload cannot contain multiple destination names to the same destination folder!'
		);
	});

	it('throws an error if an upload has a multiple files with the same destFolderId and destName', () => {
		const file1UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID), destName: 'same-name' };
		const file2UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID), destName: 'same-name' };

		expect(() => assertLocalNameConflicts([file1UploadStats, file2UploadStats])).to.throw(
			Error,
			'Upload cannot contain multiple destination names to the same destination folder!'
		);
	});

	it('throws an error if an upload has a multiple folders with the same destFolderId and destName', () => {
		const folder1UploadStats: UploadStats = { ...stubEmptyFolderStats(stubEntityID), destName: 'same-name' };
		const folder2UploadStats: UploadStats = { ...stubEmptyFolderStats(stubEntityID), destName: 'same-name' };

		expect(() => assertLocalNameConflicts([folder1UploadStats, folder2UploadStats])).to.throw(
			Error,
			'Upload cannot contain multiple destination names to the same destination folder!'
		);
	});

	it('throws an error if an upload has multiple files with the same destFolderId and same destinationBaseName derived from the wrappedEntity', () => {
		const file1UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID) };
		const file2UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID) };

		expect(() => assertLocalNameConflicts([file1UploadStats, file2UploadStats])).to.throw(
			Error,
			'Upload cannot contain multiple destination names to the same destination folder!'
		);
	});

	it('succeeds without error if an upload has a multiple files with the same destName but different destFolderIds', () => {
		const file1UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID), destName: 'same-name' };
		const file2UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityIDAlt), destName: 'same-name' };

		expect(() => assertLocalNameConflicts([file1UploadStats, file2UploadStats])).to.not.throw(Error);
	});

	it('succeeds without error if an upload has a multiple folders with the same destFolderId but different destNames', () => {
		const file1UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID), destName: 'diff name 0' };
		const file2UploadStats: UploadStats = { ...stubFileUploadStats(stubEntityID), destName: 'diff name 1' };

		expect(() => assertLocalNameConflicts([file1UploadStats, file2UploadStats])).to.not.throw(Error);
	});
});
