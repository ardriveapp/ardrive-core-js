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

	it('returns the expected file data item tags, dated in seconds as the file data prototype dates them', () => {
		const tags = arFSTagSettings.getFileDataItemTags(false, 'application/json');
		expect(tags.slice(0, 3)).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Content-Type', value: 'application/json' }
		]);
		expect(tags).to.have.length(4);
		expectNowInSeconds(tags[3]);
	});

	it('returns the expected private file data item tags, dated as well', () => {
		const tags = arFSTagSettings.getFileDataItemTags(true, 'application/json');
		expect(tags.map((t) => t.name)).to.deep.equal([
			'App-Name',
			'App-Version',
			'Content-Type',
			'Cipher',
			'Cipher-IV',
			'Unix-Time'
		]);
		expectNowInSeconds(tags[5]);
	});
});

function expectNowInSeconds(tag: { name: string; value: string }): void {
	expect(tag.name).to.equal('Unix-Time');
	expect(tag.value).to.match(/^\d{10}$/);
	expect(Math.abs(+tag.value - Date.now() / 1000)).to.be.lessThan(60);
}
