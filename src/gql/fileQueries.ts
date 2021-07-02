import { ArFSFileFolderEntity, IFileFolderEntity } from '../types/arfs_Types';
import { PrivacyToFileFolderEntity } from '../types/type_conditionals';
import { DrivePrivacy, drivePrivacyValues, entityTypeValues } from '../types/type_guards';
import { EntityQuery } from './EntityQuery';

const entityType = entityTypeValues.FILE;

export const getPrivateFileEntity = getFileEntity.bind(this, drivePrivacyValues.PRIVATE);

export const getPublicFileEntity = getFileEntity.bind(this, drivePrivacyValues.PUBLIC);

export const getAllPrivateFileEntities = getFilesEntities.bind(this, drivePrivacyValues.PRIVATE);

export const getAllPublicFileEntities = getFilesEntities.bind(this, drivePrivacyValues.PUBLIC);

async function getFileEntity<P extends DrivePrivacy>(
	privacy: P,
	owner: string,
	fileId: string
): Promise<PrivacyToFileFolderEntity<P>> {
	const query = new EntityQuery<IFileFolderEntity>({
		entityType,
		owner,
		entityId: fileId,
		privacy
	});
	const entity = await query.get();
	const entityInstance = new ArFSFileFolderEntity(entity[0]);
	return entityInstance;
}

async function getFilesEntities<P extends DrivePrivacy>(
	privacy: P,
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<PrivacyToFileFolderEntity<P>[]> {
	const query = new EntityQuery<IFileFolderEntity>({
		entityType,
		owner,
		driveId,
		lastBlockHeight,
		privacy
	});
	query.parameters.push('pageInfo.hasNextPage', 'edges.cursor');
	const result = await query.get();
	const entityInstances = result.map((entity) => new ArFSFileFolderEntity(entity));
	return entityInstances;
}
