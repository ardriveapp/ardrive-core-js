"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildQuery = exports.DESCENDING_ORDER = exports.ASCENDING_ORDER = void 0;
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
	}
`;
const edgesFragment = (singleResult) => `
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
exports.ASCENDING_ORDER = 'HEIGHT_ASC';
exports.DESCENDING_ORDER = 'HEIGHT_DESC';
const latestResult = 1;
const pageLimit = 100;
/**
 * Builds a GraphQL query which will only return the latest result
 *
 * TODO: Add parameters and support for all possible upcoming GQL queries
 *
 * @example
 * const query = buildQuery([{ name: 'Folder-Id', value: folderId }]);
 */
function buildQuery({ tags = [], cursor, owner, sort = exports.DESCENDING_ORDER }) {
    let queryTags = ``;
    tags.forEach((t) => {
        queryTags = `${queryTags}
				{ name: "${t.name}", values: ${Array.isArray(t.value) ? JSON.stringify(t.value) : `"${t.value}"`} }`;
    });
    const singleResult = cursor === undefined;
    return {
        query: `query {
			transactions(
				first: ${singleResult ? latestResult : pageLimit}
				sort: ${sort}
				${singleResult ? '' : `after: "${cursor}"`}
				${owner === undefined ? '' : `owners: ["${owner}"]`}
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
exports.buildQuery = buildQuery;
