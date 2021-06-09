import { expect } from 'chai';
import { formatBytes } from './common';

// Cases for rounding
// Cases for max/min int
// Cases for TB represented as GB

describe('The formatBytes function correctly returns', () => {
	const inputToExpectedOutputMap = new Map<number, string>([
		[-12, '-12 Bytes'],
		[0, '0 Bytes'],
		[1023.999, '1023.999 Bytes'],
		[1024, '1.000 KB'],
		[85, '85 Bytes'],
		[8537, '8.337 KB'],
		[1262143, '1.204 MB'],
		[34737418246534, '32351.742 GB'],
		[Number.MAX_SAFE_INTEGER, '8388608.000 GB']
	]);

	inputToExpectedOutputMap.forEach((expectedOutput, input) => {
		it(`${expectedOutput} with ${input}`, () => {
			expect(formatBytes(input)).to.equal(expectedOutput);
		});
	});
});
