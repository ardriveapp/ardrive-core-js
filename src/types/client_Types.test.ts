import {
	ArFSLocalDriveEntity,
	ArFSLocalMetaData,
	ArFSLocalPrivateDriveEntity,
	ArFSLocalPrivateFile,
	ArFSLocalPrivateFolder,
	ArFSLocalPublicDriveEntity,
	ArFSLocalPublicFile,
	ArFSLocalPublicFolder
} from './client_Types';
import { assertNumberPropertiesType, checkInstantiationDefaults, instanceOfChecking } from './common.test';
import { Instantiable } from './type_conditionals';
import { PrivateType, PublicType } from './type_guards';

const LOCAL_DRIVE_TYPES = [ArFSLocalPublicDriveEntity, ArFSLocalPrivateDriveEntity] as const;

const PUBLIC_META_DATA_FILES = [ArFSLocalPublicFile, ArFSLocalPublicFolder] as const;

const PRIVATE_META_DATA_FILES = [ArFSLocalPrivateFile, ArFSLocalPrivateFolder] as const;

const META_DATA_TYPES = [...PUBLIC_META_DATA_FILES, ...PRIVATE_META_DATA_FILES];

const ALL_TYPES = <Instantiable<{ id: number }>[]>[...META_DATA_TYPES, ...LOCAL_DRIVE_TYPES];

describe('Client type classes', () => {
	describe('Instantiation', () => {
		ALL_TYPES.forEach((type) => checkInstantiationDefaults(type, { id: 100 }));
	});

	describe('InstanceOf checking', () => {
		instanceOfChecking(
			<Instantiable<ArFSLocalDriveEntity<PublicType>>>ArFSLocalDriveEntity,
			ArFSLocalPublicDriveEntity
		);
		instanceOfChecking(
			<Instantiable<ArFSLocalDriveEntity<PrivateType>>>ArFSLocalDriveEntity,
			ArFSLocalPrivateDriveEntity
		);
		PRIVATE_META_DATA_FILES.forEach((type) =>
			instanceOfChecking(<Instantiable<ArFSLocalMetaData<PrivateType>>>ArFSLocalMetaData, type)
		);
		PUBLIC_META_DATA_FILES.forEach((type) =>
			instanceOfChecking(<Instantiable<ArFSLocalMetaData<PublicType>>>ArFSLocalMetaData, type)
		);
	});

	describe('Property numeric type checking', () => {
		assertNumberPropertiesType(
			new ArFSLocalPublicDriveEntity(),
			<Instantiable<ArFSLocalDriveEntity<PublicType>>>ArFSLocalDriveEntity
		);
		assertNumberPropertiesType(
			new ArFSLocalPrivateDriveEntity(),
			<Instantiable<ArFSLocalDriveEntity<PrivateType>>>ArFSLocalDriveEntity
		);
		PRIVATE_META_DATA_FILES.forEach((type) =>
			assertNumberPropertiesType(new type(), <Instantiable<ArFSLocalMetaData<PrivateType>>>ArFSLocalMetaData)
		);
		PUBLIC_META_DATA_FILES.forEach((type) =>
			assertNumberPropertiesType(new type(), <Instantiable<ArFSLocalMetaData<PublicType>>>ArFSLocalMetaData)
		);
	});
});
