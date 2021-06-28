import { expect } from 'chai';
import {
	ArFSPublicFileFolderEntity,
	ArFSPrivateFileFolderEntity,
	ArFSPrivateDriveEntity,
	ArFSPublicDriveEntity,
	ArFSDriveEntity,
	IEntity,
	ArFSEntity,
	ArFSFileFolderEntity,
	IPublicFileFolderEntity,
	IPrivateFileFolderEntity
} from './arfs_Types';
import { Instantiable, InstantiableEntity } from './type_conditionals';
import {
	cipherTypeValues,
	contentTypeValues,
	driveAuthModeValues,
	drivePrivacyValues,
	driveSharingValues,
	entityTypeValues,
	PrivateType,
	PublicType,
	syncStatusValues,
	yesNoIntegerValues
} from './type_guards';
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

const ALL_ENTITY_CLASSES = [
	ArFSPrivateDriveEntity,
	ArFSPublicDriveEntity,
	ArFSPrivateFileFolderEntity,
	ArFSPublicFileFolderEntity
];

const EMPTY_ENTITIES = [
	// the non generic exports
	new ArFSPrivateDriveEntity(),
	new ArFSPublicDriveEntity(),
	new ArFSPrivateFileFolderEntity(),
	new ArFSPublicFileFolderEntity()
];

function instanceOfChecking<T extends IEntity>(
	theBaseClass: InstantiableEntity<T>,
	entityClass: InstantiableEntity<T>
): void {
	it(`Check ${entityClass.name} is instance of ${theBaseClass.name}`, () => {
		const instance = new entityClass();
		expect(instance).to.be.instanceOf(theBaseClass);
	});
}

const checkInstantiation = function <T extends IEntity>(entityClass: InstantiableEntity<T>): void {
	it(`Instantiate empty ${entityClass.name}`, () => {
		const instance = new entityClass();
		expect(instance.appName).to.equal('');
	});
	it(`Instantiate partial ${entityClass.name}`, () => {
		const appName = 'ArDrive Core Test';
		const instance = new entityClass({ appName } as T);
		expect(instance.appName).to.equal(appName);
	});
};

function assertNumberPropertiesType(entityTemplate: IEntity, entityClass: InstantiableEntity): void {
	describe(`Check properties of ${entityClass.name}`, () => {
		const numericProperties = Object.keys(entityTemplate).filter((key) => typeof entityTemplate[key] === 'number');
		const numberToStringMap = numericProperties.map((prop) => `${entityTemplate[prop]}`);
		const theBrokenTemplate: IEntity = numericProperties.reduce((accumulator, propertyName, index) => {
			return Object.assign(accumulator, { [propertyName]: numberToStringMap[index] });
		}, {});
		let entity: IEntity;
		before(() => {
			entity = new entityClass(theBrokenTemplate);
		});
		numericProperties.forEach((propertyName) =>
			it(`Property ${propertyName} preserves its numeric type`, () => {
				// if (propertyName === 'lastModifiedDate') debugger;
				expect(typeof entity[propertyName]).to.equal('number');
			})
		);
	});
}

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

describe('ArFSEntity classes', () => {
	describe('All entities are defined', () => {
		ALL_ENTITY_CLASSES.forEach((entityClass) => {
			it(`${entityClass.name} is defined`, () => {
				expect(entityClass).not.to.equal(undefined);
			});
		});
	});

	describe('Instantiation', () => {
		checkInstantiation(ArFSPublicDriveEntity);
		checkInstantiation(ArFSPrivateDriveEntity);
		checkInstantiation(ArFSPublicFileFolderEntity);
		checkInstantiation(ArFSPrivateFileFolderEntity);
	});

	describe('InstanceOf checking', () => {
		instanceOfChecking(ArFSDriveEntity as { new (): ArFSDriveEntity<PublicType> }, ArFSPublicDriveEntity);
		instanceOfChecking(ArFSDriveEntity as { new (): ArFSDriveEntity<PrivateType> }, ArFSPrivateDriveEntity);
		instanceOfChecking(
			ArFSFileFolderEntity as Instantiable<ArFSFileFolderEntity<PublicType>, IPublicFileFolderEntity>,
			ArFSPublicFileFolderEntity
		);
		instanceOfChecking(
			ArFSFileFolderEntity as Instantiable<ArFSFileFolderEntity<PrivateType>, IPrivateFileFolderEntity>,
			ArFSPrivateFileFolderEntity
		);
	});

	describe('Property numeric type checking', () => {
		EMPTY_ENTITIES.forEach((e) =>
			assertNumberPropertiesType(
				e,
				e.constructor as { new <T extends IEntity>(args?: T | undefined): ArFSEntity<T> }
			)
		);
	});

	describe('Immutable properties', () => {
		EMPTY_ENTITIES.forEach((entity) => {
			const currentPrivacy = entity.drivePrivacy;
			const wrongPrivacy = currentPrivacy === 'private' ? 'public' : 'private';
			it(`Immutable drivePrivacy on ${entity.constructor.name}`, () => {
				// entity.drivePrivacy = wrongPrivacy;
				const temporalEntity = new (entity.constructor as {
					new <T extends IEntity>(args?: T | undefined): ArFSEntity<T>;
				})({ drivePrivacy: wrongPrivacy });
				expect(temporalEntity.drivePrivacy).to.equal(currentPrivacy);
			});
		});
	});
});
