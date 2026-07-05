import { expect } from 'chai';
import { GQLNodeInterface, GQLTagInterface } from '../types';
import { snapshotEntityFromGQLNode } from './snapshot_types';

const VALID_TX_ID = '0000000000000000000000000000000000000000abc';
const VALID_DRIVE_ID = '12345678-1234-1234-1234-123456789abc';

function makeNode(
	tags: GQLTagInterface[],
	opts?: { id?: string; block?: { height: number; timestamp: number } }
): GQLNodeInterface {
	return {
		id: opts?.id ?? VALID_TX_ID,
		tags,
		block: opts?.block
	} as unknown as GQLNodeInterface;
}

function baseTags(): GQLTagInterface[] {
	return [
		{ name: 'Entity-Type', value: 'snapshot' },
		{ name: 'Drive-Id', value: VALID_DRIVE_ID },
		{ name: 'Block-Start', value: '10' },
		{ name: 'Block-End', value: '200' }
	];
}

describe('snapshotEntityFromGQLNode', () => {
	it('parses a well-formed snapshot node', () => {
		const node = makeNode(
			[
				...baseTags(),
				{ name: 'Snapshot-Id', value: 'abcdef01-1234-1234-1234-123456789abc' },
				{ name: 'Data-Start', value: '5' },
				{ name: 'Data-End', value: '250' }
			],
			{ block: { height: 205, timestamp: 1_700_000_000 } }
		);

		const entity = snapshotEntityFromGQLNode(node)!;
		expect(entity).to.not.be.null;
		expect(`${entity.driveId}`).to.equal(VALID_DRIVE_ID);
		expect(`${entity.txId}`).to.equal(VALID_TX_ID);
		expect(`${entity.snapshotId}`).to.equal('abcdef01-1234-1234-1234-123456789abc');
		expect(entity.blockStart).to.equal(10);
		expect(entity.blockEnd).to.equal(200);
		expect(entity.dataStart).to.equal(5);
		expect(entity.dataEnd).to.equal(250);
		expect(entity.blockHeight).to.equal(205);
		expect(entity.timestamp).to.equal(1_700_000_000);
	});

	it('leaves optional fields undefined when their tags are absent', () => {
		const entity = snapshotEntityFromGQLNode(makeNode(baseTags()))!;
		expect(entity.snapshotId).to.equal(undefined);
		expect(entity.dataStart).to.equal(undefined);
		expect(entity.dataEnd).to.equal(undefined);
		expect(entity.blockHeight).to.equal(undefined);
		expect(entity.timestamp).to.equal(undefined);
	});

	it('fails soft (null) when Drive-Id is missing', () => {
		const tags = baseTags().filter((t) => t.name !== 'Drive-Id');
		expect(snapshotEntityFromGQLNode(makeNode(tags))).to.be.null;
	});

	it('fails soft (null) when Block-Start is missing', () => {
		const tags = baseTags().filter((t) => t.name !== 'Block-Start');
		expect(snapshotEntityFromGQLNode(makeNode(tags))).to.be.null;
	});

	it('fails soft (null) when Block-End is missing', () => {
		const tags = baseTags().filter((t) => t.name !== 'Block-End');
		expect(snapshotEntityFromGQLNode(makeNode(tags))).to.be.null;
	});

	it('fails soft (null) when a block bound is non-integer', () => {
		const tags = baseTags().map((t) => (t.name === 'Block-Start' ? { name: t.name, value: 'not-a-number' } : t));
		expect(snapshotEntityFromGQLNode(makeNode(tags))).to.be.null;
	});

	it('fails soft (null) when blockStart > blockEnd', () => {
		const tags: GQLTagInterface[] = [
			{ name: 'Drive-Id', value: VALID_DRIVE_ID },
			{ name: 'Block-Start', value: '300' },
			{ name: 'Block-End', value: '100' }
		];
		expect(snapshotEntityFromGQLNode(makeNode(tags))).to.be.null;
	});

	it('fails soft (null) when Drive-Id is not a valid entity id', () => {
		const tags = baseTags().map((t) => (t.name === 'Drive-Id' ? { name: t.name, value: 'not-a-uuid' } : t));
		expect(snapshotEntityFromGQLNode(makeNode(tags))).to.be.null;
	});

	it('keeps the entity but drops an invalid Snapshot-Id', () => {
		const tags = [...baseTags(), { name: 'Snapshot-Id', value: 'not-a-uuid' }];
		const entity = snapshotEntityFromGQLNode(makeNode(tags))!;
		expect(entity).to.not.be.null;
		expect(entity.snapshotId).to.equal(undefined);
	});
});
