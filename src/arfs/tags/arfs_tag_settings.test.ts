import { expect } from 'chai';
import { ArFSTagSettings } from './arfs_tag_settings';

describe('ArFSTagSettings class', () => {
	const arFSTagSettings = new ArFSTagSettings({
		appName: 'Tag-Builder-Test',
		appVersion: '1.2',
		arFSVersion: '0.101'
	});

	it('returns the expected baseline arfs tags', () => {
		expect(arFSTagSettings.baseArFSTags).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'ArFS', value: '0.101' }
		]);
	});

	it('returns the expected base bundle tags', () => {
		expect(arFSTagSettings.baseBundleTags).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Bundle-Format', value: 'binary' },
			{ name: 'Bundle-Version', value: '2.0.0' }
		]);
	});

	it('returns the expected default tip tags', () => {
		expect(arFSTagSettings.getTipTags()).to.deep.equal([{ name: 'Tip-Type', value: 'data upload' }]);
	});

	it('returns the expected tip tags with app tags', () => {
		expect(arFSTagSettings.getTipTagsWithAppTags()).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Tip-Type', value: 'data upload' }
		]);
	});

	it('returns the expected file data item tags', () => {
		console.log(
			"arFSTagSettings.getFileDataTags(false, 'application/json')",
			arFSTagSettings.getFileDataItemTags(false, 'application/json')
		);
		expect(arFSTagSettings.getFileDataItemTags(false, 'application/json')).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Content-Type', value: 'application/json' }
		]);
	});
});
