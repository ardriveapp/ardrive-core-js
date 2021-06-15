import {
	cipherTypeValues,
	contentTypeValues,
	driveAuthModeValues,
	drivePrivacyValues,
	driveSharingValues,
	entityTypeValues,
	syncStatusValues,
	yesNoIntegerValues
} from './type_guards';

export const isCorrectCipherType = isCorrectValueFactory.bind(this, cipherTypeValues);
export const isCorrectEntityType = isCorrectValueFactory.bind(this, entityTypeValues);
export const isCorrectContentType = isCorrectValueFactory.bind(this, contentTypeValues);
export const isCorrectDrivePrivacy = isCorrectValueFactory.bind(this, drivePrivacyValues);
export const isCorrectDriveAuthMode = isCorrectValueFactory.bind(this, driveAuthModeValues);
export const isCorrectDriveSharing = isCorrectValueFactory.bind(this, driveSharingValues);
export const isCorrectSyncStatus = isCorrectValueFactory.bind(this, syncStatusValues);
export const isCorrectYesNoInteger = isCorrectValueFactory.bind(this, yesNoIntegerValues);

function isCorrectValueFactory<T>(o: { [key: string]: T }, v: unknown): boolean {
	const isCorrect = Object.values(o).includes(v as T);
	return isCorrect;
}
