import { expect } from 'chai';
import { stub } from 'sinon';
import { stubEntityID, stubEntityIDAlt, stubEntityIDAltTwo } from '../../tests/stubs';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import {
	ArFSFileToUpload,
	errorOnConflict,
	FileConflictPrompts,
	skipOnConflicts,
	upsertOnConflicts,
	wrapFileOrFolder
} from '../exports';
import { UnixTime } from '../types';
import { NameConflictInfo } from './mapper_functions';
import { resolveFileNameConflicts } from './upload_conflict_resolution';

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

		expect(wrappedFile.conflictResolution).to.be.equal(upsertOnConflicts);
	});

	it('resolves wrappedFile.conflictResolution to skip when there is a file to file name conflict in the destination folder and the resolution is set to skip', async () => {
		await resolveFileNameConflicts({
			wrappedFile,
			conflictResolution: 'skip',
			destinationFileName: 'CONFLICTING_FILE_NAME',
			nameConflictInfo: stubConflictInfo
		});

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
			errorMessage:
				'App must provide a file name conflict resolution prompt to use the `ask` conflict resolution!'
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
		expect(wrappedFile.newFileName).to.equal('non-conflicting-name');
	});

	it('throws an error when there is a file to file name conflict in the destination folder, the resolution is set to ask, and the user chooses to rename the file to another conflicting name', async () => {
		const stubConflictInfoWithAnotherConflict: NameConflictInfo = {
			...stubConflictInfo,
			files: [
				...stubConflictInfo.files,
				{
					fileName: 'ANOTHER_CONFLICTING_NAME',
					fileId: stubEntityIDAltTwo,
					lastModifiedDate: differentLastModifiedDate
				}
			]
		};

		stub(stubbedFileAskPrompts, 'fileToFileNameConflict').resolves({
			resolution: 'rename',
			newFileName: 'ANOTHER_CONFLICTING_NAME'
		});

		await expectAsyncErrorThrow({
			promiseToError: resolveFileNameConflicts({
				wrappedFile,
				conflictResolution: 'ask',
				destinationFileName: 'CONFLICTING_FILE_NAME',
				nameConflictInfo: stubConflictInfoWithAnotherConflict,
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
