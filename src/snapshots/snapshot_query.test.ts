import { expect } from 'chai';
import { ADDR, EID } from '../types';
import { buildSnapshotQuery } from './snapshot_query';

const driveId = EID('12345678-1234-1234-1234-123456789abc');
const owner = ADDR('vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI');

describe('buildSnapshotQuery', () => {
	it('filters on Drive-Id and Entity-Type == snapshot', () => {
		const { query } = buildSnapshotQuery({ driveId, owner });
		expect(query).to.contain(`{ name: "Drive-Id", values: ["${driveId}"] }`);
		expect(query).to.contain('{ name: "Entity-Type", values: ["snapshot"] }');
	});

	it('scopes the query to the drive owner and sorts HEIGHT_DESC', () => {
		const { query } = buildSnapshotQuery({ driveId, owner });
		expect(query).to.contain(`owners: ["${owner}"]`);
		expect(query).to.contain('sort: HEIGHT_DESC');
	});

	it('requests a full page and selects block height + timestamp', () => {
		const { query } = buildSnapshotQuery({ driveId, owner });
		expect(query).to.contain('first: 100');
		expect(query).to.contain('height');
		expect(query).to.contain('timestamp');
		expect(query).to.contain('hasNextPage');
	});

	it('omits the after clause on the first page', () => {
		const { query } = buildSnapshotQuery({ driveId, owner });
		expect(query).to.not.contain('after:');
	});

	it('includes the after cursor when paginating', () => {
		const { query } = buildSnapshotQuery({ driveId, owner, cursor: 'CURSOR123' });
		expect(query).to.contain('after: "CURSOR123"');
	});

	it('emits block: { min } when a minimum block height is given', () => {
		const { query } = buildSnapshotQuery({ driveId, owner, minBlockHeight: 500 });
		expect(query).to.contain('block: { min: 500 }');
	});

	it('emits both min and max when bounded on both sides', () => {
		const { query } = buildSnapshotQuery({ driveId, owner, minBlockHeight: 500, maxBlockHeight: 900 });
		expect(query).to.contain('block: { min: 500, max: 900 }');
	});

	it('omits the block filter entirely when unbounded', () => {
		const { query } = buildSnapshotQuery({ driveId, owner });
		expect(query).to.not.contain('block:');
	});
});
