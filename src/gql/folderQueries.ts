import { ArFSFileFolderEntity, IFileFolderEntity } from '../types/arfs_Types';
import { PrivacyToFileFolderEntity } from '../types/type_conditionals';
import { drivePrivacy } from '../types/type_guards';
import { EntityQuery } from './EntityQuery';

const entityType = 'folder';

export const getPrivateFolderEntity = getFolderEntity.bind(this, drivePrivacy.PRIVATE);

export const getPublicFolderEntity = getFolderEntity.bind(this, drivePrivacy.PUBLIC);

export const getAllPrivateFolderEntities = getFolderEntities.bind(this, drivePrivacy.PRIVATE);

export const getAllPublicFolderEntities = getFolderEntities.bind(this, drivePrivacy.PUBLIC);

async function getFolderEntity<P extends drivePrivacy>(
	privacy: P,
	folderId: string
): Promise<PrivacyToFileFolderEntity<P>> {
	const query = new EntityQuery<IFileFolderEntity>({
		entityId: folderId,
		entityType,
		privacy
	});
	const privateDrive = (await query.get())[0];
	return new ArFSFileFolderEntity(privateDrive);
}

async function getFolderEntities<P extends drivePrivacy>(
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
	const results = await query.get();
	const folders = results.map((folder) => new ArFSFileFolderEntity(folder));
	return folders;
}
