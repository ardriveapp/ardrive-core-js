import { expect } from 'chai';
import { stub } from 'sinon';
import { statSync } from 'fs';
import { ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';
import {
	assertArFSCompliantNamesWithinFolder,
	assertValidArFSDriveName,
	assertValidArFSFileName,
	assertValidArFSFolderName
} from './arfs_entity_name_validators';

describe('entity name validators', () => {
	const validNames = [
		'.bashrc',
		'===============================================================================================================================================================================================================================================================',
		'abcdefghijklmnopqrstuvwxyz',
		'ñññññññññññññññññ.png',
		'valid name with     spaces.txt',
		'valid.name.with.....dots.txt',
		'\\\\\\\\\\\\\\\\\\\\.png',
		'//////////.png',
		'::::::::::.png',
		'**********.png',
		'??????????.png',
		'"""""""""".png',
		'<<<<<<<<<<.png',
		'>>>>>>>>>>.png',
		'||||||||||.png',
		'  thisIsAFileNameWithTwoLeadingSpaces.doc',
		' thisFilenameHasOneSingleSpace.doc',
		'soWeHaveAFileNameThatEndsWithADot.',
		'thenAFileNameWithMultipleDots...',
		'aFileNameWithATrailingSpace ',
		'anotherFileNameWithSpaces   '
	];
	const tooLongName =
		'+===============================================================================================================================================================================================================================================================';

	const nullCharactersRepresentations = ['\0', '\x00'];

	type Test = {
		entity: string;
		methodName: string;
		isFolderWithChildren: boolean;
	};

	type EntityTest = {
		validationMethod: typeof assertValidArFSFileName;
	} & Test;

	type FolderWithChildrenTest = {
		validationMethod: typeof assertArFSCompliantNamesWithinFolder;
	} & Test;

	function isFolderWithChildren(test: EntityTest | FolderWithChildrenTest): test is FolderWithChildrenTest {
		return (test as FolderWithChildrenTest).isFolderWithChildren;
	}

	const testsList: (EntityTest | FolderWithChildrenTest)[] = [
		{
			entity: 'file',
			methodName: 'assertValidArFSFileName',
			validationMethod: assertValidArFSFileName,
			isFolderWithChildren: false
		},
		{
			entity: 'folder',
			methodName: 'assertValidArFSFolderName',
			validationMethod: assertValidArFSFolderName,
			isFolderWithChildren: false
		},
		{
			entity: 'drive',
			methodName: 'assertValidArFSDriveName',
			validationMethod: assertValidArFSDriveName,
			isFolderWithChildren: false
		},
		{
			entity: 'folder',
			methodName: 'assertArFSCompliantNamesWithinFolder',
			validationMethod: assertArFSCompliantNamesWithinFolder,
			isFolderWithChildren: true
		}
	];

	const fileStats = statSync('tests/stub_files');
	const wrappedFolderWithValidName = new ArFSFolderToUpload('tests/stub_files', fileStats);

	testsList.forEach((test) => {
		const { entity, methodName } = test;

		describe(`${methodName} method`, () => {
			it('does not throw an error when fed with an ArFS compliant name', () => {
				validNames.forEach((name) => {
					if (isFolderWithChildren(test)) {
						const { validationMethod } = test;
						const wrappedFolderStub = stub(wrappedFolderWithValidName, 'getBaseFileName').returns(name);

						expect(validationMethod(wrappedFolderWithValidName)).to.not.throw;
						wrappedFolderStub.restore();
					} else {
						const { validationMethod } = test;
						expect(validationMethod(name)).to.not.throw;
					}
				});
			});

			it('throws when the name is too long', () => {
				const expectedError = `The ${entity} name must contain between 1 and 255 characters`;

				if (isFolderWithChildren(test)) {
					const { validationMethod } = test;
					const wrappedFolderStub = stub(wrappedFolderWithValidName, 'getBaseFileName').returns(tooLongName);

					expect(() => validationMethod(wrappedFolderWithValidName)).to.throw(expectedError);
					wrappedFolderStub.restore();
				} else {
					const { validationMethod } = test;
					expect(() => validationMethod(tooLongName)).to.throw(expectedError);
				}
			});

			it('throws when the name is too short', () => {
				const expectedError = `The ${entity} name must contain between 1 and 255 characters`;

				if (isFolderWithChildren(test)) {
					const { validationMethod } = test;
					const wrappedFolderStub = stub(wrappedFolderWithValidName, 'getBaseFileName').returns('');

					expect(() => validationMethod(wrappedFolderWithValidName)).to.throw(expectedError);
					wrappedFolderStub.restore();
				} else {
					const { validationMethod } = test;
					expect(() => validationMethod('')).to.throw(expectedError);
				}
			});

			it('throws when the name contains null characters', () => {
				const expectedError = `The ${entity} name cannot contain null characters`;

				nullCharactersRepresentations.forEach((invalidName) => {
					if (isFolderWithChildren(test)) {
						const { validationMethod } = test;
						const wrappedFolderStub = stub(wrappedFolderWithValidName, 'getBaseFileName').returns(
							invalidName
						);

						expect(() => validationMethod(wrappedFolderWithValidName)).to.throw(expectedError);
						wrappedFolderStub.restore();
					} else {
						const { validationMethod } = test;
						expect(() => validationMethod(invalidName)).to.throw(expectedError);
					}
				});
			});
		});
	});
});
