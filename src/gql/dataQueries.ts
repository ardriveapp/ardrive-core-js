import { appName, webAppName } from '../common';
import { ArFSFileData, IFileData } from '../types/arfs_Types';
import { GQLEdgeInterface } from '../types/gql_Types';
import { PrivacyToData } from '../types/type_conditionals';
import { drivePrivacy } from '../types/type_guards';
import { NODE_ID_AND_TAGS_PARAMETERS, Query } from './Query';
import { getTransactionQuery } from './transactionQueries';

export const getPublicFileEntity = getPrivateFileEntityFactory<drivePrivacy.PRIVATE>();

export const getPrivateFileEntity = getPrivateFileEntityFactory<drivePrivacy.PUBLIC>();

function getPrivateFileEntityFactory<P extends drivePrivacy>(): (txId: string) => Promise<PrivacyToData<P>> {
	return function (txId: string) {
		return getFileData<P>(txId);
	};
}

async function getFileData<P extends drivePrivacy>(txId: string): Promise<PrivacyToData<P>> {
	const query = getTransactionQuery(txId);
	const entities = await query.getAll<IFileData>();
	const entityInstance = new ArFSFileData<P>(entities[0]) as PrivacyToData<P>;
	return entityInstance;
}

export async function getAllMyDataFileTxs(
	walletPublicKey: string | false,
	driveId: string,
	lastBlockHeight: number
): Promise<GQLEdgeInterface[]> {
	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}
	const query = new Query();
	query.lastDriveBlockHeight = lastBlockHeight;
	if (walletPublicKey) {
		query.owners = [walletPublicKey];
	}
	query.tags = [
		{ name: 'App-Name', values: [appName, webAppName] },
		{ name: 'Drive-Id', values: driveId },
		{ name: 'Entity-Type', values: ['file', 'folder'] }
	];
	query.first = 100;
	query.parameters = [
		'pageInfo.hasNextPage',
		'edges.cursor',
		'edges.node.block.timestamp',
		'edges.node.block.height',
		...NODE_ID_AND_TAGS_PARAMETERS
	];
	return await query.getRaw();
}

export const getAllMySharedDataFileTxs = getAllMyDataFileTxs.bind(this, false);
