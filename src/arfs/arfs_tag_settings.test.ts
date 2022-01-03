import { expect } from 'chai';
import { spy } from 'sinon';
import { stub1025CharString, stub3073CharString } from '../../tests/stubs';
import { GQLTagInterface } from '../types';
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
		expect(arFSTagSettings.getTipTags()).to.deep.equal([
			{ name: 'App-Name', value: 'Tag-Builder-Test' },
			{ name: 'App-Version', value: '1.2' },
			{ name: 'Type', value: 'fee' },
			{ name: 'Tip-Type', value: 'data upload' }
		]);
	});

	describe('baseArFSTagsIncluding method', () => {
		it('returns provided tags combined with the base arfs tags', () => {
			const assertSpy = spy(arFSTagSettings, 'assertTagLimits');

			expect(
				arFSTagSettings.baseArFSTagsIncluding({
					tags: [
						{ name: 'Custom-Tag-1', value: 'Gibberish' },
						{ name: 'Custom-Tag-2', value: 'Excited penguin' }
					]
				})
			).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' },
				{ name: 'App-Version', value: '1.2' },
				{ name: 'ArFS', value: '0.101' },
				{ name: 'Custom-Tag-1', value: 'Gibberish' },
				{ name: 'Custom-Tag-2', value: 'Excited penguin' }
			]);
			expect(assertSpy.callCount).to.equal(1);
		});

		it('can exclude any specified tags names', () => {
			expect(arFSTagSettings.baseArFSTagsIncluding({ excludedTagNames: ['App-Version', 'ArFS'] })).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' }
			]);
		});
	});

	describe('baseAppTagsIncluding method', () => {
		it('returns provided tags combined with the base app tags', () => {
			const assertSpy = spy(arFSTagSettings, 'assertTagLimits');

			expect(
				arFSTagSettings.baseArFSTagsIncluding({
					tags: [
						{ name: 'Custom-Tag-5', value: 'Expected tag' },
						{ name: 'Custom-Tag-837', value: 'Another expected tag' }
					]
				})
			).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' },
				{ name: 'App-Version', value: '1.2' },
				{ name: 'ArFS', value: '0.101' },
				{ name: 'Custom-Tag-5', value: 'Expected tag' },
				{ name: 'Custom-Tag-837', value: 'Another expected tag' }
			]);
			expect(assertSpy.callCount).to.equal(1);
		});

		it('can exclude any specified tags names', () => {
			expect(arFSTagSettings.baseAppTagsIncluding({ excludedTagNames: ['App-Version'] })).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' }
			]);
		});
	});

	describe('baseBundleTagsIncluding method', () => {
		it('returns provided tags combined with the base bundle tags', () => {
			const assertSpy = spy(arFSTagSettings, 'assertTagLimits');

			expect(
				arFSTagSettings.baseBundleTagsIncluding({
					tags: [
						{ name: 'Custom-Tag-5', value: 'Monkey paradise' },
						{ name: 'Custom-Tag-8', value: 'Mountain sun' }
					]
				})
			).to.deep.equal([
				{ name: 'App-Name', value: 'Tag-Builder-Test' },
				{ name: 'App-Version', value: '1.2' },
				{ name: 'Bundle-Format', value: 'binary' },
				{ name: 'Bundle-Version', value: '2.0.0' },
				{ name: 'Custom-Tag-5', value: 'Monkey paradise' },
				{ name: 'Custom-Tag-8', value: 'Mountain sun' }
			]);
			expect(assertSpy.callCount).to.equal(1);
		});

		it('can exclude any specified tags names', () => {
			expect(
				arFSTagSettings.baseBundleTagsIncluding({ excludedTagNames: ['App-Name', 'Bundle-Format'] })
			).to.deep.equal([
				{ name: 'App-Version', value: '1.2' },
				{ name: 'Bundle-Version', value: '2.0.0' }
			]);
		});
	});

	// 	A tag object is valid iff.:
	// • there are <= 128 tags
	// • each key is <= 1024 bytes
	// • each value is <= 3072 bytes
	// • only contains a key and value
	// • both the key and value are non-empty strings

	describe('assertTagLimits method', () => {
		it('resolves without error if there are the maximum allowed GQL tags', () => {
			const tags: GQLTagInterface[] = [];
			while (tags.length < 128) {
				// Create a gql tag interface array with 128 tags
				tags.push({ name: `Test-Tag-${tags.length}`, value: `Best value ${tags.length}` });
			}

			expect(() => arFSTagSettings.assertTagLimits(tags)).to.not.throw(Error);
		});

		it('throws an error if there are too many GQL tags', () => {
			const tags: GQLTagInterface[] = [];
			while (tags.length < 129) {
				// Create a gql tag interface array with 129 tags
				tags.push({ name: `Test-Tag-${tags.length}`, value: `Best value ${tags.length}` });
			}

			expect(() => arFSTagSettings.assertTagLimits(tags)).to.throw(
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

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.throw(
				Error,
				'GQL tag has too many keys, tags must only have "name" and "value" fields!'
			);
		});

		it('resolves without error if the name field on a tag has the maximum allowed bytes', () => {
			const tag: GQLTagInterface = {
				name: stub1025CharString.slice(1),
				value: 'Name field byte limit test'
			};

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.not.throw(Error);
		});

		it('throws an error if the name field on a tag has too many bytes', () => {
			const tag: GQLTagInterface = {
				name: stub1025CharString,
				value: 'Name field byte limit test'
			};

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.throw(
				Error,
				'GQL tag "name" field byte size (1025) has exceeded the maximum byte limit allowed of 1024!'
			);
		});

		it('resolves without error if the value field on a tag has the maximum allowed bytes', () => {
			const tag: GQLTagInterface = {
				name: 'Value field byte limit test',
				value: stub3073CharString.slice(1)
			};

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.not.throw(Error);
		});

		it('throws an error if the value field on a tag has too many bytes', () => {
			const tag: GQLTagInterface = {
				name: 'Value field byte limit test',
				value: stub3073CharString
			};

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.throw(
				Error,
				'GQL tag "value" field byte size (3073) has exceeded the maximum byte limit allowed of 3072!'
			);
		});

		it('throws an error if the name field is an empty string', () => {
			const tag: GQLTagInterface = {
				name: '',
				value: 'Name field empty string test'
			};

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.throw(
				Error,
				'GQL tag "name" must be a non-empty string!'
			);
		});

		it('throws an error if the name field is not a string', () => {
			const tag = {
				name: 89,
				value: 'Name field wrong type test'
			} as unknown;

			expect(() => arFSTagSettings.assertTagLimits([tag as GQLTagInterface])).to.throw(
				Error,
				'GQL tag "name" must be a non-empty string!'
			);
		});

		it('throws an error if the value field is an empty string', () => {
			const tag: GQLTagInterface = {
				name: 'Value field empty string test',
				value: ''
			};

			expect(() => arFSTagSettings.assertTagLimits([tag])).to.throw(
				Error,
				'GQL tag "value" must be a non-empty string!'
			);
		});

		it('throws an error if the value field is not a string', () => {
			const tag = {
				name: 'Value field wrong type test',
				value: 12345
			} as unknown;

			expect(() => arFSTagSettings.assertTagLimits([tag as GQLTagInterface])).to.throw(
				Error,
				'GQL tag "value" must be a non-empty string!'
			);
		});
	});
});
