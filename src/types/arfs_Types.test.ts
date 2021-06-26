import { expect } from 'chai';
import * as arfsTypes from './arfs_Types';
import { InstantiableEntity } from './type_conditionals';

const DRIVE_ENTITY_CLASSES: InstantiableEntity[] = [
	arfsTypes.ArFSDriveEntity,
	arfsTypes.ArFSPrivateDriveEntity,
	arfsTypes.ArFSPublicDriveEntity
];

// The casting here is made to avoid the compiler complaining for ArFSFileFolderEntity not allowing 'drive' on its entityType
const FILE_FOLDER_ENTITY_CLASSES: InstantiableEntity<arfsTypes.IFileFolderEntity>[] = [
	arfsTypes.ArFSFileFolderEntity,
	arfsTypes.ArFSPrivateFileFolderEntity,
	arfsTypes.ArFSPublicFileFolderEntity
];

const ALL_ENTITY_CLASSES = [...DRIVE_ENTITY_CLASSES, ...FILE_FOLDER_ENTITY_CLASSES];

const EMPTY_ENTITIES = [
	// the non generic exports
	new arfsTypes.ArFSPrivateDriveEntity(),
	new arfsTypes.ArFSPublicDriveEntity(),
	new arfsTypes.ArFSPrivateFileFolderEntity(),
	new arfsTypes.ArFSPublicFileFolderEntity()
];

function checkInstanceHierarchy<T extends arfsTypes.IEntity>(classes: InstantiableEntity<T>[]): void {
	const theBaseClass = classes[0];
	const derivatedClasses = classes.slice(1);
	derivatedClasses.forEach((entityClass) => {
		it(`Check instance hierarchy of ${entityClass.name}`, () => {
			const instance = new entityClass({} as T);
			expect(instance).to.be.instanceOf(theBaseClass);
		});
	});
}

const checkInstantiation = function <T extends InstantiableEntity>(entityClass: T): void {
	it(`Instantiate empty ${entityClass.name}`, () => {
		const instance = new entityClass({});
		expect(instance.appName).to.equal('');
	});
	it(`Instantiate partial ${entityClass.name}`, () => {
		const appName = 'ArDrive Core Test';
		const instance = new entityClass({ appName });
		expect(instance.appName).to.equal(appName);
	});
};

function assertNumberPropertiesType(entityTemplate: arfsTypes.IEntity, entityClass: InstantiableEntity): void {
	describe(`Check properties of ${entityClass.name}`, () => {
		const numericProperties = Object.keys(entityTemplate).filter((key) => typeof entityTemplate[key] === 'number');
		numericProperties.forEach((propertyName) =>
			it(`Property ${propertyName} preserves its numeric type`, () => {
				const numberToStringMap = numericProperties.map((prop) => `${entityTemplate[prop]}`);
				const theBrokenTemplate: arfsTypes.IEntity = numericProperties.reduce(
					(accumulator, propertyName, index) => {
						return Object.assign(accumulator, { [propertyName]: numberToStringMap[index] });
					},
					{}
				);
				const entity = new entityClass(theBrokenTemplate);
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
		DRIVE_ENTITY_CLASSES.forEach(checkInstantiation);
	});

	describe('InstanceOf checking', () => {
		checkInstanceHierarchy(DRIVE_ENTITY_CLASSES);
		checkInstanceHierarchy<arfsTypes.IFileFolderEntity>(FILE_FOLDER_ENTITY_CLASSES);
	});

	describe('Property numeric type checking', () => {
		EMPTY_ENTITIES.forEach((e) =>
			assertNumberPropertiesType(
				e,
				e.constructor as { new <T extends arfsTypes.IEntity>(args?: T | undefined): arfsTypes.ArFSEntity<T> }
			)
		);
	});
});
