import Arweave from 'arweave';
import { expect } from 'chai';
import { gunzipSync, gzipSync } from 'fflate';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stub } from 'sinon';
import { ArFSDAOAnonymous } from '../arfs/arfsdao_anonymous';
import { ADDR, EID } from '../types';
import { GQLNodeInterface } from '../types/gql_Types';
import { GatewayAPI } from '../utils/gateway_api';
import { defaultArtifactEngine } from './artifact_engine';
import { buildDriveState, DriveStateBuildRefused, DriveStateChain } from './drive_state_builder';
import { DriveStateRefused } from './drive_state_outcome';
import { DriveStateReadOptions, readDriveState } from './drive_state_reader';
import { DriveStateSource } from './drive_state_source';

/**
 * One test per read guard that no fixture reaches on its own, each made by
 * changing one thing in the public fixture. Removing the guard fails its test.
 */
const FIXTURES = join(__dirname, '../../tests/fixtures/drive_state');
const side = JSON.parse(readFileSync(join(FIXTURES, 'public-gzip.json'), 'utf8'));
const OWNER: string = side.reader.ownerAddress;
const DRIVE: string = side.reader.driveId;
const body = () => readFileSync(join(FIXTURES, side.body));

function tags(over: Record<string, string> = {}): Record<string, string> {
	const out: Record<string, string> = {};
	for (const t of side.transaction.tags) {
		out[t.name] ??= t.value;
	}
	return { ...out, ...over };
}

/** The fixture with [sql] run against its SQLite file. */
async function mutated(...sql: string[]): Promise<Uint8Array> {
	const db = await defaultArtifactEngine().open(gunzipSync(body()));
	try {
		for (const statement of sql) {
			db.run(statement);
		}
		return gzipSync(db.exportBytes());
	} finally {
		db.close();
	}
}

async function outcomeOf(
	payload: Uint8Array,
	tagOverrides: Record<string, string> = {},
	options: Partial<DriveStateReadOptions> = {}
): Promise<string> {
	try {
		await readDriveState(
			{ txId: side.transaction.id, ownerAddress: side.transaction.owner, tags: tags(tagOverrides) },
			payload,
			{ expectedOwnerAddress: OWNER, protection: { kind: 'public' }, ...options }
		);
		return 'used';
	} catch (e) {
		if (e instanceof DriveStateRefused) {
			return e.outcome;
		}
		throw e;
	}
}

const otherOwner = `x${OWNER.slice(1)}`;

describe('drive state read guards', () => {
	it('reads the unchanged fixture', async () => {
		expect(await outcomeOf(await mutated())).to.equal('used');
	});

	it('refuses a Block-Start other than 0, even when tag and payload agree', async () => {
		expect(await outcomeOf(await mutated('UPDATE meta SET blockStart = 5'), { 'Block-Start': '5' })).to.equal(
			'coverage-mismatch'
		);
	});

	for (const [kind, sql] of [
		['view', 'CREATE VIEW sqlitexv AS SELECT 1'],
		['table', 'CREATE TABLE sqlitext (a)'],
		['index', 'CREATE INDEX sqlitexi ON file_entries(id)'],
		['trigger', 'CREATE TRIGGER sqlitextr AFTER INSERT ON meta BEGIN SELECT 1; END']
	]) {
		it(`refuses ${kind === 'index' ? 'an' : 'a'} ${kind} whose name merely starts like SQLite's own`, async () => {
			expect(await outcomeOf(await mutated(sql))).to.equal('integrity-failed');
		});
	}

	it('refuses a drive row naming someone other than the uploader', async () => {
		expect(await outcomeOf(await mutated(`UPDATE drives SET ownerAddress = '${otherOwner}'`))).to.equal(
			'integrity-failed'
		);
	});

	it('refuses meta naming someone other than the uploader', async () => {
		expect(await outcomeOf(await mutated(`UPDATE meta SET ownerAddress = '${otherOwner}'`))).to.equal(
			'integrity-failed'
		);
	});

	it('refuses a drive row whose privacy is not the drive the reader holds', async () => {
		expect(await outcomeOf(await mutated("UPDATE drives SET privacy = 'private'"))).to.equal('privacy-mismatch');
	});

	it('refuses meta whose privacy is not the drive the reader holds', async () => {
		expect(await outcomeOf(await mutated("UPDATE meta SET privacy = 'private'"))).to.equal('privacy-mismatch');
	});

	it('refuses meta naming another drive', async () => {
		expect(
			await outcomeOf(await mutated("UPDATE meta SET driveId = '00000000-0000-4000-8000-000000000000'"))
		).to.equal('integrity-failed');
	});

	it('refuses meta whose entity count alone is wrong', async () => {
		expect(await outcomeOf(await mutated('UPDATE meta SET entityCount = entityCount + 1'))).to.equal(
			'count-mismatch'
		);
	});

	it('refuses a transaction status no reader can apply', async () => {
		expect(
			await outcomeOf(await mutated("UPDATE transaction_statuses SET status = 'weird' WHERE status = 'pending'"))
		).to.equal('integrity-failed');
	});

	it('refuses a transaction listed twice', async () => {
		expect(
			await outcomeOf(
				await mutated(
					"INSERT INTO transaction_statuses SELECT id, 'failed' FROM transaction_statuses WHERE status = 'pending'"
				)
			)
		).to.equal('integrity-failed');
	});

	it('refuses everything when the expected owner is empty', async () => {
		expect(await outcomeOf(await mutated(), {}, { expectedOwnerAddress: '' })).to.equal('owner-mismatch');
	});
});

