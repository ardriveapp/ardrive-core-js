import { ArDriveUser, ArFSRootFolderMetaData, ArFSDriveMetaData, ArFSFileMetaData } from './base_Types';
import { assertNumberPropertiesType, checkInstantiationDefaults } from './common.test';
import { Instantiable } from './type_conditionals';

const ALL_TYPES = <Instantiable<{ [key: string]: unknown }>[]>[
	ArDriveUser,
	ArFSRootFolderMetaData,
	ArFSDriveMetaData,
	ArFSFileMetaData
];

describe('Base type classes', () => {
	describe('Instantiation', () => {
		checkInstantiationDefaults(ArDriveUser, { login: 'test' });
		checkInstantiationDefaults(ArFSRootFolderMetaData, { metaDataTxId: '123' });
		checkInstantiationDefaults(ArFSDriveMetaData, { id: 3000 });
		checkInstantiationDefaults(ArFSFileMetaData, { login: 'test' });
	});

	describe('Property numeric type checking', () => {
		ALL_TYPES.forEach((type) => assertNumberPropertiesType(new type(), type));
	});
});
