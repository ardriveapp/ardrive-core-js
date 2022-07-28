import { expect } from 'chai';
import { isCustomMetaDataGqlTags } from './custom_metadata_types';

describe('isCustomMetaDataGqlTags type guard function', () => {
	it('returns false if provided tag name collides with any protected ArFS GQL tag name', () => {
		const tagNames = [
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

		for (const tagName of tagNames) {
			expect(isCustomMetaDataGqlTags({ [tagName]: 'Val' })).to.be.false;
		}
	});
});
