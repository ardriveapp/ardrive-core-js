const invalidSchemaErrorMessage = `Invalid custom metadata schema. Please submit a valid JSON object with an example shape of `;

const customMetaDataTagInterfaceShapeOne = '{ "TAG_NAME": "TAG_VALUE" }';
const customMetaDataTagInterfaceShapeTwo = '{ "TAG_NAME": ["VAL 1", "VAL 2" ]}';

export const invalidCustomMetaDataTagInterfaceErrorMessage = `${invalidSchemaErrorMessage}${customMetaDataTagInterfaceShapeOne} or ${customMetaDataTagInterfaceShapeTwo}`;

const customMetaDataShape = `{ metaDataJson?: ${customMetaDataTagInterfaceShapeOne}, metaDataGql?: ${customMetaDataTagInterfaceShapeTwo} }`;

export const invalidCustomMetaDataErrorMessage = `s${invalidSchemaErrorMessage}${customMetaDataShape}`;

export type CustomMetaDataTags = Record<string, string | string[]>;

export interface CustomMetaData {
	/** Include custom metadata on MetaData Tx Data JSON */
	metaDataJson?: CustomMetaDataTags;

	/** Include custom metadata on MetaData Tx GQL Tags */
	metaDataGqlTags?: CustomMetaDataTags;

	// TODO: Include dataTx GQL tags as an option (PE-1534)
	/** Include custom metadata on File Data Tx GQL Tags */
	// dataGqlTags?: CustomMetaDataTagInterface;
}

export function isCustomMetaDataTagInterface(tags: unknown): tags is CustomMetaDataTags {
	if (typeof tags !== 'object' || tags === null) {
		return false;
	}

	for (const value of Object.values(tags)) {
		if (typeof value === 'string') {
			assertCharacterLength(value);
			continue;
		}

		if (!Array.isArray(value)) {
			return false;
		}

		if (value.length > 1) {
			for (const item of value) {
				if (typeof item !== 'string') {
					return false;
				}
				assertCharacterLength(item);
			}
		}
	}

	return true;
}

function assertCharacterLength(value: string): void {
	if (value.length === 0) {
		throw Error('Metadata string must be at least one character!');
	}
}

export function isCustomMetaData(tags: unknown): tags is CustomMetaData {
	if (typeof tags !== 'object' || tags === null) {
		return false;
	}

	for (const [key, val] of Object.entries(tags)) {
		if (key !== 'metaDataJson' && key !== 'metaDataGqlTags') {
			return false;
		}
		if (!isCustomMetaDataTagInterface(val)) {
			return false;
		}
	}
	return true;
}

export function assertCustomMetaDataTagInterface(tags: unknown): tags is CustomMetaDataTags {
	if (!isCustomMetaDataTagInterface(tags)) {
		console.log('invalidCustomMetaDataTagInterfaceErrorMessage', invalidCustomMetaDataTagInterfaceErrorMessage);
		throw Error(invalidCustomMetaDataTagInterfaceErrorMessage);
	}
	return true;
}

export function assertCustomMetaData(tags: unknown): tags is CustomMetaData {
	if (!isCustomMetaData(tags)) {
		console.log('invalidCustomMetaDataErrorMessage', invalidCustomMetaDataErrorMessage);
		throw Error(invalidCustomMetaDataErrorMessage);
	}
	return true;
}
