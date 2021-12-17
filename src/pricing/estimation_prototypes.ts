import { ArFSPrivateFileMetaDataPrototype, ArFSPublicFileMetaDataPrototype } from '../arfs/arfs_prototypes';
import {
	ArFSEntityToUpload,
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPrivateDriveTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveMetaDataPrototype,
	ArFSPublicDriveTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderMetaDataPrototype,
	ArFSPublicFolderTransactionData,
	CreatePrivateDriveParams,
	CreatePublicDriveParams,
	DriveKey
} from '../exports';
import { EstimateCreateDriveParams } from '../types/cost_estimator_types';
import { fakeEntityId, fakeTxID } from '../utils/constants';

export async function getPrivateCreateDriveEstimationPrototypes({
	driveName,
	newPrivateDriveData
}: CreatePrivateDriveParams): Promise<EstimateCreateDriveParams> {
	return {
		rootFolderMetaDataPrototype: new ArFSPrivateFolderMetaDataPrototype(
			fakeEntityId,
			fakeEntityId,
			await ArFSPrivateFolderTransactionData.from(driveName, newPrivateDriveData.driveKey)
		),
		driveMetaDataPrototype: new ArFSPrivateDriveMetaDataPrototype(
			fakeEntityId,
			await ArFSPrivateDriveTransactionData.from(driveName, fakeEntityId, newPrivateDriveData.driveKey)
		)
	};
}

export function getPublicCreateDriveEstimationPrototypes({
	driveName
}: CreatePublicDriveParams): EstimateCreateDriveParams {
	return {
		rootFolderMetaDataPrototype: new ArFSPublicFolderMetaDataPrototype(
			new ArFSPublicFolderTransactionData(driveName),
			fakeEntityId,
			fakeEntityId
		),
		driveMetaDataPrototype: new ArFSPublicDriveMetaDataPrototype(
			new ArFSPublicDriveTransactionData(driveName, fakeEntityId),
			fakeEntityId
		)
	};
}

export function getPublicUploadFileEstimationPrototype(
	wrappedFile: ArFSEntityToUpload
): ArFSPublicFileMetaDataPrototype {
	const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

	return new ArFSPublicFileMetaDataPrototype(
		new ArFSPublicFileMetadataTransactionData(
			wrappedFile.name,
			fileSize,
			lastModifiedDateMS,
			fakeTxID,
			dataContentType
		),
		fakeEntityId,
		fakeEntityId,
		fakeEntityId
	);
}

export async function getPrivateUploadFileEstimationPrototype(
	wrappedFile: ArFSEntityToUpload,
	driveKey: DriveKey
): Promise<ArFSPrivateFileMetaDataPrototype> {
	const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

	return new ArFSPrivateFileMetaDataPrototype(
		await ArFSPrivateFileMetadataTransactionData.from(
			wrappedFile.name,
			fileSize,
			lastModifiedDateMS,
			fakeTxID,
			dataContentType,
			fakeEntityId,
			driveKey
		),
		fakeEntityId,
		fakeEntityId,
		fakeEntityId
	);
}
