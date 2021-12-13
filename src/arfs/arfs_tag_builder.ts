import { CURRENT_ARFS_VERSION, GQLTagInterface, TipType } from '../types';

export class ArFSTagBuilder {
	constructor(
		private readonly appName: string,
		private readonly appVersion: string,
		private readonly arFSVersion: string = CURRENT_ARFS_VERSION
	) {}

	get baselineArFSTags(): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'ArFS', value: this.arFSVersion }
		];
	}

	getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'Type', value: 'fee' },
			{ name: 'Tip-Type', value: tipType }
		];
	}
}
