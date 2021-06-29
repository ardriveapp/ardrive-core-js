import {
	ArFSDriveEntity,
	ArFSEntity,
	ArFSFileFolderEntity,
	ArFSPrivateFileData,
	ArFSPublicFileData,
	IEntity
} from './arfs_Types';
import { DrivePrivacy, JSONContentType, OctetStreamContentType, PrivateType } from './type_guards';

export type Instantiable<T> = {
	new (a?: Partial<T>): T;
};

export type InstantiableEntity<T extends IEntity = IEntity> = Instantiable<ArFSEntity<T>>;

export type PrivacyToDriveEntity<P extends DrivePrivacy> = ArFSDriveEntity<P>;

export type PrivacyToFileFolderEntity<P extends DrivePrivacy> = ArFSFileFolderEntity<P>;

export type PrivacyToData<P extends DrivePrivacy> = P extends PrivateType ? ArFSPrivateFileData : ArFSPublicFileData;

export type PrivacyOfEntity<T extends { drivePrivacy?: DrivePrivacy }> = T['drivePrivacy'];

export type PrivacyToContentType<P extends DrivePrivacy> = P extends PrivateType
	? OctetStreamContentType
	: JSONContentType;

export type TypeIfPrivateOrNever<T, P extends DrivePrivacy> = P extends PrivateType ? T : never;

export type UnionOfObjectPropertiesType<T extends { [key: string]: string | number }> = T[keyof T];
