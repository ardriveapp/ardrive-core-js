import { expect } from 'chai';
import { assertValidArFSFileName, assertValidArFSFolderName } from './arfs_entity_name_validators';

describe('entity name validators', () => {
	const validNames = [
		'.bashrc',
		'===============================================================================================================================================================================================================================================================',
		'abcdefghijklmnopqrstuvwxyz',
		'ñññññññññññññññññ.png',
		'valid name with     spaces.txt',
		'valid.name.with.....dots.txt'
	];
	const tooLongName =
		'+===============================================================================================================================================================================================================================================================';
	const namesWithReservedCharacters = [
		'\\\\\\\\\\\\\\\\\\\\.png',
		'//////////.png',
		'::::::::::.png',
		'**********.png',
		'??????????.png',
		'"""""""""".png',
		'<<<<<<<<<<.png',
		'>>>>>>>>>>.png',
		'||||||||||.png'
	];
	const namesWithLeadingSpaces = ['  thisIsAFileNameWithTwoLeadingSpaces.doc', ' thisFilenameHasOneSingleSpace.doc'];
	const namesWithTrailingSpacesOrDots = [
		'soWeHaveAFileNameThatEndsWithADot.',
		'thenAFileNameWithMultipleDots...',
		'aFileNameWithATrailingSpace ',
		'anotherFileNameWithSpaces   '
	];

	const testsList = [
		{
			entity: 'file',
			methodName: 'assertValidArFSFileName',
			validationMethod: assertValidArFSFileName
		},
		{
			entity: 'folder',
			methodName: 'assertValidArFSFolderName',
			validationMethod: assertValidArFSFolderName
		}
	];

	testsList.forEach(({ entity, methodName, validationMethod }) => {
		describe(`${methodName} method`, () => {
			it('returns true when fed with an ArFS compliant name', () => {
				validNames.forEach((name) => {
					expect(validationMethod(name)).to.be.true;
				});
			});

			it('throws when the name is too long', () => {
				expect(() => validationMethod(tooLongName)).to.throw(
					`The ${entity} name must contain between 1 and 255 characters`
				);
			});

			it('throws when the name is too short', () => {
				expect(() => validationMethod('')).to.throw(
					`The ${entity} name must contain between 1 and 255 characters`
				);
			});

			it('throws when the name contains reserved characters', () => {
				namesWithReservedCharacters.forEach((invalidName) => {
					expect(() => validationMethod(invalidName)).to.throw(
						`The ${entity} name cannot contain reserved characters (i.e. '\\\\', '/', ':', '*', '?', '"', '<', '>', '|')`
					);
				});
			});

			it('throws when the name contains leading spaces', () => {
				namesWithLeadingSpaces.forEach((invalidName) =>
					expect(() => validationMethod(invalidName)).to.throw(`The ${entity} name cannot start with spaces`)
				);
			});

			it('throws when the name contains trailing dots or spaces', () => {
				namesWithTrailingSpacesOrDots.forEach((invalidName) =>
					expect(() => validationMethod(invalidName)).to.throw(
						`The ${entity} name cannot have trailing dots or spaces`
					)
				);
			});
		});
	});
});
