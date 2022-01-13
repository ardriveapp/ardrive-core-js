import { expect } from 'chai';
import { assertValidName } from './input_validators';

describe('input validators', () => {
	describe('assertValidName method', () => {
		const validNames = [
			'.bashrc',
			'===============================================================================================================================================================================================================================================================',
			'abcdefghijklmnopqrstuvwxyz',
			'ñññññññññññññññññ.png'
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

		it('returns true when fed with an ArFS compliant name', () => {
			validNames.forEach((name) => {
				expect(assertValidName(name)).to.be.true;
			});
		});

		it('throws when the name is too long', () => {
			expect(() => assertValidName(tooLongName)).to.throw(
				'The file name must contain between 0 and 255 characters'
			);
		});

		it('throws when the name is too short', () => {
			expect(() => assertValidName('')).to.throw('The file name must contain between 0 and 255 characters');
		});

		it('throws when the name contains reserved characters', () => {
			namesWithReservedCharacters.forEach((invalidName) => {
				expect(() => assertValidName(invalidName)).to.throw(
					'The file name cannot contain reserved characters, cannot start with space or end with a dot or space'
				);
			});
		});
	});
});
