import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { GqlTagName } from '../utils/constants';
import { EntityMetaDataTransactionData, JsonSerializable } from './types';

const invalidSchemaErrorMessage = `Invalid custom metadata schema. Please submit a valid JSON object with an example shape of `;

const customMetaDataGqlTagShapeOne = '{ "TAG_NAME": "TAG_VALUE" }';
const customMetaDataGqlTagShapeTwo = '{ "TAG_NAME": ["VAL 1", "VAL 2" ] }';
const customMetaDataJsonShape = '{ "TAG_NAME": { "Any": [ "Valid", "JSON" ] } }';
const customMetaDataShape = `{ metaDataJson?: ${customMetaDataGqlTagShapeOne}, metaDataGql?: ${customMetaDataGqlTagShapeTwo}, dataGqlTags?: ${customMetaDataGqlTagShapeTwo} }`;

export const invalidCustomMetaDataGqlTagErrorMessage = `${invalidSchemaErrorMessage}${customMetaDataGqlTagShapeOne} or ${customMetaDataGqlTagShapeTwo}`;
export const invalidCustomDataGqlTagErrorMessage = `${invalidSchemaErrorMessage}${customMetaDataGqlTagShapeOne} or ${customMetaDataGqlTagShapeTwo}`;
export const invalidCustomMetaDataJsonErrorMessage = `${invalidSchemaErrorMessage}${customMetaDataJsonShape}`;
export const invalidCustomMetaDataErrorMessage = `${invalidSchemaErrorMessage}${customMetaDataShape}`;

export type CustomMetaDataGqlTags = Record<string, string | string[]>;
export type CustomMetaDataJsonFields = EntityMetaDataTransactionData;
export type CustomMetaDataTagInterface = CustomMetaDataGqlTags;

export interface CustomMetaData {
	/** Include custom metadata on MetaData Tx Data JSON */
	metaDataJson?: CustomMetaDataJsonFields;

	/** Include custom metadata on MetaData Tx GQL Tags */
	metaDataGqlTags?: CustomMetaDataGqlTags;

	/** Include custom metadata on File Data Tx GQL Tags */
	dataGqlTags?: CustomMetaDataTagInterface;
}

export function isCustomMetaDataJsonFields(customDataJson: unknown): customDataJson is CustomMetaDataJsonFields {
	return isJsonSerializable(customDataJson);
}

/** Type guard that checks if the provided JSON will parse */
export function isJsonSerializable(json: unknown): json is JsonSerializable {
	try {
		JSON.parse(JSON.stringify(json));
	} catch {
		return false;
	}
	return true;
}

/**
 * Type guard that checks for Record<string, string | string[]> shape and
 * asserts that each key and value string has at least one character
 */
export function isCustomMetaDataGqlTags(customGqlTags: unknown): customGqlTags is CustomMetaDataGqlTags {
	if (typeof customGqlTags !== 'object' || customGqlTags === null) {
		return false;
	}

	for (const [name, value] of Object.entries(customGqlTags)) {
		// prettier-ignore
		if (ArFSTagSettings.protectedArFSGqlTagNames.includes(name as unknown as GqlTagName)) {
			console.error(
				`Provided custom metadata GQL tag name collides with a protected ArFS protected tag: ${name}`
			);
			return false;
		}

		if (typeof value === 'string') {
			assertCharacterLength(value);
			continue;
		}

		if (!Array.isArray(value)) {
			return false;
		}

		for (const item of value) {
			if (typeof item !== 'string') {
				return false;
			}
			assertCharacterLength(item);
		}
	}

	return true;
}

function assertCharacterLength(value: string): void {
	if (value.length === 0) {
		throw Error('Metadata string must be at least one character!');
	}
}

/** Type guard that checks the shape of a CustomMetaData input object */
export function isCustomMetaData(tags: unknown): tags is CustomMetaData {
	if (typeof tags !== 'object' || tags === null) {
		return false;
	}

	for (const [key, metaData] of Object.entries(tags)) {
		switch (key) {
			case 'metaDataJson':
				if (!isCustomMetaDataJsonFields(metaData)) {
					return false;
				}
				break;
			case 'metaDataGqlTags':
			case 'dataGqlTags':
				if (!isCustomMetaDataGqlTags(metaData)) {
					return false;
				}
				break;
			default:
				break;
		}
	}
	return true;
}

export function assertCustomMetaDataGqlTags(tags: unknown): tags is CustomMetaDataGqlTags {
	if (!isCustomMetaDataGqlTags(tags)) {
		throw Error(invalidCustomMetaDataGqlTagErrorMessage);
	}
	return true;
}

export function assertCustomMetaDataJsonFields(tags: unknown): tags is CustomMetaDataJsonFields {
	if (!isCustomMetaDataJsonFields(tags)) {
		throw Error(invalidCustomMetaDataJsonErrorMessage);
	}
	return true;
}

export function assertCustomMetaData(tags: unknown): tags is CustomMetaData {
	if (!isCustomMetaData(tags)) {
		// TODO: throw the error for data ones as well.
		throw Error(invalidCustomMetaDataErrorMessage);
	}
	return true;
}
