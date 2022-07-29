import { expect } from 'chai';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { isCustomMetaDataGqlTags } from './custom_metadata_types';

describe('isCustomMetaDataGqlTags type guard function', () => {
	it('returns false if provided tag name collides with any protected ArFS GQL tag name', () => {
		const testedTagNames = [
			'App-Name',
			'App-Version',
			'ArFS',
			'Tip-Type',
			'Content-Type',
			'Boost',
			'Bundle-Format',
			'Bundle-Version',
			'Entity-Type',
			'Unix-Time',
			'Drive-Id',
			'Folder-Id',
			'File-Id',
			'Parent-Folder-Id',
			'Drive-Privacy',
			'Cipher',
			'Cipher-IV',
			'Drive-Auth-Mode'
		];
		for (const protectedTagName of ArFSTagSettings.protectedArFSGqlTagNames) {
			expect(testedTagNames).includes(protectedTagName);
		}
		expect(testedTagNames.length).to.equal(ArFSTagSettings.protectedArFSGqlTagNames.length);

		for (const tagName of testedTagNames) {
			expect(isCustomMetaDataGqlTags({ [tagName]: 'Val' })).to.be.false;
		}
	});
});
