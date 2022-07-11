import {
	ArFSDriveMetaDataPrototype,
	ArFSEntityMetaDataPrototype,
	ArFSFileDataPrototype,
	ArFSFileMetaDataPrototype,
	ArFSFolderMetaDataPrototype,
	ArFSPrivateFileDataPrototype,
	ArFSPrivateFileMetaDataPrototype,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPublicFileDataPrototype,
	ArFSPublicFileMetaDataPrototype,
	ArFSPublicFolderMetaDataPrototype
} from './tx/arfs_prototypes';
import {
	ArFSFileMetadataTransactionData,
	ArFSPrivateFileDataTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPublicFileDataTransactionData,
	ArFSPublicFolderTransactionData
} from './tx/arfs_tx_data_types';

import {
	DataContentType,
	DriveID,
	FileID,
	FolderID,
	ByteCount,
	TransactionID,
	UnixTime,
	FolderUploadStats,
	PartialPrepareFileParams,
	FileUploadStats
} from '../types';

export type MoveEntityMetaDataFactory = () => ArFSEntityMetaDataPrototype;

export type FolderMetaDataFactory = (folderId: FolderID, parentFolderId?: FolderID) => ArFSFolderMetaDataPrototype;

export type FileDataPrototypeFactory = (
	desfileData: Buffer,
	dataContentType: DataContentType,
	fileId: FileID
) => Promise<ArFSFileDataPrototype>;

export type FileMetadataTxDataFactory<D extends ArFSFileMetadataTransactionData> = (
	destinationFileName: string,
	fileSize: ByteCount,
	lastModifiedDateMS: UnixTime,
	dataTxId: TransactionID,
	dataContentType: DataContentType,
	fileId: FileID
) => Promise<D>;

export type FileMetaDataFactory<D extends ArFSFileMetadataTransactionData> = (
	metadataTxData: D,
	fileId: FileID
) => ArFSFileMetaDataPrototype;

export type CreateDriveMetaDataFactory = (
	driveID: DriveID,
	rootFolderId: FolderID
) => Promise<ArFSDriveMetaDataPrototype>;

/** Assembles data and metadata prototype factories to be used in prepareFile */
export function getPrepFileParams({
	destDriveId,
	destFolderId,
	wrappedEntity: wrappedFile,
	driveKey
}: FileUploadStats): PartialPrepareFileParams {
	if (driveKey) {
		return {
			// Return factories for private prototypes
			wrappedFile,
			dataPrototypeFactoryFn: async (fileData, fileId) =>
				new ArFSPrivateFileDataPrototype(
					await ArFSPrivateFileDataTransactionData.from(fileData, fileId, driveKey)
				),
			metadataTxDataFactoryFn: async (fileId, dataTxId) => {
				return ArFSPrivateFileMetaDataPrototype.fromFile({
					dataTxId,
					driveId: destDriveId,
					fileId,
					parentFolderId: destFolderId,
					wrappedFile,
					driveKey
				});
			}
		};
	}

	return {
		// Return factories for public prototypes
		wrappedFile,
		dataPrototypeFactoryFn: (fileData) =>
			Promise.resolve(
				new ArFSPublicFileDataPrototype(
					new ArFSPublicFileDataTransactionData(fileData),
					wrappedFile.contentType
				)
			),
		metadataTxDataFactoryFn: (fileId, dataTxId) =>
			Promise.resolve(
				ArFSPublicFileMetaDataPrototype.fromFile({
					wrappedFile,
					parentFolderId: destFolderId,
					fileId,
					driveId: destDriveId,
					dataTxId
				})
			)
	};
}

/** Assembles folder metadata prototype factory to be used in prepareFolder */
export async function getPrepFolderFactoryParams({
	destDriveId,
	destFolderId,
	wrappedEntity: wrappedFolder,
	driveKey
}: FolderUploadStats): Promise<(folderId: FolderID) => ArFSFolderMetaDataPrototype> {
	if (driveKey) {
		// Return factory for private folder prototype
		const folderData = await ArFSPrivateFolderTransactionData.from(
			wrappedFolder.destinationBaseName,
			driveKey,
			wrappedFolder.customMetaData?.metaDataJson
		);
		return (folderId) =>
			new ArFSPrivateFolderMetaDataPrototype(
				destDriveId,
				wrappedFolder.existingId ?? folderId,
				folderData,
				destFolderId,
				wrappedFolder.customMetaData?.metaDataGqlTags
			);
	}

	return (folderId) =>
		// Return factory for public folder prototype
		new ArFSPublicFolderMetaDataPrototype(
			new ArFSPublicFolderTransactionData(
				wrappedFolder.destinationBaseName,
				wrappedFolder.customMetaData?.metaDataJson
			),
			destDriveId,
			wrappedFolder.existingId ?? folderId,
			destFolderId,
			wrappedFolder.customMetaData?.metaDataGqlTags
		);
}
