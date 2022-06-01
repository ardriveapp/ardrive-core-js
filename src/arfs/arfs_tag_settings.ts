import { GQLTagInterface, FeeMultiple, TipType, DataContentType, CustomMetaDataTagInterface } from '../types';
import {
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION,
	CURRENT_ARFS_VERSION,
	privateOctetContentTypeTag,
	privateCipherTag,
	fakePrivateCipherIVTag
} from '../utils/constants';

// TODO: Include dataTx GQL tags as an option (PE-1534)
export const metaDataJsonType = 'metaDataJson';
export const metaDataGqlType = 'metaDataGql';

export type CustomMetaDataType = typeof metaDataJsonType | typeof metaDataGqlType; // | 'dataTxGql';

export interface CustomMetaData {
	tags: CustomMetaDataTagInterface;
	includeOn: CustomMetaDataType[];
	// TODO: Add exclude from certain entity types for when we include on drives/folders (PE-1533)
	// excludeFrom?: EntityType[];
}

interface ArFSTagSettingsParams {
	appName?: string;
	appVersion?: string;
	arFSVersion?: string;
	customMetaData?: CustomMetaData;
}

export class ArFSTagSettings {
	private readonly appName: string;
	private readonly appVersion: string;
	private readonly arFSVersion: string;
	private readonly customMetaData: CustomMetaData;

	constructor({
		appName = DEFAULT_APP_NAME,
		appVersion = DEFAULT_APP_VERSION,
		arFSVersion = CURRENT_ARFS_VERSION,
		customMetaData = { tags: {}, includeOn: [] }
	}: ArFSTagSettingsParams) {
		this.appName = appName;
		this.appVersion = appVersion;
		this.arFSVersion = arFSVersion;
		this.customMetaData = customMetaData;
	}

	public get baseAppTags(): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion }
		];
	}

	public getBoostTags(feeMultiple: FeeMultiple): GQLTagInterface[] {
		return [{ name: 'Boost', value: feeMultiple.toString() }];
	}

	public getTipTags(tipType: TipType = 'data upload'): GQLTagInterface[] {
		return [{ name: 'Tip-Type', value: tipType }];
	}

	public getCustomMetaDataGqlTags(): CustomMetaDataTagInterface {
		return this.shouldApplyTagsTo(metaDataGqlType) ? this.customTags : {};
	}

	public getCustomMetaDataJSONTags(): CustomMetaDataTagInterface {
		return this.shouldApplyTagsTo(metaDataJsonType) ? this.customTags : {};
	}

	private shouldApplyTagsTo(customMetaDataType: CustomMetaDataType): boolean {
		return this.customMetaData.includeOn.includes(customMetaDataType);
	}

	private get customTags(): CustomMetaDataTagInterface {
		return this.customMetaData.tags;
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
