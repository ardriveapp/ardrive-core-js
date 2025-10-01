import {
	ArFSFileMetaDataPrototype,
	ArFSFolderMetaDataPrototype,
	ArFSPrivateFileMetaDataPrototype,
	ArFSPublicFileMetaDataPrototype
} from '../arfs/tx/arfs_prototypes';
import {
	ArFSPrivateDriveTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPublicFolderTransactionData
} from '../arfs/tx/arfs_tx_data_types';
import {
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPublicDriveMetaDataPrototype,
	ArFSPublicFolderMetaDataPrototype
} from '../arfs/tx/arfs_prototypes';
import { ArFSDataToUpload, ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';
import { ByteCount, CreatePrivateDriveParams, CreatePublicDriveParams, CustomMetaData } from '../types';
import { DriveKey } from '../types/entity_key';
import { DriveSignatureType } from '../types/types';
import { encryptedDataSize } from '../utils/common_browser';
import { VersionedDriveKey } from '../types/entity_key';
import { EstimateCreateDriveParams } from '../types/upload_planner_types';
import { fakeEntityId, fakeTxID } from '../utils/constants';

/** Derive a fake drive key from a stub drive key string for estimation and upload planning purposes */
export const getFakeDriveKey = async (): Promise<DriveKey> => {
	const fakeDriveKeyString = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZFAKE/s';
	const fakeDriveKey = Buffer.from(fakeDriveKeyString, 'base64');

	return new VersionedDriveKey(fakeDriveKey, DriveSignatureType.v1);
};

/**
 * Constructs a fake public folder metadata prototype from stubbed entity
 * IDs for estimation and planning purposes
 */

export function getPublicFolderEstimationPrototype(
	folderName: string,
	customMetaData?: CustomMetaData
): ArFSPublicFolderMetaDataPrototype {
	return new ArFSPublicFolderMetaDataPrototype(
		new ArFSPublicFolderTransactionData(folderName, customMetaData?.metaDataJson),
		fakeEntityId,
		fakeEntityId,
		undefined,
		customMetaData?.metaDataGqlTags
	);
}

/**
 * Constructs a fake private folder metadata prototype from stubbed entity
 * IDs and a stub drive key for estimation and planning purposes
 */
export async function getPrivateFolderEstimationPrototype(
	folderName: string,
	customMetaData?: CustomMetaData
): Promise<ArFSPrivateFolderMetaDataPrototype> {
	return new ArFSPrivateFolderMetaDataPrototype(
		fakeEntityId,
		fakeEntityId,
		await ArFSPrivateFolderTransactionData.from(folderName, await getFakeDriveKey(), customMetaData?.metaDataJson),
		undefined,
		customMetaData?.metaDataGqlTags
	);
}

/**
 * Constructs a fake public folder metadata prototype and a fake public
 * drive metadata prototype from stubbed entity IDs for estimation and
 * planning purposes during the createDrive flow
 */
export function getPublicCreateDriveEstimationPrototypes({
	driveName
}: CreatePublicDriveParams): EstimateCreateDriveParams {
	return {
		rootFolderMetaDataPrototype: getPublicFolderEstimationPrototype(driveName),
		driveMetaDataPrototype: new ArFSPublicDriveMetaDataPrototype(
			new ArFSPublicDriveTransactionData(driveName, fakeEntityId),
			fakeEntityId
		)
	};
}

/**
 * Constructs a fake private folder metadata prototype and a fake private
 * drive metadata prototype from stubbed entity IDs and a stub drive
 * key for estimation and planning purposes during the createDrive flow
 */
export async function getPrivateCreateDriveEstimationPrototypes({
	driveName
}: CreatePrivateDriveParams): Promise<EstimateCreateDriveParams> {
	return {
		rootFolderMetaDataPrototype: await getPrivateFolderEstimationPrototype(driveName),
		driveMetaDataPrototype: new ArFSPrivateDriveMetaDataPrototype(
			fakeEntityId,
			await ArFSPrivateDriveTransactionData.from(driveName, fakeEntityId, await getFakeDriveKey())
		)
	};
}

/**
 * Constructs a fake public file metadata prototype from stubbed
 * entity IDs and stubbed tx IDs for estimation and planning purposes
 */
export function getPublicUploadFileEstimationPrototype(wrappedFile: ArFSDataToUpload): ArFSPublicFileMetaDataPrototype {
	return ArFSPublicFileMetaDataPrototype.fromFile({
		wrappedFile,
		dataTxId: fakeTxID,
		driveId: fakeEntityId,
		fileId: fakeEntityId,
		parentFolderId: fakeEntityId
	});
}

/**
 * Constructs a fake private file metadata prototype from stubbed entity IDs,
 * stubbed tx IDs, and a stubbed drive key for estimation and planning purposes
 */
export async function getPrivateUploadFileEstimationPrototype(
	wrappedFile: ArFSDataToUpload
): Promise<ArFSPrivateFileMetaDataPrototype> {
	return ArFSPrivateFileMetaDataPrototype.fromFile({
		dataTxId: fakeTxID,
		driveId: fakeEntityId,
		fileId: fakeEntityId,
		parentFolderId: fakeEntityId,
		wrappedFile,
		driveKey: await getFakeDriveKey()
	});
}

/**
 * Derives the file data size as a byteCount and constructs a fake
 * file metadata prototype from stubbed entity IDs, stubbed tx IDs,
 * and a stubbed drive key for estimation and planning purposes
 *
 * @remarks Uses required isPrivate boolean to determine whether
 * 	the returned prototype is public or private and whether
 * 	to calculate the size as encrypted or not
 */
export async function getFileEstimationInfo(
	wrappedFile: ArFSDataToUpload,
	isPrivate: boolean
): Promise<{ fileMetaDataPrototype: ArFSFileMetaDataPrototype; fileDataByteCount: ByteCount }> {
	const fileMetaDataPrototype = isPrivate
		? await getPrivateUploadFileEstimationPrototype(wrappedFile)
		: getPublicUploadFileEstimationPrototype(wrappedFile);

	const fileDataByteCount = isPrivate ? encryptedDataSize(wrappedFile.size) : wrappedFile.size;

	return { fileMetaDataPrototype, fileDataByteCount };
}

/**
 * Constructs a fake folder metadata prototype from stubbed entity IDs
 * and a stubbed drive key for estimation and planning purposes
 *
 * @remarks Uses required isPrivate boolean to determine whether
 * 	the returned prototype is public or private
 */
export async function getFolderEstimationInfo(
	wrappedFolder: ArFSFolderToUpload,
	isPrivate: boolean
): Promise<{ folderMetaDataPrototype: ArFSFolderMetaDataPrototype }> {
	const folderMetaDataPrototype = isPrivate
		? await getPrivateFolderEstimationPrototype(wrappedFolder.destinationBaseName, wrappedFolder.customMetaData)
		: getPublicFolderEstimationPrototype(wrappedFolder.destinationBaseName, wrappedFolder.customMetaData);

	return { folderMetaDataPrototype };
}
