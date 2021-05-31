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
import { drivePrivacy } from './type_guards';

export type PrivacyToDriveEntity<P extends drivePrivacy> = ArFSDriveEntity<
	P extends drivePrivacy.PRIVATE ? ArFSPrivateDriveEntity : ArFSPublicDriveEntity
>;

export type PrivacyToFileFolderEntity<P extends drivePrivacy> = ArFSFileFolderEntity<
	P extends drivePrivacy.PRIVATE ? ArFSPrivateFileFolderEntity : ArFSPublicFileFolderEntity
>;

export type PrivacyToData<P extends drivePrivacy> = P extends drivePrivacy.PRIVATE
	? ArFSPrivateFileData
	: ArFSPublicFileData;
