import { ArweaveAddress, EntityID } from '../types';
import { DESCENDING_ORDER, GQLQuery } from '../utils/query';
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
