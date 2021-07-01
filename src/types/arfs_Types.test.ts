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
import { contentTypeValues, PrivateType, PublicType } from './type_guards';

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
		assertNumberPropertiesType(new ArFSPublicDriveEntity(), ArFSPublicDriveEntity);
		assertNumberPropertiesType(new ArFSPrivateDriveEntity(), ArFSPrivateDriveEntity);
		assertNumberPropertiesType(new ArFSPublicFileFolderEntity(), ArFSPublicFileFolderEntity);
		assertNumberPropertiesType(new ArFSPrivateFileFolderEntity(), ArFSPrivateFileFolderEntity);
	});

	describe('Immutable properties', () => {
		EMPTY_ENTITIES.forEach((entity) => {
			const currentContentType = entity.contentType;
			const wrongContentType =
				currentContentType === contentTypeValues.APPLICATION_JSON
					? contentTypeValues.APPLICATION_OCTET_STREAM
					: contentTypeValues.APPLICATION_JSON;
			it(`Immutable drivePrivacy on ${entity.constructor.name}`, () => {
				const temporalEntity = new (entity.constructor as {
					new <T extends IEntity>(args?: T | undefined): ArFSEntity<T>;
				})({ contentType: wrongContentType });
				expect(temporalEntity.contentType).to.equal(currentContentType);
			});
		});
	});
});
