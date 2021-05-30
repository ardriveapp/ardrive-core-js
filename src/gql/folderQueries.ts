import * as arfsTpes from '../types/arfs_Types';
import { EntityQuery } from './EntityQuery';

const entityType = 'folder';

export const getPublicFolderEntity = getFolderEntity.bind(this, 'public');

export const getPrivateFolderEntity = getFolderEntity.bind(this, 'private');

export const getAllPublicDriveEntities = getFolderEntities.bind(this, 'public');

export const getAllPrivateDriveEntities = getFolderEntities.bind(this, 'private');

async function getFolderEntity(privacy: 'private' | 'public', folderId: string): Promise<arfsTpes.ArFSDriveEntity> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({
		entityId: folderId,
		entityType,
		privacy
	});
	const privateDrive = (await query.get())[0];
	return new arfsTpes.ArFSDriveEntity(privateDrive);
}

async function getFolderEntities(privacy: 'private' | 'public', owner: string, lastBlockHeight: number) {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({
		entityType,
		owner,
		lastBlockHeight,
		privacy
	});
	const folders = query.get();
	return folders;
}
