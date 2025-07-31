import { ArweaveAddress, TransactionID, GQLQueryTagInterface } from '../types';

const ownerFragment = `
	owner {
		address
	}
`;

const nodeFragment = `
	node {
		id
		tags {
			name
			value
		}
		block {
			height
			timestamp
		}
		${ownerFragment}
	}
`;

const edgesFragment = (singleResult: boolean) => `
	edges {
		${singleResult ? '' : 'cursor'}
		${nodeFragment}
	}
`;

const pageInfoFragment = `
	pageInfo {
		hasNextPage
	}
`;

export type GQLQuery = { query: string };

export const ASCENDING_ORDER = 'HEIGHT_ASC';
export const DESCENDING_ORDER = 'HEIGHT_DESC';
const latestResult = 1;
const pageLimit = 100;

type Sort = typeof ASCENDING_ORDER | typeof DESCENDING_ORDER;

export interface BuildGQLQueryParams {
	tags: GQLQueryTagInterface[];
	cursor?: string;
	owner?: ArweaveAddress;
	sort?: Sort;
	ids?: TransactionID[];
	minBlock?: number;
	maxBlock?: number;
	first?: number;
}

/**
 * Builds a GraphQL query which will only return the latest result
 *
 * TODO: Add parameters and support for all possible upcoming GQL queries
 *
 * @example
 * const query = buildQuery([{ name: 'Folder-Id', value: folderId }]);
 */
export function buildQuery({
	tags = [],
	cursor,
	owner,
	sort = DESCENDING_ORDER,
	ids,
	minBlock,
	maxBlock,
	first
}: BuildGQLQueryParams): GQLQuery {
	let queryTags = ``;

	tags.forEach((t) => {
		queryTags = `${queryTags}
				{ name: "${t.name}", values: ${Array.isArray(t.value) ? JSON.stringify(t.value) : `"${t.value}"`} }`;
	});

	const singleResult = cursor === undefined;

	// Build block filter if min or max block is specified
	let blockFilter = '';
	if (minBlock !== undefined || maxBlock !== undefined) {
		blockFilter = 'block: {';
		if (minBlock !== undefined) {
			blockFilter += ` min: ${minBlock}`;
		}
		if (maxBlock !== undefined) {
			blockFilter += `${minBlock !== undefined ? ',' : ''} max: ${maxBlock}`;
		}
		blockFilter += ' }';
	}

	return {
		query: `query {
			transactions(
				${ids?.length ? `ids: [${ids.map((id) => `"${id}"`)}]` : ''}
				first: ${singleResult ? latestResult : first !== undefined ? first : pageLimit}
				sort: ${sort}
				${singleResult ? '' : `after: "${cursor}"`}
				${owner === undefined ? '' : `owners: ["${owner}"]`}
				${blockFilter}
				tags: [
					${queryTags}
				]
			) {
				${singleResult ? '' : pageInfoFragment}
				${edgesFragment(singleResult)}
			}
		}`
	};
}
