import { expect } from 'chai';
import { assertValidArFSFileName } from './arfs_entity_name_validators';

describe('entity name validators', () => {
	describe('assertValidArFSFileName method', () => {
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
		const namesWithLeadingSpaces = [
			'  thisIsAFileNameWithTwoLeadingSpaces.doc',
			' thisFilenameHasOneSingleSpace.doc'
		];
		const namesWithTrailingSpacesOrDots = [
			'soWeHaveAFileNameThatEndsWithADot.',
			'thenAFileNameWithMultipleDots...',
			'aFileNameWithATrailingSpace ',
			'anotherFileNameWithSpaces   '
		];

		it('returns true when fed with an ArFS compliant name', () => {
			validNames.forEach((name) => {
				expect(assertValidArFSFileName(name)).to.be.true;
			});
		});

		it('throws when the name is too long', () => {
			expect(() => assertValidArFSFileName(tooLongName)).to.throw(
				'The file name must contain between 0 and 255 characters'
			);
		});

		it('throws when the name is too short', () => {
			expect(() => assertValidArFSFileName('')).to.throw(
				'The file name must contain between 0 and 255 characters'
			);
		});

		it('throws when the name contains reserved characters', () => {
			namesWithReservedCharacters.forEach((invalidName) => {
				expect(() => assertValidArFSFileName(invalidName)).to.throw(
					"The file name cannot contain reserved characters (i.e. '\\\\', '/', ':', '*', '?', '\"', '<', '>', '|')"
				);
			});
		});

		it('throws when the name contains leading spaces', () => {
			namesWithLeadingSpaces.forEach((invalidName) =>
				expect(() => assertValidArFSFileName(invalidName)).to.throw('The file name cannot start with spaces')
			);
		});

		it('throws when the name contains trailing dots or spaces', () => {
			namesWithTrailingSpacesOrDots.forEach((invalidName) =>
				expect(() => assertValidArFSFileName(invalidName)).to.throw(
					'The file name cannot have trailing dots or spaces'
				)
			);
		});
	});
});
