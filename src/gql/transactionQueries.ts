import { Query, NODE_ID_AND_TAGS_PARAMETERS } from './Query';

export async function getPrivateTransactionCipherIV(txId: string): Promise<string> {
	const query = getTransactionQuery(txId);
	const results = await query.getAll<{ cypherIV: string }>();
	const transaction = results[0];
	return transaction.cypherIV;
}

export function getTransactionQuery(txId: string): Query {
	const query = new Query();
	query.ids = [txId];
	query.parameters = NODE_ID_AND_TAGS_PARAMETERS;
	return query;
}
