import { expect } from 'chai';
import { stub1025CharString, stub3073CharString } from '../../../tests/stubs';
import { GQLTagInterface } from '../../types';
import { TagAssertions } from './tag_assertions';

describe('TagAssertions class', () => {
	const tagAssertions = new TagAssertions();

	it('resolves without error if there are the maximum allowed GQL tags', () => {
		const tags = generateStubGqlTagInterfaceArrayWithLength(128);

		expect(() => tagAssertions.assertTagLimits(tags)).to.not.throw(Error);
	});

	it('throws an error if there are too many GQL tags', () => {
		const tags = generateStubGqlTagInterfaceArrayWithLength(129);

		expect(() => tagAssertions.assertTagLimits(tags)).to.throw(
			Error,
			'Amount of GQL Tags (129) exceeds the maximum limit allowed (128)!'
		);
	});

	it('throws an error if provided tag has too many keys', () => {
		const tag: GQLTagInterface = {
			name: 'Tag-Keys-Test',
			value: 'Awesome value',
			extraKey: 'This will error!'
		} as GQLTagInterface;

		expect(() => tagAssertions.assertTagLimits([tag])).to.throw(
			Error,
			'GQL tag has too many keys, tags must only have "name" and "value" fields!'
		);
	});

	it('resolves without error if the name field on a tag has the maximum allowed bytes', () => {
		const tag: GQLTagInterface = {
			name: stub1025CharString.slice(1),
			value: 'Name field byte limit test'
		};

		expect(() => tagAssertions.assertTagLimits([tag])).to.not.throw(Error);
	});

	it('throws an error if the name field on a tag has too many bytes', () => {
		const tag: GQLTagInterface = {
			name: stub1025CharString,
			value: 'Name field byte limit test'
		};

		expect(() => tagAssertions.assertTagLimits([tag])).to.throw(
			Error,
			'GQL tag "name" field byte size (1025) has exceeded the maximum byte limit allowed of 1024!'
		);
	});

	it('throws an error if the total byte count of the gql tags exceeds maximum allowed bytes', () => {
		const tag: GQLTagInterface = {
			name: 'Value field byte limit test',
			value: stub3073CharString.slice(1)
		};

		expect(() => tagAssertions.assertTagLimits([tag])).to.throw(
			Error,
			'Transaction has 3099 bytes of GQL tags! This exceeds the tag limit of 2048 bytes.'
		);
	});

	it('throws an error if the value field on a tag has too many bytes', () => {
		const tag: GQLTagInterface = {
			name: 'Value field byte limit test',
			value: stub3073CharString
		};

		expect(() => tagAssertions.assertTagLimits([tag])).to.throw(
			Error,
			'GQL tag "value" field byte size (3073) has exceeded the maximum byte limit allowed of 3072!'
		);
	});

	it('throws an error if the name field is an empty string', () => {
		const tag: GQLTagInterface = {
			name: '',
			value: 'Name field empty string test'
		};

		expect(() => tagAssertions.assertTagLimits([tag])).to.throw(
			Error,
			'GQL tag "name" must be a non-empty string!'
		);
	});

	it('throws an error if the name field is not a string', () => {
		const tag = {
			name: 89,
			value: 'Name field wrong type test'
		} as unknown;

		expect(() => tagAssertions.assertTagLimits([tag as GQLTagInterface])).to.throw(
			Error,
			'GQL tag "name" must be a non-empty string!'
		);
	});

	it('throws an error if the value field is an empty string', () => {
		const tag: GQLTagInterface = {
			name: 'Value field empty string test',
			value: ''
		};

		expect(() => tagAssertions.assertTagLimits([tag])).to.throw(
			Error,
			'GQL tag "value" must be a non-empty string!'
		);
	});

	it('throws an error if the value field is not a string', () => {
		const tag = {
			name: 'Value field wrong type test',
			value: 12345
		} as unknown;

		expect(() => tagAssertions.assertTagLimits([tag as GQLTagInterface])).to.throw(
			Error,
			'GQL tag "value" must be a non-empty string!'
		);
	});
});

function generateStubGqlTagInterfaceArrayWithLength(length: number): GQLTagInterface[] {
	const tags: GQLTagInterface[] = [];
	while (tags.length < length) {
		// Create a gql tag interface array with 128 tags
		tags.push({ name: `T-${tags.length}`, value: `${tags.length}` });
	}
	return tags;
}
