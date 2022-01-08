import { GQLTagInterface, TipType } from '../types';
import {
	CURRENT_ARFS_VERSION,
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION,
	fakePrivateCipherIVTag,
	privateCipherTag,
	privateOctetContentTypeTag,
	publicJsonContentTypeTag
} from '../utils/constants';

// Tag Limits to be in compliance with ANS-104:
// https://github.com/joshbenaron/arweave-standards/blob/ans104/ans/ANS-104.md#21-verifying-a-dataitem
const MAX_TAG_LIMIT = 128;
const TAG_NAME_BYTE_LIMIT = 1024;
const TAG_VALUE_BYTE_LIMIT = 3072;
const TAG_KEY_LIMIT = 2;

interface ArFSTagSettingsParams {
	appName?: string;
	appVersion?: string;
	arFSVersion?: string;
}

export class ArFSTagSettings {
	private readonly appName: string;
	private readonly appVersion: string;
	private readonly arFSVersion: string;

	constructor({
		appName = DEFAULT_APP_NAME,
		appVersion = DEFAULT_APP_VERSION,
		arFSVersion = CURRENT_ARFS_VERSION
	}: ArFSTagSettingsParams) {
		this.appName = appName;
		this.appVersion = appVersion;
		this.arFSVersion = arFSVersion;

		this.assertTagLimits(this.baseArFSTags);
	}

	get baseAppTags(): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion }
		];
	}

	get baseArFSTags(): GQLTagInterface[] {
		return [...this.baseAppTags, { name: 'ArFS', value: this.arFSVersion }];
	}

	get baseBundleTags(): GQLTagInterface[] {
		return [
			...this.baseAppTags,
			{ name: 'Bundle-Format', value: 'binary' },
			{ name: 'Bundle-Version', value: '2.0.0' }
		];
	}

	getTipTagsWithAppTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [...this.baseAppTags, ...this.getTipTags(tipType)];
	}

	getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [{ name: 'Tip-Type', value: tipType }];
	}

	baseAppTagsIncluding({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		return this.assembleTags({ tags: [...this.baseAppTags, ...tags], excludedTagNames });
	}

	baseArFSTagsIncluding({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		return this.assembleTags({ tags: [...this.baseArFSTags, ...tags], excludedTagNames });
	}

	baseBundleTagsIncluding({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		return this.assembleTags({ tags: [...this.baseBundleTags, ...tags], excludedTagNames });
	}

	getFileDataTags(isPrivate: boolean): GQLTagInterface[] {
		const tags = isPrivate
			? [privateOctetContentTypeTag, privateCipherTag, fakePrivateCipherIVTag]
			: [publicJsonContentTypeTag];

		return this.assembleTags({ tags: [...this.baseAppTags, ...tags] });
	}

	private assembleTags({ tags, excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		tags = this.filterExcludedTagNames({ tags, excludedTagNames });
		this.assertTagLimits(tags);

		return tags;
	}

	assertTagLimits(tags: GQLTagInterface[]): void {
		if (tags.length > MAX_TAG_LIMIT) {
			throw new Error(
				`Amount of GQL Tags (${tags.length}) exceeds the maximum limit allowed (${MAX_TAG_LIMIT})!`
			);
		}
		for (const tag of tags) {
			if (Object.keys(tag).length > TAG_KEY_LIMIT) {
				throw new Error('GQL tag has too many keys, tags must only have "name" and "value" fields!');
			}

			if (tag.name.length > TAG_NAME_BYTE_LIMIT) {
				throw new Error(
					`GQL tag "name" field byte size (${tag.name.length}) has exceeded the maximum byte limit allowed of ${TAG_NAME_BYTE_LIMIT}!`
				);
			}

			if (tag.value.length > TAG_VALUE_BYTE_LIMIT) {
				throw new Error(
					`GQL tag "value" field byte size (${tag.value.length}) has exceeded the maximum byte limit allowed of ${TAG_VALUE_BYTE_LIMIT}!`
				);
			}

			if (tag.name.length < 1 || typeof tag.name !== 'string') {
				throw new Error('GQL tag "name" must be a non-empty string!');
			}

			if (tag.value.length < 1 || typeof tag.value !== 'string') {
				throw new Error('GQL tag "value" must be a non-empty string!');
			}
		}
	}

	private filterExcludedTagNames({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		return tags.filter((tag) => !excludedTagNames.includes(tag.name));
	}
}

interface TagAssembleParams {
	tags?: GQLTagInterface[];
	excludedTagNames?: string[];
}
