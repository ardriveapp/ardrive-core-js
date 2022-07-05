export type CustomMetaDataTagInterface = Record<string, string | string[]>;

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

export interface CustomMetaData {
	tagsOnFileMetaDataJson?: CustomMetaDataTagInterface;
	tagsOnFileMetaDataGql?: CustomMetaDataTagInterface;

	// TODO: Include dataTx GQL tags as an option (PE-1534)
	// tagsOnFileDataTxGql?: CustomMetaDataTagInterface;

	// tagsOnFolderMetaDataJson?: CustomMetaDataTagInterface;
	// tagsOnFolderMetaDataGql?: CustomMetaDataTagInterface;

	// tagsOnDriveMetaDataJson?: CustomMetaDataTagInterface;
	// tagsOnDriveMetaDataGql?: CustomMetaDataTagInterface;
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
