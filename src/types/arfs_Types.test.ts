import { expect } from 'chai';
import {
	ArFSPublicFileFolderEntity,
	ArFSPrivateFileFolderEntity,
	ArFSPrivateDriveEntity,
	ArFSPublicDriveEntity,
	ArFSDriveEntity,
	IEntity,
	ArFSEntity,
	ArFSFileFolderEntity
} from './arfs_Types';
import { assertNumberPropertiesType, checkInstantiationDefaults, instanceOfChecking } from './common.test';
import { Instantiable } from './type_conditionals';
import { PrivateType, PublicType } from './type_guards';

// const ALL_ENTITY_CLASSES = [
// 	ArFSPrivateDriveEntity,
// 	ArFSPublicDriveEntity,
// 	ArFSPrivateFileFolderEntity,
// 	ArFSPublicFileFolderEntity
// ];

const EMPTY_ENTITIES = [
	// the non generic exports
	new ArFSPrivateDriveEntity(),
	new ArFSPublicDriveEntity(),
	new ArFSPrivateFileFolderEntity(),
	new ArFSPublicFileFolderEntity()
];

describe('ArFSEntity classes', () => {
	describe('Instantiation', () => {
		const template = { appName: 'Test app name' };
		checkInstantiationDefaults(ArFSPublicDriveEntity, template);
		checkInstantiationDefaults(ArFSPrivateDriveEntity, template);
		checkInstantiationDefaults(ArFSPublicFileFolderEntity, template);
		checkInstantiationDefaults(ArFSPrivateFileFolderEntity, template);
	});

	describe('InstanceOf checking', () => {
		instanceOfChecking(ArFSDriveEntity as { new (): ArFSDriveEntity<PublicType> }, ArFSPublicDriveEntity);
		instanceOfChecking(ArFSDriveEntity as { new (): ArFSDriveEntity<PrivateType> }, ArFSPrivateDriveEntity);
		instanceOfChecking(
			ArFSFileFolderEntity as Instantiable<ArFSFileFolderEntity<PublicType>>,
			ArFSPublicFileFolderEntity
		);
		instanceOfChecking(
			ArFSFileFolderEntity as Instantiable<ArFSFileFolderEntity<PrivateType>>,
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
