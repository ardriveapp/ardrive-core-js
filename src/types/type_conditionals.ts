import {
	ArFSDriveEntity,
	ArFSFileFolderEntity,
	ArFSPrivateDriveEntity,
	ArFSPrivateFileData,
	ArFSPrivateFileFolderEntity,
	ArFSPublicDriveEntity,
	ArFSPublicFileData,
	ArFSPublicFileFolderEntity
} from './arfs_Types';
import { DrivePrivacy, PrivateType } from './type_guards';

export type PrivacyToDriveEntity<P extends DrivePrivacy> = ArFSDriveEntity<
	P extends PrivateType ? ArFSPrivateDriveEntity : ArFSPublicDriveEntity
>;

export type PrivacyToFileFolderEntity<P extends DrivePrivacy> = ArFSFileFolderEntity<
	P extends PrivateType ? ArFSPrivateFileFolderEntity : ArFSPublicFileFolderEntity
>;

export type PrivacyToData<P extends DrivePrivacy> = P extends PrivateType ? ArFSPrivateFileData : ArFSPublicFileData;

export type UnionOfObjectPropertiesType<T extends { [key: string]: string | number }> = T[keyof T];
