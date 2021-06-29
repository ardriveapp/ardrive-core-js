import {
	CipherType,
	cipherTypeValues,
	ContentType,
	contentTypeValues,
	DriveAuthMode,
	driveAuthModeValues,
	DrivePrivacy,
	drivePrivacyValues,
	DriveSharing,
	driveSharingValues,
	EntityType,
	entityTypeValues,
	SyncStatus,
	syncStatusValues,
	YesNoInteger,
	yesNoIntegerValues
} from './type_guards';

export const isCorrectCipherType = (value: unknown): value is CipherType =>
	isCorrectValue<CipherType>(cipherTypeValues, value);
export const isCorrectEntityType = (value: unknown): value is EntityType =>
	isCorrectValue<EntityType>(entityTypeValues, value);
export const isCorrectContentType = (value: unknown): value is ContentType =>
	isCorrectValue<ContentType>(contentTypeValues, value);
export const isCorrectDrivePrivacy = (value: unknown): value is DrivePrivacy =>
	isCorrectValue<DrivePrivacy>(drivePrivacyValues, value);
export const isCorrectDriveAuthMode = (value: unknown): value is DriveAuthMode =>
	isCorrectValue<DriveAuthMode>(driveAuthModeValues, value);
export const isCorrectDriveSharing = (value: unknown): value is DriveSharing =>
	isCorrectValue<DriveSharing>(driveSharingValues, value);
export const isCorrectSyncStatus = (value: unknown): value is SyncStatus =>
	isCorrectValue<SyncStatus>(syncStatusValues, value);
export const isCorrectYesNoInteger = (value: unknown): value is YesNoInteger =>
	isCorrectValue<YesNoInteger>(yesNoIntegerValues, value);

function isCorrectValue<T extends string | number>(o: { [key: string]: T }, v: unknown): v is T {
	const isCorrect = Object.values(o).includes(v as T);
	return isCorrect;
}
