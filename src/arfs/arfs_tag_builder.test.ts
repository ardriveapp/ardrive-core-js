import { expect } from 'chai';
import { ArFSTagBuilder } from './arfs_tag_builder';

describe('ArFSTagBuilder class', () => {
	const arFSTagBuilder = new ArFSTagBuilder('Tag-Builder-Test', '1.2', '0.101');

	it('returns the expected baseline arfs tags', () => {
		expect(arFSTagBuilder.baseArFSTags).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'ArFS', value: '0.101' }
		]);
	});

	it('returns the expected default tip tags', () => {
		expect(arFSTagBuilder.getTipTags()).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Type', value: 'fee' },
			{ name: 'Tip-Type', value: 'data upload' }
		]);
	});

	it('returns provided tags combined with the base arfs tags as expected', () => {
		expect(
			arFSTagBuilder.withBaseArFSTags([
				{ name: 'Custom-Tag-1', value: 'Gibberish' },
				{ name: 'Custom-Tag-2', value: 'Excited penguin' }
			])
		).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'ArFS', value: '0.101' },
			{ name: 'Custom-Tag-1', value: 'Gibberish' },
			{ name: 'Custom-Tag-2', value: 'Excited penguin' }
		]);
	});
});
