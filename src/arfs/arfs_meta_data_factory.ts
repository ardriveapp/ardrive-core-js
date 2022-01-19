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
} from './arfs_prototypes';
import {
	ArFSFileMetadataTransactionData,
	ArFSPrivateFileDataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPublicFileDataTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderTransactionData
} from './arfs_tx_data_types';

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
	driveKey,
	customContentType
}: FileUploadStats): PartialPrepareFileParams {
	const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

	if (driveKey) {
		return {
			// Return factories for private prototypes
			wrappedFile,
			dataPrototypeFactoryFn: async (fileData, fileId) =>
				new ArFSPrivateFileDataPrototype(
					await ArFSPrivateFileDataTransactionData.from(fileData, fileId, driveKey)
				),
			metadataTxDataFactoryFn: async (fileId, dataTxId) => {
				return new ArFSPrivateFileMetaDataPrototype(
					await ArFSPrivateFileMetadataTransactionData.from(
						wrappedFile.destinationBaseName,
						fileSize,
						lastModifiedDateMS,
						dataTxId,
						customContentType ?? dataContentType,
						fileId,
						driveKey
					),
					destDriveId,
					fileId,
					destFolderId
				);
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
					customContentType ?? dataContentType
				)
			),
		metadataTxDataFactoryFn: (fileId, dataTxId) =>
			Promise.resolve(
				new ArFSPublicFileMetaDataPrototype(
					new ArFSPublicFileMetadataTransactionData(
						wrappedFile.destinationBaseName,
						fileSize,
						lastModifiedDateMS,
						dataTxId,
						customContentType ?? dataContentType
					),
					destDriveId,
					fileId,
					destFolderId
				)
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
		const folderData = await ArFSPrivateFolderTransactionData.from(wrappedFolder.destinationBaseName, driveKey);
		return (folderId) =>
			new ArFSPrivateFolderMetaDataPrototype(
				destDriveId,
				wrappedFolder.existingId ?? folderId,
				folderData,
				destFolderId
			);
	}

	return (folderId) =>
		// Return factory for public folder prototype
		new ArFSPublicFolderMetaDataPrototype(
			new ArFSPublicFolderTransactionData(wrappedFolder.destinationBaseName),
			destDriveId,
			wrappedFolder.existingId ?? folderId,
			destFolderId
		);
}
