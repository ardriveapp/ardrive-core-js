import { expect } from 'chai';
import { buildDriveState, DriveStateBuildRefused, DriveStateChain } from './drive_state_builder';
import { decodeCipherIV } from './drive_state_envelope';
import { DriveStateRefused } from './drive_state_outcome';
import { deriveDriveStateRows, ProducerEntity } from './drive_state_producer';
import { readDriveState } from './drive_state_reader';
import { GQLNodeInterface } from '../types/gql_Types';

const DRIVE = '6e5f8f5a-2d1b-4c3e-9a7b-0c1d2e3f4a5b';
const ROOT = '0f1e2d3c-4b5a-4968-8776-655443322110';
const FOLDER = '1a2b3c4d-0001-4000-8000-00000000d0c5';
const FILE = '2b3c4d5e-0001-4000-8000-0000000e9077';
const OWNER = 'fOVzBRTBnyt4VrUUYadBH8yras_-jhgpmNgg-5b3vEw';

let counter = 0;
const txId = () => `${counter++}`.padStart(43, 'T');

function entity(
	type: 'drive' | 'folder' | 'file',
	{
		unixTime,
		height = 100,
		tags = {},
		json
	}: { unixTime: number; height?: number; tags?: Record<string, string>; json: Record<string, unknown> }
): ProducerEntity {
	return {
		txId: txId(),
		ownerAddress: OWNER,
		blockHeight: height,
		bundledIn: null,
		tags: Object.entries({
			ArFS: '0.15',
			'Entity-Type': type,
			'Drive-Id': DRIVE,
			'Unix-Time': `${unixTime}`,
			'App-Name': 'ArDrive-CLI',
			...tags
		}).map(([name, value]) => ({ name, value })),
		json
	};
}

const drive = (unixTime: number, json: Record<string, unknown> = {}) =>
	entity('drive', {
		unixTime,
		tags: { 'Drive-Privacy': 'public' },
		json: { name: 'Drive', rootFolderId: ROOT, ...json }
	});
const folder = (unixTime: number, json: Record<string, unknown>, parent?: string, id = FOLDER) =>
	entity('folder', { unixTime, tags: { 'Folder-Id': id, ...(parent ? { 'Parent-Folder-Id': parent } : {}) }, json });
const file = (unixTime: number, json: Record<string, unknown>, parent = ROOT, extra: Record<string, string> = {}) =>
	entity('file', {
		unixTime,
		tags: { 'File-Id': FILE, 'Parent-Folder-Id': parent, ...extra },
		json: { name: 'a.txt', size: 1, dataTxId: 'D'.repeat(43), lastModifiedDate: 1700000000123, ...json }
	});

