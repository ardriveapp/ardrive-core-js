import { expect } from 'chai';
import { parseSnapshotData } from './snapshot_data';

function gqlNode(id: string) {
	return {
		id,
		owner: { address: 'owner-address' },
		block: { height: 100, timestamp: 1_700_000_000 },
		tags: [
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'File-Id', value: 'file-1' }
		]
	};
}

function validBody(): string {
	return JSON.stringify({
		txSnapshots: [
			{ gqlNode: gqlNode('tx-1'), jsonMetadata: '{"name":"first"}' },
			{ gqlNode: gqlNode('tx-2'), jsonMetadata: '{"name":"second"}' }
		]
	});
}

describe('parseSnapshotData', () => {
	it('parses a well-formed body, keeping gqlNode AND jsonMetadata together', () => {
		const data = parseSnapshotData(validBody());
		expect(data.txSnapshots.length).to.equal(2);

		// The whole point of snapshots: node + metadata are co-located, so no
		// per-entity data-tx GET is needed to replay this revision.
		const first = data.txSnapshots[0];
		expect(first.gqlNode.id).to.equal('tx-1');
		expect(first.gqlNode.tags.length).to.equal(2);
		expect(first.jsonMetadata).to.equal('{"name":"first"}');
	});

	it('accepts a Uint8Array (utf8) body', () => {
		const bytes = new TextEncoder().encode(validBody());
		const data = parseSnapshotData(bytes);
		expect(data.txSnapshots.length).to.equal(2);
		expect(data.txSnapshots[1].gqlNode.id).to.equal('tx-2');
	});

	it('preserves a null jsonMetadata', () => {
		const body = JSON.stringify({ txSnapshots: [{ gqlNode: gqlNode('tx-1'), jsonMetadata: null }] });
		const data = parseSnapshotData(body);
		expect(data.txSnapshots.length).to.equal(1);
		expect(data.txSnapshots[0].jsonMetadata).to.be.null;
	});

	describe('fail-soft behavior', () => {
		it('returns empty for invalid JSON', () => {
			expect(parseSnapshotData('{not json').txSnapshots).to.deep.equal([]);
		});

		it('returns empty when the top level is not an object', () => {
			expect(parseSnapshotData('[]').txSnapshots).to.deep.equal([]);
			expect(parseSnapshotData('"a string"').txSnapshots).to.deep.equal([]);
			expect(parseSnapshotData('null').txSnapshots).to.deep.equal([]);
		});

		it('returns empty when txSnapshots is missing or not an array', () => {
			expect(parseSnapshotData('{}').txSnapshots).to.deep.equal([]);
			expect(parseSnapshotData('{"txSnapshots":42}').txSnapshots).to.deep.equal([]);
		});

		it('skips entries missing a usable gqlNode but keeps the valid ones', () => {
			const body = JSON.stringify({
				txSnapshots: [
					{ jsonMetadata: '{"name":"orphan"}' }, // no gqlNode → skipped
					{ gqlNode: { id: 'no-tags' }, jsonMetadata: null }, // gqlNode lacks tags → skipped
					{ gqlNode: { tags: [] }, jsonMetadata: null }, // gqlNode lacks id → skipped
					{ gqlNode: gqlNode('tx-good'), jsonMetadata: '{"name":"good"}' } // valid
				]
			});
			const data = parseSnapshotData(body);
			expect(data.txSnapshots.length).to.equal(1);
			expect(data.txSnapshots[0].gqlNode.id).to.equal('tx-good');
		});

		it('coerces an unexpected jsonMetadata shape to null rather than throwing', () => {
			const body = JSON.stringify({
				txSnapshots: [{ gqlNode: gqlNode('tx-1'), jsonMetadata: { unexpected: true } }]
			});
			const data = parseSnapshotData(body);
			expect(data.txSnapshots.length).to.equal(1);
			expect(data.txSnapshots[0].jsonMetadata).to.be.null;
		});

		it('returns empty (not a throw) for an empty string', () => {
			expect(parseSnapshotData('').txSnapshots).to.deep.equal([]);
		});
	});
});
