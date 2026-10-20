import { ArweaveAddress, EntityID } from '../types';
import { ASCENDING_ORDER, DESCENDING_ORDER, GQLQuery } from '../utils/query';
import { DRIVE_STATE_ENTITY_TYPE, DriveStateTagName } from './drive_state_tags';

export interface BuildDriveStateQueryParams {
	driveId: EntityID;
	/** The drive's owner. Drive State is only trusted from the owner. */
	owner: ArweaveAddress;
	/** Only artifacts mined at or above this height, for a caller that has synced to it. */
	minBlockHeight?: number;
}

/**
 * The query that finds a drive's Drive State artifacts: owner-scoped, newest
 * first, one page of 100. An artifact mined before the newest 100 cannot cover
 * more blocks than they do, so one page is enough. Mirrors ardrive-web's
 * `DriveStateEntityHistory.graphql`.
 */
export function buildDriveStateQuery({ driveId, owner, minBlockHeight }: BuildDriveStateQueryParams): GQLQuery {
	const blockFilter = minBlockHeight !== undefined && minBlockHeight > 0 ? `block: { min: ${minBlockHeight} }` : '';
	return {
		query: `query {
			transactions(
				first: 100
				sort: ${DESCENDING_ORDER}
				owners: ["${owner}"]
				${blockFilter}
				tags: [
					{ name: "${DriveStateTagName.driveId}", values: ["${driveId}"] }
					{ name: "${DriveStateTagName.entityType}", values: ["${DRIVE_STATE_ENTITY_TYPE}"] }
				]
			) {
				pageInfo {
					hasNextPage
				}
				edges {
					cursor
					node {
						id
						owner {
							address
						}
						bundledIn {
							id
						}
						block {
							height
							timestamp
						}
						tags {
							name
							value
						}
					}
				}
			}
		}`
	};
}

/**
 * A page of a drive's own entity revisions, oldest first, with the fields a
 * producer records: the owner, the bundle a revision was posted in, its block
 * and its tags.
 */
export function buildDriveHistoryQuery({
	driveId,
	owner,
	entityTypes,
	cursor,
	minBlockHeight,
	maxBlockHeight
}: {
	driveId: EntityID;
	owner: ArweaveAddress;
	entityTypes: string[];
	cursor?: string;
	minBlockHeight?: number;
	maxBlockHeight?: number;
}): GQLQuery {
	const bounds = [
		minBlockHeight !== undefined ? `min: ${minBlockHeight}` : '',
		maxBlockHeight !== undefined ? `max: ${maxBlockHeight}` : ''
	].filter((b) => b);
	return {
		query: `query {
			transactions(
				first: 100
				sort: ${ASCENDING_ORDER}
				owners: ["${owner}"]
				${cursor ? `after: "${cursor}"` : ''}
				${bounds.length ? `block: { ${bounds.join(', ')} }` : ''}
				tags: [
					{ name: "Drive-Id", values: ["${driveId}"] }
					{ name: "Entity-Type", values: [${entityTypes.map((t) => `"${t}"`).join(', ')}] }
				]
			) {
				pageInfo {
					hasNextPage
				}
				edges {
					cursor
					node {
						id
						owner {
							address
						}
						bundledIn {
							id
						}
						block {
							height
							timestamp
						}
						tags {
							name
							value
						}
					}
				}
			}
		}`
	};
}

/** Which of [ids] the gateway knows as mined: transactions and bundled data items alike. */
export function buildMinedTxIdsQuery(ids: string[]): GQLQuery {
	return {
		query: `query {
			transactions(first: 100, ids: [${ids.map((id) => `"${id}"`).join(', ')}]) {
				pageInfo {
					hasNextPage
				}
				edges {
					cursor
					node {
						id
						block {
							height
						}
					}
				}
			}
		}`
	};
}
