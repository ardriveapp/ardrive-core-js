export type CustomMetaDataTagInterface = Record<string, string | string[]>;

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
