import { GQLNodeInterface } from '../types';
import { SnapshotData, TxSnapshot } from './snapshot_types';

function decodeBody(body: string | Uint8Array): string {
	if (typeof body === 'string') {
		return body;
	}
	return new TextDecoder('utf-8').decode(body);
}

/**
 * Validates a raw `gqlNode` object from a snapshot entry. Requires at minimum an
 * `id` string and a `tags` array — enough to replay the entity's revision. The
 * object is returned as-is (typed as {@link GQLNodeInterface}); a streaming /
 * schema-strict validator is deferred to phase 2.
 */
function parseGqlNode(raw: unknown): GQLNodeInterface | null {
	if (raw === null || typeof raw !== 'object') {
		return null;
	}
	const node = raw as Partial<GQLNodeInterface>;
	if (typeof node.id !== 'string' || !Array.isArray(node.tags)) {
		return null;
	}
	return raw as GQLNodeInterface;
}

function parseTxSnapshot(raw: unknown): TxSnapshot | null {
	if (raw === null || typeof raw !== 'object') {
		return null;
	}
	const entry = raw as { gqlNode?: unknown; jsonMetadata?: unknown };
	const gqlNode = parseGqlNode(entry.gqlNode);
	if (gqlNode === null) {
		return null;
	}

	let jsonMetadata: string | null;
	if (typeof entry.jsonMetadata === 'string') {
		jsonMetadata = entry.jsonMetadata;
	} else if (entry.jsonMetadata === null || entry.jsonMetadata === undefined) {
		jsonMetadata = null;
	} else {
		// Unexpected metadata shape — keep the node, drop the (unusable) metadata.
		jsonMetadata = null;
	}

	return { gqlNode, jsonMetadata };
}

/**
 * Parses an ArFS snapshot body (`{"txSnapshots":[...]}`) into {@link SnapshotData}.
 *
 * MVP implementation: a single `JSON.parse` of the (bounded) body, ported from
 * the model in ardrive-web `SnapshotItemOnChain`. A streaming/incremental parser
 * (which the reference client uses to keep memory bounded for very large bodies)
 * is deferred to phase 2.
 *
 * Fails soft, at every level, because snapshots are an optimization and must
 * never be a correctness dependency:
 *  - a body that isn't valid JSON, isn't an object, or lacks a `txSnapshots`
 *    array yields an empty result;
 *  - individual entries missing a usable `gqlNode` are skipped, not fatal.
 */
export function parseSnapshotData(body: string | Uint8Array): SnapshotData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(decodeBody(body));
	} catch {
		return { txSnapshots: [] };
	}

	if (parsed === null || typeof parsed !== 'object') {
		return { txSnapshots: [] };
	}
	const rawTxSnapshots = (parsed as { txSnapshots?: unknown }).txSnapshots;
	if (!Array.isArray(rawTxSnapshots)) {
		return { txSnapshots: [] };
	}

	const txSnapshots: TxSnapshot[] = [];
	for (const raw of rawTxSnapshots) {
		const entry = parseTxSnapshot(raw);
		if (entry !== null) {
			txSnapshots.push(entry);
		}
	}

	return { txSnapshots };
}
