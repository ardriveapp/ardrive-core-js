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
import { PrivateType, PublicType } from './type_guards';
// import { DrivePrivacy } from './type_guards';

const DRIVE_ENTITY_CLASSES = [
	// arfsTypes.ArFSDriveEntity,
	ArFSPrivateDriveEntity,
	ArFSPublicDriveEntity
];

// The casting here is made to avoid the compiler complaining for ArFSFileFolderEntity not allowing 'drive' on its entityType
const FILE_FOLDER_ENTITY_CLASSES = [
	// arfsTypes.ArFSFileFolderEntity,
	ArFSPrivateFileFolderEntity,
	ArFSPublicFileFolderEntity
];

const ALL_ENTITY_CLASSES = [...DRIVE_ENTITY_CLASSES, ...FILE_FOLDER_ENTITY_CLASSES];

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
