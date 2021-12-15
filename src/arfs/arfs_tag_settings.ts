import { GQLTagInterface, TipType } from '../types';
import { CURRENT_ARFS_VERSION, DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from '../utils/constants';

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

	getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [...this.baseAppTags, { name: 'Type', value: 'fee' }, { name: 'Tip-Type', value: tipType }];
	}

	assembleBaseArFSTags({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		tags = [...this.baseArFSTags, ...tags];
		return this.filterExcludedTagNames({ tags, excludedTagNames });
	}

	assembleBaseBundleTags({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		tags = [...this.baseBundleTags, ...tags];
		return this.filterExcludedTagNames({ tags, excludedTagNames });
	}

	private filterExcludedTagNames({ tags = [], excludedTagNames = [] }: TagAssembleParams): GQLTagInterface[] {
		return tags.filter((tag) => !excludedTagNames.includes(tag.name));
	}
}

interface TagAssembleParams {
	tags?: GQLTagInterface[];
	excludedTagNames?: string[];
}
