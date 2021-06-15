import { UnionOfObjectPropertiesType } from './type_conditionals';

export const cipherTypeValues = {
	AES_GCM_256: 'aes-gcm-256',
	AES_256_GCM: 'AES256-GCM'
} as const;
export const entityTypeValues = {
	DRIVE: 'drive',
	FILE: 'file',
	FOLDER: 'folder'
} as const;
export const contentTypeValues = {
	APPLICATION_JSON: 'application/json',
	APPLICATION_OCTET_STREAM: 'application/octet-stream'
} as const;
export const drivePrivacyValues = {
	PRIVATE: 'private',
	PUBLIC: 'public'
} as const;
export const driveAuthModeValues = {
	PASSWORD: 'password'
} as const;
export const driveSharingValues = {
	SHARED: 'shared',
	PERSONAL: 'personal'
} as const;
export const syncStatusValues = {
	READY_TO_DOWNLOAD: 0,
	READY_TO_UPLOAD: 1,
	GETTING_MINED: 2,
	SUCCESSFULLY_UPLOADED: 3
} as const;
export const yesNoIntegerValues = {
	NO: 0,
	YES: 1
} as const;

export type CipherType = UnionOfObjectPropertiesType<typeof cipherTypeValues>;
export type EntityType = UnionOfObjectPropertiesType<typeof entityTypeValues>;
export type ContentType = UnionOfObjectPropertiesType<typeof contentTypeValues>;
export type DrivePrivacy = UnionOfObjectPropertiesType<typeof drivePrivacyValues>;
export type DriveAuthMode = UnionOfObjectPropertiesType<typeof driveAuthModeValues>;
export type DriveSharing = UnionOfObjectPropertiesType<typeof driveSharingValues>;
export type SyncStatus = UnionOfObjectPropertiesType<typeof syncStatusValues>;
export type YesNoInteger = UnionOfObjectPropertiesType<typeof yesNoIntegerValues>;
