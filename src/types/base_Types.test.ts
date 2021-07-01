import { ArDriveUser, ArFSRootFolderMetaData, ArFSDriveMetaData, ArFSFileMetaData } from './base_Types';
import { assertNumberPropertiesType, checkInstantiationDefaults } from './common.test';

describe('Base type classes', () => {
	describe('Instantiation', () => {
		checkInstantiationDefaults(ArDriveUser, { login: 'test' });
		checkInstantiationDefaults(ArFSRootFolderMetaData, { metaDataTxId: '123' });
		checkInstantiationDefaults(ArFSDriveMetaData, { id: 3000 });
		checkInstantiationDefaults(ArFSFileMetaData, { login: 'test' });
	});

	describe('Property numeric type checking', () => {
		assertNumberPropertiesType(new ArDriveUser(), ArDriveUser);
		assertNumberPropertiesType(new ArFSRootFolderMetaData(), ArFSRootFolderMetaData);
		assertNumberPropertiesType(new ArFSDriveMetaData(), ArFSDriveMetaData);
		assertNumberPropertiesType(new ArFSFileMetaData(), ArFSFileMetaData);
	});
});
