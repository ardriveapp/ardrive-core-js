import { expect } from 'chai';
import { estimateArCost } from './node';

describe('The estimateArCost function', function () {
	// Set timeout to 10 seconds for smartweave contract reading
	this.timeout(10000);
	it('returns an estimation as an AR decimal', async () => {
		const output = await estimateArCost(234564, 5);

		expect(output).to.be.a('number');
		expect(Number.isInteger(output)).to.be.false;

		return;
	});
});
