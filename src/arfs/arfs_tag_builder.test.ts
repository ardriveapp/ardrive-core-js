import { expect } from 'chai';
import { ArFSTagSettings } from './arfs_tag_builder';

describe('ArFSTagBuilder class', () => {
	const arFSTagBuilder = new ArFSTagSettings({
		appName: 'Tag-Builder-Test',
		appVersion: '1.2',
		arFSVersion: '0.101'
	});

	it('returns the expected baseline arfs tags', () => {
		expect(arFSTagBuilder.baseArFSTags).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'ArFS', value: '0.101' }
		]);
	});

	it('returns the expected base bundle tags', () => {
		expect(arFSTagBuilder.baseBundleTags).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Bundle-Format', value: 'binary' },
			{ name: 'Bundle-Version', value: '2.0.0' }
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

	describe('withBaseArFSTags method', () => {
		it('returns provided tags combined with the base arfs tags', () => {
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

		it('can exclude any specified tags names', () => {
			expect(arFSTagBuilder.withBaseArFSTags([], ['App-Version', 'ArFS'])).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' }
			]);
		});
	});

	describe('withBaseBundleTags method', () => {
		it('returns provided tags combined with the base bundle tags', () => {
			expect(
				arFSTagBuilder.withBaseBundleTags([
					{ name: 'Custom-Tag-5', value: 'Monkey paradise' },
					{ name: 'Custom-Tag-8', value: 'Mountain sun' }
				])
			).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' },
				{ name: 'App-Version', value: '1.2' },
				{ name: 'Bundle-Format', value: 'binary' },
				{ name: 'Bundle-Version', value: '2.0.0' },
				{ name: 'Custom-Tag-5', value: 'Monkey paradise' },
				{ name: 'Custom-Tag-8', value: 'Mountain sun' }
			]);
		});

		it('can exclude any specified tags names', () => {
			expect(arFSTagBuilder.withBaseBundleTags([], ['App-Name', 'Bundle-Format'])).to.deep.equal([
				{ name: 'App-Version', value: '1.2' },
				{ name: 'Bundle-Version', value: '2.0.0' }
			]);
		});
	});
});
