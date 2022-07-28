import { expect } from 'chai';
import { gqlTagNameArray } from '../utils/constants';
import { isCustomMetaDataGqlTags } from './custom_metadata_types';

describe('isCustomMetaDataGqlTags type guard function', () => {
	describe('returns false if provided tag name collides with any protected ArFS GQL tag name', () => {
		for (const tagName of gqlTagNameArray) {
			expect(isCustomMetaDataGqlTags({ [tagName]: 'Val' })).to.be.false;
		}
	});
});
