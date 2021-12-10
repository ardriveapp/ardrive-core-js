import {
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPrivateDriveTransactionData,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveMetaDataPrototype,
	ArFSPublicDriveTransactionData,
	ArFSPublicFolderMetaDataPrototype,
	ArFSPublicFolderTransactionData,
	CreatePrivateDriveParams,
	CreatePublicDriveParams
} from '../exports';
import { EstimateCreateDriveParams } from '../types/cost_estimator_types';
import { fakeEntityId } from '../utils/constants';

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
