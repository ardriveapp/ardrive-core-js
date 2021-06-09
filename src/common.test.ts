import { expect } from 'chai';
import { formatBytes } from './common';

type byteTypes = 'Bytes' | 'KB' | 'MB' | 'GB';

function formatBytesTestHelper(returnedString: string, type: byteTypes) {
	const stringArray = returnedString.split(' ');

	// Has correct string value, ex: 'Bytes'
	expect(stringArray[1], `Incorrect string value: ${stringArray[1]}, expected: ${type}`).to.equal(type);

	if (stringArray[0].includes('.')) {
		// Byte value has been limited to 3 decimal places (thousandths), ex: 1743.432 KB
		const decimalValue = stringArray[0].split('.')[1];
		expect(decimalValue.length, `Decimal value is too long: "${stringArray[0]}"`).to.be.lessThan(4);
	}
}

describe('The formatBytes function correctly returns', () => {
	it('Bytes', () => {
		// Very small integer for testing values without decimals
		formatBytesTestHelper(formatBytes(85), 'Bytes');
	});
	it('KB', () => {
		formatBytesTestHelper(formatBytes(8537), 'KB');
	});
	it('MB', () => {
		formatBytesTestHelper(formatBytes(1262143), 'MB');
	});
	it('GB', () => {
		// Very long integer for testing `.toFixed()` decimal places
		formatBytesTestHelper(formatBytes(34737418246534), 'GB');
	});
});
