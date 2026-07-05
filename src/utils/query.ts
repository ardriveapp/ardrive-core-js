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
		${ownerFragment}
		block {
			height
		}
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
	/**
	 * Optional inclusive lower block-height bound. Emitted as `block: { min }`.
	 * Used by the snapshot-accelerated listing path to fetch only the "live
	 * tail" of a drive's history (heights not covered by any snapshot).
	 */
	minBlockHeight?: number;
	/** Optional inclusive upper block-height bound. Emitted as `block: { max }`. */
	maxBlockHeight?: number;
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
	minBlockHeight,
	maxBlockHeight
}: BuildGQLQueryParams): GQLQuery {
	let queryTags = ``;

	tags.forEach((t) => {
		queryTags = `${queryTags}
				{ name: "${t.name}", values: ${Array.isArray(t.value) ? JSON.stringify(t.value) : `"${t.value}"`} }`;
	});

	const singleResult = cursor === undefined;

	const blockFilterParts: string[] = [];
	if (minBlockHeight !== undefined) {
		blockFilterParts.push(`min: ${minBlockHeight}`);
	}
	if (maxBlockHeight !== undefined) {
		blockFilterParts.push(`max: ${maxBlockHeight}`);
	}
	const blockFilter = blockFilterParts.length ? `block: { ${blockFilterParts.join(', ')} }` : '';

	return {
		query: `query {
			transactions(
				${ids?.length ? `ids: [${ids.map((id) => `"${id}"`)}]` : ''}
				first: ${singleResult ? latestResult : pageLimit}
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
