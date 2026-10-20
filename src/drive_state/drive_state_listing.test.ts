import Arweave from 'arweave';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stub } from 'sinon';
import { stubPublicFile } from '../../tests/stubs';
import { ArFSDAOAnonymous } from '../arfs/arfsdao_anonymous';
import { ArFSPublicFile, ArFSPublicFolder } from '../arfs/arfs_entities';
import { ADDR, EID, TxID, UnixTime } from '../types';
import { GQLNodeInterface } from '../types/gql_Types';
import { GatewayAPI } from '../utils/gateway_api';
import { DriveStateCandidate, DriveStateContents, readDriveState } from './drive_state_reader';
import { DriveStateReadParams, DriveStateReadResult, DriveStateSource } from './drive_state_source';

const FIXTURES = join(__dirname, '../../tests/fixtures/drive_state');

function sidecar(name: string) {
	return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
}

function edgeFor(name: string, txId = sidecar(name).transaction.id) {
	const s = sidecar(name);
	return {
		cursor: txId,
		node: {
			id: txId,
			owner: { address: s.transaction.owner },
			block: { height: 1, timestamp: 1 },
			tags: s.transaction.tags
		} as unknown as GQLNodeInterface
	};
}

const fakeArweave = Arweave.init({ host: 'localhost', port: 443, protocol: 'https', timeout: 600000 });

/** A gateway that answers discovery with [edges] and serves [bodies] by id. */
function fakeGateway(edges: ReturnType<typeof edgeFor>[], bodies: Record<string, Buffer | Error>) {
	const gateway = new GatewayAPI({ gatewayUrl: new URL('https://gateway.invalid/') });
	const gql = stub(gateway, 'gqlRequest').resolves({ edges, pageInfo: { hasNextPage: false } });
	const fetch = stub(gateway, 'getTxDataBounded').callsFake(async (txId) => {
		const body = bodies[`${txId}`];
		if (!body || body instanceof Error) {
			throw body ?? new Error('404');
		}
		return body;
	});
	return { gateway, gql, fetch };
}

const OWNER = sidecar('public-gzip').reader.ownerAddress as string;
const DRIVE = sidecar('public-gzip').reader.driveId as string;
const bodyOf = (name: string) => readFileSync(join(FIXTURES, sidecar(name).body));

describe('DriveStateSource', () => {
	const params: DriveStateReadParams = { driveId: EID(DRIVE), owner: ADDR(OWNER), protection: { kind: 'public' } };
	const lines: string[] = [];
	const log = (line: string) => lines.push(line);

	beforeEach(() => lines.splice(0));

	it('reads the newest usable artifact and logs one line', async () => {
		const { gateway } = fakeGateway([edgeFor('public-gzip')], {
			[sidecar('public-gzip').transaction.id]: bodyOf('public-gzip')
		});

		const result = await new DriveStateSource({ gatewayApi: gateway, cache: false, log }).read(params);

		expect(result.outcome).to.equal('used');
		expect(result.coveredThroughBlock).to.equal(result.contents!.blockEnd - 240);
		expect(lines).to.have.length(1);
		expect(lines[0]).to.match(/^\[drive-state\] .*outcome=used$/);
	});

	it('says none-found when there is none, and discovery-failed when it could not ask', async () => {
		const empty = fakeGateway([], {});
		expect(
			(await new DriveStateSource({ gatewayApi: empty.gateway, cache: false, log }).read(params)).outcome
		).to.equal('none-found');

		const broken = fakeGateway([], {});
		broken.gql.rejects(new Error('gateway down'));
		const result = await new DriveStateSource({ gatewayApi: broken.gateway, cache: false, log }).read(params);
		expect(result.outcome).to.equal('none-found');
		expect(result.discoveryFailed).to.equal(true);
	});

	it('moves to the next candidate when one cannot be fetched or used', async () => {
		const newest = edgeFor('public-gzip', 'N'.repeat(43));
		newest.node.tags = newest.node.tags.map((t) => (t.name === 'Block-End' ? { ...t, value: '9999999' } : t));
		const corrupt = edgeFor('corrupt-page', 'C'.repeat(43));
		corrupt.node.tags = corrupt.node.tags.map((t) => (t.name === 'Block-End' ? { ...t, value: '9999998' } : t));
		const good = edgeFor('public-gzip');
		const { gateway, fetch } = fakeGateway([good, corrupt, newest], {
			['N'.repeat(43)]: new Error('timeout'),
			['C'.repeat(43)]: bodyOf('corrupt-page'),
			[good.node.id]: bodyOf('public-gzip')
		});

		const result = await new DriveStateSource({ gatewayApi: gateway, cache: false, log }).read(params);

		expect(fetch.getCalls().map((c) => `${c.args[0]}`)).to.deep.equal([
			'N'.repeat(43),
			'C'.repeat(43),
			good.node.id
		]);
		expect(result.outcome).to.equal('used');
		expect(result.attempts).to.equal(3);
	});

	it('ignores a node from another owner or drive', async () => {
		const stranger = edgeFor('public-gzip', 'S'.repeat(43));
		stranger.node.owner = { address: 'someone-else' } as GQLNodeInterface['owner'];
		const { gateway, fetch } = fakeGateway([stranger], {});

		const result = await new DriveStateSource({ gatewayApi: gateway, cache: false, log }).read(params);

		expect(result.outcome).to.equal('none-found');
		expect(fetch.called).to.equal(false);
	});

	it('does not download what a stateful caller already imported', async () => {
		const edge = edgeFor('public-gzip');
		const blockEnd = Number(edge.node.tags.find((t) => t.name === 'Block-End')!.value);
		const { gateway, fetch } = fakeGateway([edge], {});

		const result = await new DriveStateSource({ gatewayApi: gateway, cache: false, log }).read({
			...params,
			syncedToBlock: blockEnd,
			lastImported: { txId: edge.node.id, syncedThroughBlock: blockEnd }
		});

		expect(result.outcome).to.equal('range-already-covered');
		expect(fetch.called).to.equal(false);
	});
});

