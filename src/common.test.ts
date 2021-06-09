import { expect } from 'chai';
import { formatBytes } from './common';

describe('The formatBytes function ', () => {
	describe('returns the properly formatted byte count description ', () => {
		const inputToExpectedOutputMap = new Map<number, string>([
			// Bytes range 0-1023
			[0, '0 Bytes'],
			[1023, '1023 Bytes'],
			// KB range 1024-1048575
			[1024, '1.000 KB'],
			[1048575, '1023.999 KB'],
			// MB range 1048576-1073741823
			[1048576, '1.000 MB'],
			[1073741823, '1024.000 MB'],
			// GB range 1073741824-9007199254740991
			[1073741824, '1.000 GB'],
			[Number.MAX_SAFE_INTEGER, '8388608.000 GB'] // 9007199254740991 / 1024 / 1024 / 1024
		]);

		inputToExpectedOutputMap.forEach((expectedOutput, input) => {
			it(`'${expectedOutput}' when the byte count input is ${input}`, () => {
				expect(formatBytes(input)).to.equal(expectedOutput);
			});
		});
	});

	it('successfully rounds up and down', () => {
		// 1074341824 / 1024 / 1024 / 1024 = 1.000558794 GB rounds up to 1.001 GB
		expect(formatBytes(1074341824)).to.equal('1.001 GB');
		// 1074341824 / 1024 / 1024 / 1024 = 1.000465661 GB rounds down to 1.000 GB
		expect(formatBytes(1074241824)).to.equal('1.000 GB');
		//
	});

	it('represents TB sizes as GB', () => {
		// 34737418246534 / 1024 / 1024 / 1024 / 1024 = 31.593497848 TB, returns as 32351.742 GB
		expect(formatBytes(34737418246534)).to.equal('32351.742 GB');
	});

	// TODO?: Should these next four cases even happen?
	it('works with Bytes represented as a decimal', () => {
		expect(formatBytes(1023.999)).to.equal('1023.999 Bytes');
	});

	it('works with byte count represented as a negative integer', () => {
		expect(formatBytes(-12)).to.equal('-12 Bytes');
	});

	it('does not round or convert large negative byte counts', () => {
		expect(formatBytes(-57138495792)).to.equal('-57138495792 Bytes');
	});

	it('returns values as "1024.000 MB" instead of "1.000 GB" when rounded up', () => {
		// Max range on MB: 1073741823
		expect(formatBytes(1073741823)).to.equal('1024.000 MB');
	});
});
