import { ArweaveAddress, EntityID } from '../types';
import { GQLQuery, DESCENDING_ORDER } from '../utils/query';
import { getGqlPageSize } from '../utils/constants';
import { SNAPSHOT_ENTITY_TYPE, SnapshotTagName } from './snapshot_tags';

export interface BuildSnapshotQueryParams {
	/** The drive whose snapshots we're listing. */
	driveId: EntityID;
	/** The drive owner — snapshots are only trusted from the drive owner. */
	owner: ArweaveAddress;
	/** Pagination cursor from the previous page's `pageInfo`/edge cursor. */
	cursor?: string;
	/**
	 * Lower block-height bound (inclusive). Used for incremental sync: only
	 * fetch snapshots mined at or after a previously synced height. Emitted as
	 * `block: { min: ... }`, matching ardrive-web's `SnapshotEntityHistory`.
	 */
	minBlockHeight?: number;
	/** Optional upper block-height bound (inclusive), emitted as `block: { max }`. */
	maxBlockHeight?: number;
}

/**
 * Builds the GraphQL query that lists a drive's snapshot transactions, mirroring
 * core-js's `buildQuery` conventions (owner-scoped, cursor-paged, HEIGHT_DESC)
 * and ardrive-web's `SnapshotEntityHistory.graphql`.
 *
 * The tag filter is `Drive-Id == driveId` AND `Entity-Type == "snapshot"`,
 * scoped to the drive owner and sorted HEIGHT_DESC so the newest snapshot is
 * seen first (which is what the obscuring model in {@link computeSnapshotSubRanges}
 * expects). The selected node fields include `block { height timestamp }` so the
 * consumer can range-filter without an extra lookup.
 */
export function buildSnapshotQuery({
	driveId,
	owner,
	cursor,
	minBlockHeight,
	maxBlockHeight
}: BuildSnapshotQueryParams): GQLQuery {
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
				first: ${getGqlPageSize()}
				sort: ${DESCENDING_ORDER}
				owners: ["${owner}"]
				${cursor === undefined ? '' : `after: "${cursor}"`}
				${blockFilter}
				tags: [
					{ name: "${SnapshotTagName.driveId}", values: ["${driveId}"] }
					{ name: "${SnapshotTagName.entityType}", values: ["${SNAPSHOT_ENTITY_TYPE}"] }
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
