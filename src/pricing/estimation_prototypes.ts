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
	deriveDriveKey,
	DriveKey,
	JWKWallet,
	readJWKFile
} from '../exports';
import { EstimateCreateDriveParams } from '../types/upload_planner_types';
import { fakeEntityId, fakeTxID } from '../utils/constants';

export const getFakeDriveKey = async (): Promise<DriveKey> => {
	return deriveDriveKey(
		'stubPassword',
		`${fakeEntityId}`,
		JSON.stringify((readJWKFile('./test_wallet.json') as JWKWallet).getPrivateKey())
	);
};

export async function getPrivateFolderEstimationPrototype(
	folderName: string
): Promise<ArFSPrivateFolderMetaDataPrototype> {
	return new ArFSPrivateFolderMetaDataPrototype(
		fakeEntityId,
		fakeEntityId,
		await ArFSPrivateFolderTransactionData.from(folderName, await getFakeDriveKey())
	);
}

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

export function getPublicFolderEstimationPrototype(folderName: string): ArFSPublicFolderMetaDataPrototype {
	return new ArFSPublicFolderMetaDataPrototype(
		new ArFSPublicFolderTransactionData(folderName),
		fakeEntityId,
		fakeEntityId
	);
}

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

export function getPublicUploadFileEstimationPrototype(
	wrappedFile: ArFSEntityToUpload
): ArFSPublicFileMetaDataPrototype {
	const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

	return new ArFSPublicFileMetaDataPrototype(
		new ArFSPublicFileMetadataTransactionData(
			wrappedFile.destinationBaseName,
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
	wrappedFile: ArFSEntityToUpload
): Promise<ArFSPrivateFileMetaDataPrototype> {
	const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

	return new ArFSPrivateFileMetaDataPrototype(
		await ArFSPrivateFileMetadataTransactionData.from(
			wrappedFile.destinationBaseName,
			fileSize,
			lastModifiedDateMS,
			fakeTxID,
			dataContentType,
			fakeEntityId,
			await getFakeDriveKey()
		),
		fakeEntityId,
		fakeEntityId,
		fakeEntityId
	);
}
