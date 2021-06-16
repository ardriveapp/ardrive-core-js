import { ArFSFileFolderEntity, IFileFolderEntity } from '../types/arfs_Types';
import { PrivacyToFileFolderEntity } from '../types/type_conditionals';
import { DrivePrivacy, drivePrivacyValues, entityTypeValues } from '../types/type_guards';
import { EntityQuery } from './EntityQuery';

const entityType = entityTypeValues.FOLDER;

export const getPrivateFolderEntity = getFolderEntity.bind(this, drivePrivacyValues.PRIVATE);

export const getPublicFolderEntity = getFolderEntity.bind(this, drivePrivacyValues.PUBLIC);

export const getAllPrivateFolderEntities = getFolderEntities.bind(this, drivePrivacyValues.PRIVATE);

export const getAllPublicFolderEntities = getFolderEntities.bind(this, drivePrivacyValues.PUBLIC);

async function getFolderEntity<P extends DrivePrivacy>(
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

async function getFolderEntities<P extends DrivePrivacy>(
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
