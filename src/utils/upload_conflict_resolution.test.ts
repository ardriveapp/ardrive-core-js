import { expect } from 'chai';
import { stub } from 'sinon';
import { stubEntityID, stubEntityIDAlt, stubEntityIDAltTwo } from '../../tests/stubs';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { ArFSFileToUpload, wrapFileOrFolder, ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';
import {
	errorOnConflict,
	FileConflictPrompts,
	FolderConflictPrompts,
	skipOnConflicts,
	UnixTime,
	upsertOnConflicts
} from '../types';
import { NameConflictInfo } from './mapper_functions';
import { resolveFileNameConflicts, resolveFolderNameConflicts } from './upload_conflict_resolution';

const matchingLastModifiedDate = new UnixTime(123456789);
const differentLastModifiedDate = new UnixTime(987654321);

const stubbedFileAskPrompts: FileConflictPrompts = {
	fileToFileNameConflict: () => Promise.resolve({ resolution: 'skip' }),
	fileToFolderNameConflict: () => Promise.resolve({ resolution: 'skip' })
};

const stubConflictInfo: NameConflictInfo = {
	files: [
		{
			fileName: 'CONFLICTING_FILE_NAME',
			fileId: stubEntityID,
			lastModifiedDate: matchingLastModifiedDate
		},
		{
			fileName: 'ANOTHER_CONFLICTING_NAME',
			fileId: stubEntityIDAltTwo,
			lastModifiedDate: differentLastModifiedDate
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
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'non-conflicting-test-name',
			nameConflictInfo: stubConflictInfo
		});

		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.undefined;
	});

	it('resolves wrappedFile.conflictResolution to undefined and uses the existing File ID when there is a file to file name conflict in the destination folder and the file has a DIFFERENT last modified date  and the resolution is set to upsert', async () => {
		stub(wrappedFile, 'lastModifiedDate').get(() => differentLastModifiedDate);

		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo
		});

		expect(wrappedFile.conflictResolution).to.be.undefined;
		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId?.equals(stubEntityID)).to.be.true;
	});

	it('resolves wrappedFile.conflictResolution to upsert when there is a file to file name conflict in the destination folder and the file has a MATCHING last modified date and the resolution is set to upsert', async () => {
		stub(wrappedFile, 'lastModifiedDate').get(() => matchingLastModifiedDate);

		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo
		});

		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(upsertOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to file name conflict in the destination folder and the resolution is set to skip', async () => {
		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'skip',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo
		});

		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(skipOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to undefined and re-uses the existing file ID when there is a file to file name conflict in the destination folder and the resolution is set to replace', async () => {
		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'replace',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo
		});

		expect(wrappedFile.existingId?.equals(stubEntityID)).to.be.true;
	});

	it('resolves wrappedFile.conflictResolution to an error when there is a file to folder name conflict in the destination folder', async () => {
		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'upsert',
			destinationFileName: 'CONFLICTING_FOLDER_NAME',
			nameConflictInfo: stubConflictInfo
		});

		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(errorOnConflict);
	});

	it('throws an error if resolution is set to ask and there are no prompts defined', async () => {
		await expectAsyncErrorThrow({
			promiseToError: resolveFileNameConflicts({
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				nameConflictInfo: stubConflictInfo
			}),
			errorMessage: 'App must provide file name conflict resolution prompts to use the `ask` conflict resolution!'
		});
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the file', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({ resolution: 'skip' });

		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(skipOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the file', async () => {
		stub(stubbedFileAskPrompts, 'fileToFolderNameConflict').resolves({ resolution: 'skip' });

		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FOLDER_NAME',
			nameConflictInfo: stubConflictInfo,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.conflictResolution).to.be.equal(skipOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to undefined and re-uses the existing File ID when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to replace the file', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({ resolution: 'replace' });

		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.conflictResolution).to.be.undefined;
		expect(wrappedFile.newName).to.be.undefined;
		expect(wrappedFile.existingId?.equals(stubEntityID)).to.be.true;
	});

	it('resolves wrappedFile.conflictResolution to undefined and assigns the new name field when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the file to a non conflicting name', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
			resolution: 'rename',
			newFileName: 'non-conflicting-name'
		});

		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'ask',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo,
			prompts: stubbedFileAskPrompts
		});

		expect(wrappedFile.conflictResolution).to.be.undefined;
		expect(wrappedFile.existingId).to.be.undefined;
		expect(wrappedFile.newName).to.equal('non-conflicting-name');
	});

	it('throws an error when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the file to another conflicting name', async () => {
		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
			resolution: 'rename',
			newFileName: 'ANOTHER_CONFLICTING_NAME'
		});

		await expectAsyncErrorThrow({
			promiseToError: resolveFileNameConflicts({
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				nameConflictInfo: stubConflictInfo,
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
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				nameConflictInfo: stubConflictInfo,
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
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn
		});

		expect(wrappedFolder.newName).to.be.undefined;
		expect(wrappedFolder.existingId).to.be.undefined;
		expect(wrappedFolder.conflictResolution).to.be.undefined;
	});

	it('resolves wrappedFolder.conflictResolution to skip when there is a folder to file name conflict in the destination folder', async () => {
		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'upsert',
			destinationFolderName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn
		});

		expect(wrappedFolder.newName).to.be.undefined;
		expect(wrappedFolder.existingId).to.be.undefined;
		expect(wrappedFolder.conflictResolution).to.equal(skipOnConflicts);
	});

	it('resolves wrappedFolder.conflictResolution to undefined and re-uses existing Folder ID when there is a folder to folder name conflict in the destination folder', async () => {
		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'upsert',
			destinationFolderName: 'CONFLICTING_FOLDER_NAME',
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn
		});

		expect(wrappedFolder.conflictResolution).to.be.undefined;
		expect(wrappedFolder.existingId?.equals(stubEntityIDAlt)).to.be.true;
		expect(wrappedFolder.newName).to.be.undefined;
	});

	it('throws an error if resolution is set to ask and there are no prompts defined', async () => {
		await expectAsyncErrorThrow({
			promiseToError: resolveFolderNameConflicts({
				wrappedFolder,
				conflictResolution: 'ask',
				destinationFolderName: 'CONFLICTING_FILE_NAME',
				nameConflictInfo: stubConflictInfo,
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
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.equal(skipOnConflicts);
		expect(wrappedFolder.newName).to.be.undefined;
		expect(wrappedFolder.existingId).to.be.undefined;
	});

	it('resolves wrappedFolder.conflictResolution to skip a when there is a folder to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to skip the folder', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFileNameConflict').resolves({ resolution: 'skip' });

		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'ask',
			destinationFolderName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.equal(skipOnConflicts);
		expect(wrappedFolder.newName).to.be.undefined;
		expect(wrappedFolder.existingId).to.be.undefined;
	});

	it('resolves wrappedFolder.conflictResolution to undefined and re-uses the existing Folder ID when there is a folder to folder name conflict in the destination folder, the resolution is set to ask, and the user chooses to re-use the folder', async () => {
		stub(stubbedFolderAskPrompts, 'folderToFolderNameConflict').resolves({ resolution: 'useFolder' });

		await resolveFolderNameConflicts({
			wrappedFolder,
			conflictResolution: 'ask',
			destinationFolderName: 'CONFLICTING_FOLDER_NAME',
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.be.undefined;
		expect(wrappedFolder.existingId?.equals(stubEntityIDAlt)).to.be.true;
		expect(wrappedFolder.newName).to.be.undefined;
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
			nameConflictInfo: stubConflictInfo,
			getConflictInfoFn: stubGetConflictInfoFn,
			prompts: stubbedFolderAskPrompts
		});

		expect(wrappedFolder.conflictResolution).to.be.undefined;
		expect(wrappedFolder.newName).to.equal('non-conflicting-name');
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
				nameConflictInfo: stubConflictInfo,
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
				nameConflictInfo: stubConflictInfo,
				getConflictInfoFn: stubGetConflictInfoFn,
				prompts: stubbedFolderAskPrompts
			}),
			errorMessage: 'You must provide a different name!'
		});
	});
});