describe('deriving drive state rows the way ardrive-web does', () => {
	it('keeps a revision only when it changed something', () => {
		const rows = deriveDriveStateRows({
			driveId: DRIVE,
			drive: [drive(1), drive(2), drive(3, { name: 'Renamed' })],
			folders: [
				folder(10, { name: 'F' }, ROOT),
				folder(11, { name: 'F' }, ROOT),
				folder(12, { name: 'F', isHidden: true }, ROOT)
			],
			files: [
				file(20, {}),
				file(21, { name: 'b.txt' }),
				file(22, { name: 'b.txt' }, FOLDER),
				file(23, { name: 'b.txt' }, FOLDER),
				// A rename and a move at once is a rename: the app checks the name first.
				file(24, { name: 'c.txt' }, ROOT)
			]
		});

		expect(rows.drive_revisions.map((r) => r.action)).to.deep.equal(['create', 'rename']);
		expect(rows.folder_revisions.map((r) => r.action)).to.deep.equal(['create', 'hide']);
		expect(rows.file_revisions.map((r) => r.action)).to.deep.equal(['create', 'rename', 'move', 'rename']);
		expect(rows.file_entries[0]).to.include({ name: 'c.txt', parentFolderId: ROOT });
	});

	it('keeps a file revision only when it is strictly newer', () => {
		const rows = deriveDriveStateRows({
			driveId: DRIVE,
			drive: [drive(1)],
			folders: [],
			files: [file(20, {}, ROOT), file(20, { name: 'same-second.txt' }, ROOT)]
		});

		expect(rows.file_revisions).to.have.length(1);
		expect(rows.file_entries[0].name).to.equal('a.txt');
	});

	it('dates an entry by its oldest kept revision and names it by its newest', () => {
		const rows = deriveDriveStateRows({
			driveId: DRIVE,
			drive: [drive(1)],
			folders: [],
			files: [file(30, {}), file(40, { name: 'b.txt' })]
		});

		expect(rows.file_entries[0]).to.include({ name: 'b.txt', dateCreated: 30, lastUpdated: 40 });
	});

	it('reads Unix-Time above 10^10 as milliseconds and keeps seconds', () => {
		const rows = deriveDriveStateRows({
			driveId: DRIVE,
			drive: [drive(1_700_000_000_999)],
			folders: [],
			files: []
		});

		expect(rows.drive_revisions[0].dateCreated).to.equal(1_700_000_000);
	});

	it('writes custom metadata as the app does: a JSON object and an array of name and value', () => {
		const rows = deriveDriveStateRows({
			driveId: DRIVE,
			drive: [drive(1)],
			folders: [],
			files: [
				file(20, { department: 'finance', pinnedDataOwner: 'P'.repeat(43), assignedNames: ['n'] }, ROOT, {
					Topic: 'x',
					'Original-Owner': 'O'.repeat(43)
				})
			]
		});
		const row = rows.file_entries[0];

		expect(JSON.parse(row.customJsonMetadata as string)).to.deep.equal({
			department: 'finance',
			pinnedDataOwner: 'P'.repeat(43),
			assignedNames: ['n']
		});
		expect(JSON.parse(row.customGQLTags as string)).to.deep.equal([
			{ name: 'Topic', value: 'x' },
			{ name: 'Original-Owner', value: 'O'.repeat(43) }
		]);
		expect(row.assignedNames).to.equal('{"assignedNames":["n"]}');
		expect(row.pinnedDataOwnerAddress).to.equal('P'.repeat(43));
		expect(row.originalOwner).to.equal('O'.repeat(43));
		expect(row.lastModifiedDate).to.equal(1700000000);
	});

	it('puts a file with no Parent-Folder-Id in the root path, as the app does', () => {
		const orphan = file(20, {});
		orphan.tags = orphan.tags.filter((t) => t.name !== 'Parent-Folder-Id');

		const rows = deriveDriveStateRows({ driveId: DRIVE, drive: [drive(1)], folders: [], files: [orphan] });

		expect(rows.file_entries[0].parentFolderId).to.equal('');
	});
});

