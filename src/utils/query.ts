import { ArweaveAddress, TransactionID, GQLQueryTagInterface } from '../types';
import { getGqlPageSize } from './constants';

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
	 * tail" of a drive's history (heights not covered by any snapshot) [CORE-3].
	 */
	minBlockHeight?: number;
	/** Optional inclusive upper block-height bound. Emitted as `block: { max }` [CORE-3]. */
	maxBlockHeight?: number;
	/** Incremental-sync lower block-height bound (alias of minBlockHeight) [CORE-2]. */
	minBlock?: number;
	/** Incremental-sync upper block-height bound (alias of maxBlockHeight) [CORE-2]. */
	maxBlock?: number;
	/**
	 * Page size override for `transactions(first: …)`; defaults to the configured
	 * page size (`getGqlPageSize()`, initially the 1000 ar.io max) when unset
	 * [CORE-2]. An explicit value here always wins over the configured default.
	 * Gateways silently cap this at 1000.
	 */
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
	minBlockHeight,
	maxBlockHeight,
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

	// Block-height filter. The snapshot listing path (CORE-3) passes
	// minBlockHeight/maxBlockHeight; the incremental-sync path (CORE-2) passes
	// minBlock/maxBlock. They are aliases for the same GQL `block: { min, max }`
	// filter and are never both set on one call, so coalesce them. The single
	// join-based emitter reproduces the exact string both original paths emitted
	// (`block: { min: X, max: Y }` / `block: { min: X }` / `block: { max: Y }`).
	const effectiveMinBlock = minBlock ?? minBlockHeight;
	const effectiveMaxBlock = maxBlock ?? maxBlockHeight;
	const blockFilterParts: string[] = [];
	if (effectiveMinBlock !== undefined) {
		blockFilterParts.push(`min: ${effectiveMinBlock}`);
	}
	if (effectiveMaxBlock !== undefined) {
		blockFilterParts.push(`max: ${effectiveMaxBlock}`);
	}
	const blockFilter = blockFilterParts.length ? `block: { ${blockFilterParts.join(', ')} }` : '';

	return {
		query: `query {
			transactions(
				${ids?.length ? `ids: [${ids.map((id) => `"${id}"`)}]` : ''}
				first: ${singleResult ? latestResult : first !== undefined ? first : getGqlPageSize()}
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
