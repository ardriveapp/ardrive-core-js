import { GQLNodeInterface } from '../types/gql_Types';
import { DriveStateCandidate } from './drive_state_reader';
import { DRIVE_STATE_ENTITY_TYPE, DriveStateTagName } from './drive_state_tags';

/** A candidate's tags as a map. Where a name repeats, the first value wins. */
export function tagsOf(node: GQLNodeInterface): Record<string, string> {
	const tags: Record<string, string> = {};
	for (const { name, value } of node.tags ?? []) {
		if (!(name in tags)) {
			tags[name] = value;
		}
	}
	return tags;
}

export function candidateFromNode(node: GQLNodeInterface): DriveStateCandidate {
	return {
		txId: node.id,
		ownerAddress: node.owner?.address ?? '',
		tags: tagsOf(node),
		blockHeight: node.block?.height ?? undefined
	};
}

/**
 * Whether a node is one this drive's discovery could legitimately return. The
 * query already filters on these; this filters again, because a gateway is not
 * trusted to have applied them.
 */
export function isUsableCandidate(candidate: DriveStateCandidate, driveId: string, owner: string): boolean {
	return (
		candidate.ownerAddress === owner &&
		candidate.tags[DriveStateTagName.driveId] === driveId &&
		candidate.tags[DriveStateTagName.entityType] === DRIVE_STATE_ENTITY_TYPE
	);
}

function intTag(candidate: DriveStateCandidate, name: string): number | undefined {
	const raw = candidate.tags[name];
	return raw !== undefined && /^-?[0-9]+$/.test(raw) ? Number(raw) : undefined;
}

/** Descending, with missing values last. */
function descending(a: number | undefined, b: number | undefined): number {
	if (a === b) return 0;
	if (a === undefined) return 1;
	if (b === undefined) return -1;
	return b - a;
}

/**
 * Candidates in the order to try them: highest `Block-End` first, then the
 * newest mined, then the newest `Unix-Time`, then transaction id. Matches
 * ardrive-web, so both clients try the same artifact first.
 */
export function orderCandidates(candidates: DriveStateCandidate[]): DriveStateCandidate[] {
	return [...candidates].sort(
		(a, b) =>
			descending(intTag(a, DriveStateTagName.blockEnd), intTag(b, DriveStateTagName.blockEnd)) ||
			descending(a.blockHeight, b.blockHeight) ||
			descending(intTag(a, 'Unix-Time'), intTag(b, 'Unix-Time')) ||
			(a.txId < b.txId ? -1 : a.txId > b.txId ? 1 : 0)
	);
}
