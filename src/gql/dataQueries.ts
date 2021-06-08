import { appName, webAppName } from '../common';
import { GQLEdgeInterface } from '../types/gql_Types';
import { NODE_ID_AND_TAGS_PARAMETERS, Query } from './Query';

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
