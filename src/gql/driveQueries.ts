import { arFSVersion } from '../common';
import { appName, webAppName } from '../constants';
import * as arfsTpes from '../types/arfs_Types';
import { ArFSDriveMetaData, ArFSRootFolderMetaData } from '../types/base_Types';
import { GQLEdgeInterface } from '../types/gql_Types';
import { PrivacyToDriveEntity } from '../types/type_conditionals';
import { cipherType, drivePrivacy, entityType as _entityType } from '../types/type_guards';
import { EntityQuery } from './EntityQuery';
import { NODE_ID_AND_TAGS_PARAMETERS, Query } from './Query';

const entityType = _entityType.DRIVE;

export const getPrivateDriveEntity = getDriveEntity.bind(this, drivePrivacy.PRIVATE);

export const getPublicDriveEntity = getDriveEntity.bind(this, drivePrivacy.PUBLIC);

export const getAllPrivateDriveEntities = getAllDriveEntities.bind(this, drivePrivacy.PRIVATE);

export const getAllPublicDriveEntities = getAllDriveEntities.bind(this, drivePrivacy.PUBLIC);

export async function getSharedPublicDrive(driveId: string): Promise<ArFSDriveMetaData> {
	const query = new EntityQuery<ArFSDriveMetaData>({
		entityType,
		entityId: driveId,
		privacy: drivePrivacy.PUBLIC
	});
	const drive = (await query.get())[0];
	return drive;
}

async function getDriveEntity<P extends drivePrivacy.PRIVATE | drivePrivacy.PUBLIC>(
	privacy: P,
	driveId: string
): Promise<PrivacyToDriveEntity<P>> {
	const query = new EntityQuery<PrivacyToDriveEntity<P>>({
		entityType,
		entityId: driveId,
		privacy
	});
	const drive = (await query.get())[0];
	return drive;
}

export async function getPublicDriveRootFolderTxId(driveId: string, folderId: string): Promise<string> {
	const query = getDriveRootFolderQuery(driveId, folderId);
	const transaction = (await query.getRaw())[0];
	const metaDataTxId = getMetaDataTxIdFrom(transaction);
	return metaDataTxId;
}

export const getAllMyPublicArDriveIds = getAllMyArDriveIds.bind(this, drivePrivacy.PUBLIC);

export const getAllMyPrivateArDriveIds = getAllMyArDriveIds.bind(this, drivePrivacy.PRIVATE);

async function getAllMyArDriveIds<P extends drivePrivacy>(
	privacy: P,
	user: { login: string; dataProtectionKey?: string; walletPublicKey: string },
	lastBlockHeight: number
): Promise<ArFSDriveMetaData[]> {
	const query = new Query();
	query.lastDriveBlockHeight = lastBlockHeight;
	query.first = 100;
	query.owners = [user.walletPublicKey];
	query.tags = [
		{ name: 'App-Name', values: [appName, webAppName] },
		{ name: 'Entity-Type', values: entityType },
		{ name: 'Drive-Privacy', values: privacy }
	];
	query.parameters = NODE_ID_AND_TAGS_PARAMETERS;
	const result = await query.getAll<ArFSDriveMetaData>();
	return result;
}

export async function getPrivateDriveRootFolderTxId(
	driveId: string,
	folderId: string
): Promise<ArFSRootFolderMetaData> {
	const query = getDriveRootFolderQuery(driveId, folderId);
	query.parameters = NODE_ID_AND_TAGS_PARAMETERS;
	const transaction = (await query.getRaw())[0];
	const tags = transaction.node.tags;
	const cipher = tags.find((tag) => tag.name === 'Cipher')?.value as cipherType;
	const cipherIV = tags.find((tag) => tag.name === 'CipherIV')?.value;
	const metaDataTxId = getMetaDataTxIdFrom(transaction);
	const folderMetadata = new ArFSRootFolderMetaData({
		metaDataTxId,
		cipher,
		cipherIV
	});
	return folderMetadata;
}

function getMetaDataTxIdFrom(transaction: GQLEdgeInterface): string {
	let metaDataTxId = '0';
	if (transaction) {
		metaDataTxId = transaction.node.id;
	}
	return metaDataTxId;
}

function getDriveRootFolderQuery(driveId: string, folderId: string): Query {
	const query = new Query();
	query.first = 1;
	query.tags = [
		{ name: 'ArFS', values: arFSVersion },
		{ name: 'Drive-Id', values: driveId },
		{ name: 'Folder-Id', values: folderId }
	];
	return query;
}

async function getAllDriveEntities<P extends drivePrivacy.PRIVATE | drivePrivacy.PUBLIC>(
	privacy: P,
	owner: string,
	lastBlockHeight: number
): Promise<PrivacyToDriveEntity<P>[]> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({ entityType, owner, privacy, lastBlockHeight });
	const privateDrives = await query.get();
	return privateDrives.map((e) => new arfsTpes.ArFSDriveEntity(e));
}