describe('turning drive state off', () => {
	const saved = process.env['ARDRIVE_DISABLE_DRIVE_STATE'];
	afterEach(() => {
		if (saved === undefined) {
			delete process.env['ARDRIVE_DISABLE_DRIVE_STATE'];
		} else {
			process.env['ARDRIVE_DISABLE_DRIVE_STATE'] = saved;
		}
	});

	it('is on by default, off per call, and off for the process with ARDRIVE_DISABLE_DRIVE_STATE=1', () => {
		delete process.env['ARDRIVE_DISABLE_DRIVE_STATE'];
		const dao = new ArFSDAOAnonymous(Arweave.init({ host: 'localhost', port: 443, protocol: 'https' }));
		expect(dao.isDriveStateEnabled()).to.equal(true);
		expect(dao.isDriveStateEnabled(false)).to.equal(false);

		process.env['ARDRIVE_DISABLE_DRIVE_STATE'] = '1';
		expect(dao.isDriveStateEnabled()).to.equal(false);
		expect(dao.isDriveStateEnabled(true)).to.equal(false);
	});
});

describe('DriveStateSource, after the reader accepts', () => {
	const params = { driveId: EID(DRIVE), owner: ADDR(OWNER), protection: { kind: 'public' as const } };
	const blockEnd = Number(tags()['Block-End']);

	function edge(id: string, tagOverrides: Record<string, string> = {}) {
		return {
			cursor: id,
			node: {
				id,
				owner: { address: OWNER },
				block: { height: 1, timestamp: 1 },
				tags: Object.entries(tags(tagOverrides)).map(([name, value]) => ({ name, value }))
			} as unknown as GQLNodeInterface
		};
	}

	function gatewayServing(edges: ReturnType<typeof edge>[], bodies: Record<string, Uint8Array>) {
		const gateway = new GatewayAPI({ gatewayUrl: new URL('https://gateway.invalid/') });
		stub(gateway, 'gqlRequest').resolves({ edges, pageInfo: { hasNextPage: false } });
		const fetch = stub(gateway, 'getTxDataBounded').callsFake(async (txId) => Buffer.from(bodies[`${txId}`]));
		return { gateway, fetch };
	}

	const source = (gateway: GatewayAPI, currentHeight?: () => Promise<number>) =>
		new DriveStateSource({ gatewayApi: gateway, cache: false, log: () => undefined, currentHeight });

	it('honours Block-End only up to the current height', async () => {
		const { gateway } = gatewayServing([edge('A'.repeat(43))], { ['A'.repeat(43)]: body() });

		const result = await source(gateway, async () => blockEnd - 1000).read(params);

		expect(result.outcome).to.equal('used');
		expect(result.contents!.blockEnd).to.equal(blockEnd - 1000);
		expect(result.coveredThroughBlock).to.equal(blockEnd - 1000 - 240);
		expect(result.detail).to.match(/honoured up to the current height/);
	});

	it('leaves a Block-End at or below the current height alone', async () => {
		const { gateway } = gatewayServing([edge('A'.repeat(43))], { ['A'.repeat(43)]: body() });

		const result = await source(gateway, async () => blockEnd + 5).read(params);

		expect(result.contents!.blockEnd).to.equal(blockEnd);
		expect(result.coveredThroughBlock).to.equal(blockEnd - 240);
	});

	it('does not use an artifact when the current height cannot be read', async () => {
		const { gateway } = gatewayServing([edge('A'.repeat(43))], { ['A'.repeat(43)]: body() });

		const result = await source(gateway, async () => {
			throw new Error('gateway down');
		}).read(params);

		expect(result.outcome).to.equal('fetch-failed');
		expect(result.contents).to.equal(undefined);
	});

	it('refuses an artifact whose rows make no valid entity, and tries the next', async () => {
		const bad = await mutated('UPDATE file_entries SET size = -5');
		const { gateway, fetch } = gatewayServing(
			[edge('G'.repeat(43)), edge('B'.repeat(43), { 'Block-End': `${blockEnd + 1}` })],
			{ ['B'.repeat(43)]: bad, ['G'.repeat(43)]: body() }
		);
		const convert = async (contents: { files: { size: number }[] }) => {
			if (contents.files.some((f) => f.size < 0)) {
				throw new Error('a negative size');
			}
			return 'entities';
		};

		const result = await source(gateway).read({ ...params, convert: convert as never });

		expect(fetch.getCalls().map((c) => `${c.args[0]}`)).to.deep.equal(['B'.repeat(43), 'G'.repeat(43)]);
		expect(result.outcome).to.equal('used');
		expect(result.txId).to.equal('G'.repeat(43));
		expect(result.converted).to.equal('entities');
	});

	it('finds the most entities any published drive state holds', async () => {
		const { gateway } = gatewayServing(
			[edge('A'.repeat(43), { 'Entity-Count': '40' }), edge('B'.repeat(43), { 'Entity-Count': '52' })],
			{}
		);

		expect(await source(gateway).largestPublished(params)).to.deep.equal({ txId: 'B'.repeat(43), entityCount: 52 });
	});
});

