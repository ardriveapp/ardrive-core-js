import * as arfsTpes from '../types/arfs_Types';
import { EntityQuery } from './EntityQuery';

const entityType = 'drive';

export const getPrivateDriveEntity = getDriveEntity.bind(this, 'private');

export const getPublicDriveEntity = getDriveEntity.bind(this, 'public');

export const getAllPublicDriveEntities = getAllDriveEntities.bind(this, 'public');

export const getAllPrivateDriveEntities = getAllDriveEntities.bind(this, 'private');

async function getDriveEntity(privacy: 'private' | 'public', driveId: string) {
	const query = new EntityQuery({
		entityType,
		entityId: driveId,
		privacy
	});
	const drive = (await query.get())[0];
	return drive;
}

async function getAllDriveEntities(
	privacy: 'private' | 'public',
	owner: string,
	lastBlockHeight: number
): Promise<arfsTpes.ArFSDriveEntity[]> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({ entityType, owner, privacy, lastBlockHeight });
	const privateDrives = await query.get();
	return privateDrives.map((e) => new arfsTpes.ArFSDriveEntity(e));
}
