import {
	ArFSDriveEntity,
	ArFSEntity,
	ArFSFileFolderEntity,
	ArFSPrivateDriveEntity,
	ArFSPrivateFileData,
	ArFSPrivateFileFolderEntity,
	ArFSPublicDriveEntity,
	ArFSPublicFileData,
	ArFSPublicFileFolderEntity,
	IEntity
} from './arfs_Types';
import { DrivePrivacy, PrivateType } from './type_guards';

export type Instantiable<T, A> = {
	new (a?: A): T;
};

export type InstantiableEntity<T extends IEntity = IEntity> = Instantiable<ArFSEntity<T>, T>;

export type PrivacyToDriveEntity<P extends DrivePrivacy> = ArFSDriveEntity<
	P extends PrivateType ? ArFSPrivateDriveEntity : ArFSPublicDriveEntity
>;

export type PrivacyToFileFolderEntity<P extends DrivePrivacy> = ArFSFileFolderEntity<
	P extends PrivateType ? ArFSPrivateFileFolderEntity : ArFSPublicFileFolderEntity
>;

export type PrivacyToData<P extends DrivePrivacy> = P extends PrivateType ? ArFSPrivateFileData : ArFSPublicFileData;

export type UnionOfObjectPropertiesType<T extends { [key: string]: string | number }> = T[keyof T];