describe('building from a gateway that has not indexed the whole drive', () => {
	const owner = 'BuilderOwner000000000000000000000000000000a';
	const driveId = '11111111-2222-4333-8444-555555555555';
	const root = '11111111-2222-4333-8444-000000000001';

	function node(id: string, type: string, extra: Record<string, string>): GQLNodeInterface {
		return {
			id,
			owner: { address: owner },
			block: { height: 1000 },
			tags: Object.entries({
				ArFS: '0.15',
				'Entity-Type': type,
				'Drive-Id': driveId,
				'Unix-Time': '1700000000',
				...extra
			}).map(([name, value]) => ({ name, value }))
		} as unknown as GQLNodeInterface;
	}

	const nodes = [
		node('D'.repeat(43), 'drive', { 'Drive-Privacy': 'public' }),
		node('R'.repeat(43), 'folder', { 'Folder-Id': root }),
		node('F'.repeat(43), 'file', { 'File-Id': '11111111-2222-4333-8444-000000000002', 'Parent-Folder-Id': root })
	];
	const json: Record<string, Record<string, unknown>> = {
		['D'.repeat(43)]: { name: 'drive', rootFolderId: root },
		['R'.repeat(43)]: { name: 'drive' },
		['F'.repeat(43)]: { name: 'a.txt', size: 1, dataTxId: 'T'.repeat(43), lastModifiedDate: 1700000000000 }
	};
	const chain: DriveStateChain = {
		currentHeight: async () => 2000,
		driveNodes: async () => nodes.slice(0, 1),
		folderAndFileNodes: async () => nodes.slice(1),
		metadata: async (n) => json[n.id],
		minedTxIds: async (ids) => new Set(ids)
	};
	const build = (published?: { txId: string; entityCount: number }) =>
		buildDriveState({
			driveId,
			owner,
			protection: { kind: 'public' },
			producer: 'ArDrive-Core/test',
			chain,
			driveStateId: '11111111-2222-4333-8444-999999999999',
			published
		});

	it('refuses to publish fewer entities than a drive state already published', async () => {
		let refusal: unknown;
		try {
			await build({ txId: 'P'.repeat(43), entityCount: 4 });
		} catch (e) {
			refusal = e;
		}
		expect(refusal).to.be.instanceOf(DriveStateBuildRefused);
		expect((refusal as DriveStateBuildRefused).reason).to.equal('incomplete-index');
	});

	it('refuses a drive whose root folder the gateway did not return, which every reader would refuse', async () => {
		const withoutRoot = { ...chain, folderAndFileNodes: async () => nodes.slice(2) };
		let refusal: unknown;
		try {
			await buildDriveState({
				driveId,
				owner,
				protection: { kind: 'public' },
				producer: 'ArDrive-Core/test',
				chain: withoutRoot,
				driveStateId: '11111111-2222-4333-8444-999999999999'
			});
		} catch (e) {
			refusal = e;
		}
		expect(refusal).to.be.instanceOf(DriveStateBuildRefused);
		expect((refusal as DriveStateBuildRefused).reason).to.equal('incomplete-index');
	});

	it('publishes as many entities as the last one, or more', async () => {
		expect((await build({ txId: 'P'.repeat(43), entityCount: 3 })).entityCount).to.equal(3);
		expect((await build()).entityCount).to.equal(3);
	});
});
