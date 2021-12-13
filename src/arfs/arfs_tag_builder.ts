import { CURRENT_ARFS_VERSION, GQLTagInterface, TipType } from '../types';

export class ArFSTagBuilder {
	constructor(
		private readonly appName: string,
		private readonly appVersion: string,
		private readonly arFSVersion: string = CURRENT_ARFS_VERSION
	) {}

	get baseAppTags(): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion }
		];
	}

	get baseArFSTags(): GQLTagInterface[] {
		return [...this.baseAppTags, { name: 'ArFS', value: this.arFSVersion }];
	}

	// TODO: Does this need to be dynamic yet? `TipType` type only accepts 'data-upload'
	getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [...this.baseAppTags, { name: 'Type', value: 'fee' }, { name: 'Tip-Type', value: tipType }];
	}

	withBaseArFSTags(tags: GQLTagInterface[]): GQLTagInterface[] {
		return [...this.baseArFSTags, ...tags];
	}
}
