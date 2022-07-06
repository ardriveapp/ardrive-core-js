export type CustomMetaDataTagInterface = Record<string, string | string[]>;

export interface CustomMetaData {
	/** Include custom metadata on MetaData Tx Data JSON */
	metaDataJson?: CustomMetaDataTagInterface;

	/** Include custom metadata on MetaData Tx GQL Tags */
	metaDataGqlTags?: CustomMetaDataTagInterface;

	// TODO: Include dataTx GQL tags as an option (PE-1534)
	/** Include custom metadata on File Data Tx GQL Tags */
	// dataGqlTags?: CustomMetaDataTagInterface;
}

export function isCustomMetaDataTagInterface(tags: unknown): tags is CustomMetaDataTagInterface {
	if (typeof tags !== 'object' || tags === null) {
		return false;
	}

	for (const value of Object.values(tags)) {
		if (typeof value === 'string') {
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
			}
		}
	}

	return true;
}

export function isCustomMetaData(tags: unknown): tags is CustomMetaData {
	if (typeof tags !== 'object' || tags === null) {
		return false;
	}

	for (const [key, val] of Object.entries(tags)) {
		if (key !== 'tagsOnFileMetaDataJson' && key !== 'tagsOnFileMetaDataGql') {
			return false;
		}
		if (!isCustomMetaDataTagInterface(val)) {
			return false;
		}
	}
	return true;
}
