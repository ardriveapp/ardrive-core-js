import { GQLTagInterface, FeeMultiple, TipType, DataContentType } from '../types';
import {
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION,
	CURRENT_ARFS_VERSION,
	privateOctetContentTypeTag,
	privateCipherTag,
	fakePrivateCipherIVTag,
	gqlTagNameArray
} from '../utils/constants';

interface ArFSTagSettingsParams {
	appName?: string;
	appVersion?: string;
	arFSVersion?: string;
	appPlatform?: string;
}

export class ArFSTagSettings {
	private readonly appName: string;
	private readonly appVersion: string;
	private readonly arFSVersion: string;
	private readonly appPlatform?: string;

	public static protectedArFSGqlTagNames = gqlTagNameArray;

	constructor({
		appName = DEFAULT_APP_NAME,
		appVersion = DEFAULT_APP_VERSION,
		arFSVersion = CURRENT_ARFS_VERSION,
		appPlatform
	}: ArFSTagSettingsParams) {
		this.appName = appName;
		this.appVersion = appVersion;
		this.arFSVersion = arFSVersion;
		this.appPlatform = appPlatform;
	}

	public get baseAppTags(): GQLTagInterface[] {
		const tags: GQLTagInterface[] = [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion }
		];

		// Add App-Platform tag if specified
		if (this.appPlatform) {
			tags.push({ name: 'App-Platform', value: this.appPlatform });
		}

		return tags;
	}

	public getBoostTags(feeMultiple: FeeMultiple): GQLTagInterface[] {
		return [{ name: 'Boost', value: feeMultiple.toString() }];
	}

	public getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [{ name: 'Tip-Type', value: tipType }];
	}

	public get baseArFSTags(): GQLTagInterface[] {
		return [...this.baseAppTags, { name: 'ArFS', value: this.arFSVersion }];
	}

	public get baseBundleTags(): GQLTagInterface[] {
		return [
			...this.baseAppTags,
			{ name: 'Bundle-Format', value: 'binary' },
			{ name: 'Bundle-Version', value: '2.0.0' }
		];
	}

	/** @deprecated Used for the deprecated flow of sending a separate community tip tx */
	public getTipTagsWithAppTags(): GQLTagInterface[] {
		return [...this.baseAppTags, ...this.getTipTags()];
	}

	/**
	 * Used for estimating byte count of data items to bypass storing the Buffer from ArFSFileDataPrototype
	 *
	 * TODO: Don't use the file data Buffer in ArFSFileDataPrototype so it can be used in estimation without memory concerns
	 */
	public getFileDataItemTags(isPrivate: boolean, dataContentType: DataContentType): GQLTagInterface[] {
		const tags = this.baseAppTags;

		tags.push(
			...(isPrivate
				? [privateOctetContentTypeTag, privateCipherTag, fakePrivateCipherIVTag]
				: [{ name: 'Content-Type', value: dataContentType }])
		);

		return tags;
	}
}