describe('listing from drive state', () => {
	async function contentsOf(name: string): Promise<DriveStateContents> {
		const s = sidecar(name);
		const tags: Record<string, string> = {};
		for (const tag of s.transaction.tags) tags[tag.name] ??= tag.value;
		const candidate: DriveStateCandidate = { txId: s.transaction.id, ownerAddress: s.transaction.owner, tags };
		return readDriveState(candidate, bodyOf(name), { expectedOwnerAddress: OWNER, protection: { kind: 'public' } });
	}

	type Internals = {
		getPublicDriveEntitiesViaDriveState(
			driveId: unknown,
			owner: unknown
		): Promise<{ folders: ArFSPublicFolder[]; files: ArFSPublicFile[] } | null>;
		fetchDriveSnapshotsWithBodies(...args: unknown[]): Promise<null>;
		getSnapshotTailNodes(...args: unknown[]): Promise<GQLNodeInterface[]>;
		buildPublicFoldersFromNodes(...args: unknown[]): Promise<ArFSPublicFolder[]>;
		buildPublicFilesFromNodes(...args: unknown[]): Promise<ArFSPublicFile[]>;
	};

	async function daoUsing(result: Partial<DriveStateReadResult>) {
		const dao = new ArFSDAOAnonymous(fakeArweave);
		dao.setDriveStateSource({
			read: async () => ({ attempts: 1, detail: '', ...result })
		} as unknown as DriveStateSource);
		const internals = dao as unknown as Internals;
		return { dao, internals };
	}

	it('takes the artifact as the base and lets a later revision replace its copy', async () => {
		const contents = await contentsOf('public-gzip');
		const { internals } = await daoUsing({
			outcome: 'used',
			contents,
			coveredThroughBlock: contents.blockEnd - 240
		});
		const snapshots = stub(internals, 'fetchDriveSnapshotsWithBodies').resolves(null);
		const tail = stub(internals, 'getSnapshotTailNodes').resolves([]);
		const report = contents.files.find((f) => f.name === 'report.pdf')!;
		const moved = stubPublicFile({
			fileId: EID(report.id),
			fileName: 'moved.pdf',
			parentFolderId: EID(contents.drive.rootFolderId),
			driveId: EID(DRIVE),
			txId: TxID('M'.repeat(43))
		});
		stub(internals, 'buildPublicFoldersFromNodes').resolves([]);
		stub(internals, 'buildPublicFilesFromNodes').resolves([moved]);

		const result = await internals.getPublicDriveEntitiesViaDriveState(EID(DRIVE), ADDR(OWNER));

		expect(snapshots.firstCall.args[2]).to.equal(contents.blockEnd - 240);
		expect(tail.firstCall.args[3]).to.deep.equal([{ minBlockHeight: contents.blockEnd - 240 + 1 }]);
		expect(result!.files).to.have.length(contents.files.length);
		const listed = result!.files.find((f) => `${f.fileId}` === report.id)!;
		expect(listed.name).to.equal('moved.pdf');
		expect(result!.folders).to.have.length(contents.folders.length);
	});

	it('is null, so the caller lists another way, when the drive has no usable artifact', async () => {
		const { internals } = await daoUsing({ outcome: 'none-found' });

		expect(await internals.getPublicDriveEntitiesViaDriveState(EID(DRIVE), ADDR(OWNER))).to.equal(null);
	});

	it('lists a moved file in its new folder only', async () => {
		const contents = await contentsOf('public-gzip');
		const { dao, internals } = await daoUsing({
			outcome: 'used',
			contents,
			coveredThroughBlock: contents.blockEnd - 240
		});
		stub(internals, 'fetchDriveSnapshotsWithBodies').resolves(null);
		stub(internals, 'getSnapshotTailNodes').resolves([]);
		stub(internals, 'buildPublicFoldersFromNodes').resolves([]);
		const report = contents.files.find((f) => f.name === 'report.pdf')!;
		// A later revision moved the report from its folder to the root.
		const moved = stubPublicFile({
			fileId: EID(report.id),
			fileName: 'report.pdf',
			parentFolderId: EID(contents.drive.rootFolderId),
			driveId: EID(DRIVE),
			txId: TxID('M'.repeat(43))
		});
		stub(internals, 'buildPublicFilesFromNodes').resolves([moved]);
		const docs = contents.folders.find((f) => f.id === report.parentFolderId)!;
		const docsFolder = (await internals.getPublicDriveEntitiesViaDriveState(EID(DRIVE), ADDR(OWNER)))!.folders.find(
			(f) => `${f.folderId}` === docs.id
		)!;
		stub(dao, 'getPublicFolder').resolves(docsFolder);

		const listing = await dao.listPublicFolder({
			folderId: EID(docs.id),
			maxDepth: 0,
			includeRoot: false,
			owner: ADDR(OWNER)
		});

		expect(listing.map((e) => e.name)).not.to.include('report.pdf');
	});

	it('on the snapshot path too, a file moved out of a folder is not listed there', async () => {
		const contents = await contentsOf('public-gzip');
		const dao = new ArFSDAOAnonymous(fakeArweave);
		const report = contents.files.find((f) => f.name === 'report.pdf')!;
		const docsId = EID(report.parentFolderId);
		const root = EID(contents.drive.rootFolderId);
		const revision = (parent: typeof root, txId: string, unixTime: number) => {
			const file = stubPublicFile({
				fileId: EID(report.id),
				fileName: 'report.pdf',
				parentFolderId: parent,
				driveId: EID(DRIVE),
				txId: TxID(txId.repeat(43))
			});
			(file as { unixTime: UnixTime }).unixTime = new UnixTime(unixTime);
			return file;
		};
		const docs = new ArFSPublicFolder(
			'',
			'',
			'',
			'application/json',
			EID(DRIVE),
			'Docs',
			TxID('D'.repeat(43)),
			new UnixTime(1),
			root,
			docsId
		);
		// Every revision, newest first, as the snapshot path returns them.
		stub(
			dao as unknown as { getPublicDriveEntitiesViaSnapshots: () => unknown },
			'getPublicDriveEntitiesViaSnapshots'
		).resolves({
			folders: [docs],
			files: [revision(root, 'B', 2), revision(docsId, 'A', 1)]
		});
		stub(dao, 'getPublicFolder').resolves(docs);

		const listing = await dao.listPublicFolder({
			folderId: docsId,
			maxDepth: 0,
			includeRoot: false,
			owner: ADDR(OWNER),
			useDriveState: false
		});

		expect(listing.map((e) => e.name)).not.to.include('report.pdf');
	});
});
