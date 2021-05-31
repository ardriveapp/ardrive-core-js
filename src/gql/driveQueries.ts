import * as arfsTpes from '../types/arfs_Types';
import { PrivacyToDriveEntity } from '../types/type_conditionals';
import { drivePrivacy } from '../types/type_guards';
import { EntityQuery } from './EntityQuery';

const entityType = 'drive';

export const getPrivateDriveEntity = getDriveEntity.bind(this, drivePrivacy.PRIVATE);

export const getPublicDriveEntity = getDriveEntity.bind(this, drivePrivacy.PUBLIC);

export const getAllPrivateDriveEntities = getAllDriveEntities.bind(this, drivePrivacy.PRIVATE);

export const getAllPublicDriveEntities = getAllDriveEntities.bind(this, drivePrivacy.PUBLIC);

async function getDriveEntity<P extends drivePrivacy>(privacy: P, driveId: string): Promise<PrivacyToDriveEntity<P>> {
	const query = new EntityQuery<PrivacyToDriveEntity<P>>({
		entityType,
		entityId: driveId,
		privacy
	});
	const drive = (await query.get())[0];
	return drive;
}

async function getAllDriveEntities<P extends drivePrivacy>(
	privacy: P,
	owner: string,
	lastBlockHeight: number
): Promise<PrivacyToDriveEntity<P>[]> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({ entityType, owner, privacy, lastBlockHeight });
	const privateDrives = await query.get();
	return privateDrives.map((e) => new arfsTpes.ArFSDriveEntity(e));
}
