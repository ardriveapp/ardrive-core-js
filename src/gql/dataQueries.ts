import { ArFSFileData, IFileData } from '../types/arfs_Types';
import { PrivacyToData } from '../types/type_conditionals';
import { drivePrivacy } from '../types/type_guards';
import { Query, NODE_ID_AND_TAGS_PARAMETERS } from './Query';

export const getPublicFileEntity = getPrivateFileEntityFactory<drivePrivacy.PRIVATE>();

export const getPrivateFileEntity = getPrivateFileEntityFactory<drivePrivacy.PUBLIC>();

function getPrivateFileEntityFactory<P extends drivePrivacy>(): (txId: string) => Promise<PrivacyToData<P>> {
	return function (txId: string) {
		return getFileData<P>(txId);
	};
}

async function getFileData<P extends drivePrivacy>(txId: string): Promise<PrivacyToData<P>> {
	const query = new Query();
	query.ids = [txId];
	query.parameters = NODE_ID_AND_TAGS_PARAMETERS;
	const entities = await query.getAll<IFileData>();
	const entityInstance = new ArFSFileData<P>(entities[0]) as PrivacyToData<P>;
	return entityInstance;
}
