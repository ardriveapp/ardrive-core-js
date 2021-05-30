import * as arfsTpes from '../types/arfs_Types';
import { EntityQuery } from './EntityQuery';

const entityType = 'file';

export const getPrivateFileEntity = getFileEntity.bind(this, 'private');

export const getPublicFileEntity = getFileEntity.bind(this, 'public');

export const getPrivateFileEntities = getFilesEntities.bind(this, 'private');

export const getPublicFileEntities = getFilesEntities.bind(this, 'public');

async function getFileEntity(
	privacy: 'private' | 'public',
	owner: string,
	fileId: string
): Promise<arfsTpes.ArFSDriveEntity> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({
		entityType,
		owner,
		entityId: fileId,
		privacy
	});
	const entity = await query.get();
	const entityInstance = new arfsTpes.ArFSDriveEntity(entity[0]);
	return entityInstance;
}

async function getFilesEntities(
	privacy: 'private' | 'public',
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTpes.ArFSDriveEntity> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({
		entityType,
		owner,
		driveId,
		lastBlockHeight,
		privacy
	});
	query.parameters.push('pageInfo.hasNextPage', 'edges.cursor');
	const entity = await query.get();
	const entityInstance = new arfsTpes.ArFSDriveEntity(entity[0]);
	return entityInstance;
}