describe('building a drive state', () => {
	const node = (e: ProducerEntity): GQLNodeInterface =>
		({
			id: e.txId,
			owner: { address: e.ownerAddress },
			block: { height: e.blockHeight, timestamp: 0 },
			tags: e.tags
		}) as unknown as GQLNodeInterface;

	function chain(entities: ProducerEntity[], mined: (id: string) => boolean = () => true): DriveStateChain {
		const byId = new Map(entities.map((e) => [e.txId, e]));
		const nodes = entities.map(node);
		const isDrive = (n: GQLNodeInterface) => n.tags.find((t) => t.name === 'Entity-Type')?.value === 'drive';
		return {
			currentHeight: async () => 1_500_000,
			driveNodes: async () => nodes.filter(isDrive),
			folderAndFileNodes: async () => nodes.filter((n) => !isDrive(n)),
			metadata: async (n) => byId.get(n.id)!.json,
			minedTxIds: async (ids) => new Set(ids.filter(mined))
		};
	}

	const entities = () => [
		drive(1),
		folder(10, { name: 'Root' }, undefined, ROOT),
		folder(11, { name: 'F' }, ROOT),
		file(20, {})
	];

	async function build(
		protection: { kind: 'public' } | { kind: 'private'; driveKey: Uint8Array },
		c = chain(entities())
	) {
		return buildDriveState({
			driveId: DRIVE,
			owner: OWNER,
			protection,
			producer: 'ArDrive-Core/test',
			chain: c,
			driveStateId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
		});
	}

	function candidate(built: Awaited<ReturnType<typeof build>>) {
		return {
			txId: 'X'.repeat(43),
			ownerAddress: OWNER,
			tags: Object.fromEntries(built.tags.map((t) => [t.name, t.value]))
		};
	}

	it('builds a public drive state its own reader uses', async () => {
		const built = await build({ kind: 'public' });

		const contents = await readDriveState(candidate(built), built.sealed.body, {
			expectedOwnerAddress: OWNER,
			protection: { kind: 'public' }
		});

		expect(contents.entityCount).to.equal(4);
		expect(contents.blockEnd).to.equal(1_500_000);
		expect(contents.producer).to.equal('ArDrive-Core/test');
		expect(built.tags.map((t) => t.name)).to.deep.equal([
			'Entity-Type',
			'Drive-Id',
			'Drive-State-Id',
			'State-Version',
			'Content-Type',
			'Block-Start',
			'Block-End',
			'Data-Start',
			'Data-End',
			'Entity-Count'
		]);
	});

	it('seals a private drive state under the drive key', async () => {
		const key = Buffer.alloc(32, 9);
		const privateEntities = entities();
		privateEntities[0].tags = privateEntities[0].tags.map((t) =>
			t.name === 'Drive-Privacy' ? { ...t, value: 'private' } : t
		);

		const built = await build({ kind: 'private', driveKey: key }, chain(privateEntities));

		expect(decodeCipherIV(built.sealed.cipherIV!)).to.have.length(12);
		const contents = await readDriveState(candidate(built), built.sealed.body, {
			expectedOwnerAddress: OWNER,
			protection: { kind: 'private', driveKey: key }
		});
		expect(contents.drive.privacy).to.equal('private');
	});

	it('lists a data transaction it has not seen mined as pending', async () => {
		const built = await build(
			{ kind: 'public' },
			chain(entities(), () => false)
		);

		const contents = await readDriveState(candidate(built), built.sealed.body, {
			expectedOwnerAddress: OWNER,
			protection: { kind: 'public' }
		});
		expect([...contents.unconfirmed.values()]).to.deep.equal(['pending']);
		expect(built.unconfirmedDataTxs).to.equal(1);
	});

	async function refusedWith(promise: Promise<unknown>): Promise<string> {
		try {
			await promise;
		} catch (e) {
			if (e instanceof DriveStateBuildRefused) return e.reason;
			throw e;
		}
		throw new Error('expected a refusal');
	}

	it('refuses while a change is unmined', async () => {
		const c = chain(entities());
		const all = await c.folderAndFileNodes();
		c.folderAndFileNodes = async () => [
			...all,
			{ ...all[0], id: 'U'.repeat(43), block: null } as unknown as GQLNodeInterface
		];

		expect(await refusedWith(build({ kind: 'public' }, c))).to.equal('unconfirmed-changes');
	});

	it('refuses when any revision cannot be read', async () => {
		const c = chain(entities());
		c.metadata = async () => {
			throw new Error('gateway');
		};

		expect(await refusedWith(build({ kind: 'public' }, c))).to.equal('skipped-entities');
	});

	it('refuses a drive with nothing in it', async () => {
		expect(await refusedWith(build({ kind: 'public' }, chain([drive(1)])))).to.equal('empty-drive');
	});

	it('refuses to publish a private drive in the clear, or the reverse', async () => {
		expect(await refusedWith(build({ kind: 'private', driveKey: Buffer.alloc(32) }))).to.equal('no-drive');
	});

	it('never puts key material in the payload', async () => {
		const key = Buffer.alloc(32, 0x5a);
		const privateEntities = entities();
		privateEntities[0].tags = privateEntities[0].tags.map((t) =>
			t.name === 'Drive-Privacy' ? { ...t, value: 'private' } : t
		);
		const built = await build({ kind: 'private', driveKey: key }, chain(privateEntities));
		const contents = await readDriveState(candidate(built), built.sealed.body, {
			expectedOwnerAddress: OWNER,
			protection: { kind: 'private', driveKey: key }
		});

		const everything = JSON.stringify(contents);
		expect(everything).not.to.include(key.toString('hex'));
		expect(everything).not.to.include(key.toString('base64'));
	});

	it('is refused by a reader if it were tampered with', async () => {
		const built = await build({ kind: 'public' });
		const tags = candidate(built);
		tags.tags['Entity-Count'] = '99';

		let outcome = '';
		try {
			await readDriveState(tags, built.sealed.body, {
				expectedOwnerAddress: OWNER,
				protection: { kind: 'public' }
			});
		} catch (e) {
			outcome = (e as DriveStateRefused).outcome;
		}
		expect(outcome).to.equal('count-mismatch');
	});
});
