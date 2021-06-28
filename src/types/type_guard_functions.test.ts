import {
	isCorrectCipherType,
	isCorrectContentType,
	isCorrectDriveAuthMode,
	isCorrectDrivePrivacy,
	isCorrectDriveSharing,
	isCorrectEntityType,
	isCorrectSyncStatus,
	isCorrectYesNoInteger
} from './type_guard_functions';
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
import { expect } from 'chai';

function isCorrectCheck<T>(typeName: string, value: unknown, checker: (v: unknown) => v is T): void {
	const aWrongValue = 'This is a wong value for any guarded type';
	it(`Correct ${typeName} type`, () => {
		expect(checker(value)).to.be.true;
	});
	it(`Wrong ${typeName} value returns false`, () => {
		expect(checker(aWrongValue)).to.be.false;
	});
}

describe('Type guard functions', () => {
	isCorrectCheck('CipherType', cipherTypeValues.AES_256_GCM, isCorrectCipherType);
	isCorrectCheck('EntityType', entityTypeValues.DRIVE, isCorrectEntityType);
	isCorrectCheck('ContentType', contentTypeValues.APPLICATION_JSON, isCorrectContentType);
	isCorrectCheck('DrivePrivacy', drivePrivacyValues.PRIVATE, isCorrectDrivePrivacy);
	isCorrectCheck('DriveAuthMode', driveAuthModeValues.PASSWORD, isCorrectDriveAuthMode);
	isCorrectCheck('DriveSharing', driveSharingValues.PERSONAL, isCorrectDriveSharing);
	isCorrectCheck('SyncStatus', syncStatusValues.READY_TO_UPLOAD, isCorrectSyncStatus);
	isCorrectCheck('YesNoInteger', yesNoIntegerValues.YES, isCorrectYesNoInteger);
});
