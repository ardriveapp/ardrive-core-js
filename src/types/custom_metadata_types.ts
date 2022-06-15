// TODO: Include dataTx GQL tags as an option (PE-1534)
export const metaDataJsonType = 'metaDataJson';
export const metaDataGqlType = 'metaDataGql';

export type CustomMetaDataTagInterface = Record<string, string | string[]>;

export type CustomMetaDataType = typeof metaDataJsonType | typeof metaDataGqlType; // | 'dataTxGql';

export interface CustomMetaData {
	tags: CustomMetaDataTagInterface;
	includeOn: CustomMetaDataType[];
	// TODO: Add exclude from certain entity types for when we include on drives/folders (PE-1533)
	// excludeFrom?: EntityType[];
}
