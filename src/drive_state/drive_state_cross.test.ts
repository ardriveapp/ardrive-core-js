import { expect } from 'chai';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildDriveState, DriveStateChain } from './drive_state_builder';
import { DriveStateCipher, nodeDriveStateCipher, setDriveStateCipher } from './drive_state_cipher';
import { ProducerEntity } from './drive_state_producer';
import { readDriveState } from './drive_state_reader';
import { defaultArtifactEngine } from './artifact_engine';
import { DRIVE_STATE_TABLES } from './drive_state_schema';
import { GQLNodeInterface } from '../types/gql_Types';

/**
 * Artifacts this package produces, for ardrive-web's importer to read: the
 * other half of the cross test. Written to `tests/fixtures/drive_state_from_core`
 * when DRIVE_STATE_WRITE_FIXTURES=1, in the same format as ardrive-web's golden
 * fixtures, and copied to ardrive-web's `test/fixtures/drive_state_from_core`.
 */
const OUT = join(__dirname, '../../tests/fixtures/drive_state_from_core');

const DRIVE = '7c1d2e3f-4a5b-4c6d-8e7f-001122334455';
const ROOT = '7c1d2e3f-0000-4000-8000-0000000000aa';
const DOCS = '7c1d2e3f-0001-4000-8000-0000000000bb';
const OWNER = 'CoreJsDriveStateFixtureOwner000000000000000';
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 13 + 5) % 256));
const NONCE = Buffer.from([0xfb, 0xef, 0xbe, 0xfb, 0xff, 0xff, 9, 8, 7, 6, 5, 4]);

let n = 0;
const tx = () => `CoreJsFixtureTx${`${n++}`.padStart(28, '0')}`;

function entity(
	type: string,
	unixTime: number,
	tags: Record<string, string>,
	json: Record<string, unknown>,
	height = 1000
): ProducerEntity {
	return {
		txId: tx(),
		ownerAddress: OWNER,
		blockHeight: height,
		bundledIn: tx(),
		tags: Object.entries({
			ArFS: '0.15',
			'Entity-Type': type,
			'Drive-Id': DRIVE,
			'Unix-Time': `${unixTime}`,
			...tags
		}).map(([name, value]) => ({ name, value })),
		json
	};
}

function driveEntities(privacy: 'public' | 'private'): ProducerEntity[] {
	n = 0;
	const fileTags = (id: string, parent: string) => ({ 'File-Id': id, 'Parent-Folder-Id': parent });
	return [
		entity('drive', 1700000000, { 'Drive-Privacy': privacy }, { name: 'Core drive', rootFolderId: ROOT }),
		entity('drive', 1700000100, { 'Drive-Privacy': privacy }, { name: 'Core drive renamed', rootFolderId: ROOT }),
		entity('folder', 1700000001, { 'Folder-Id': ROOT }, { name: 'Core drive' }),
		entity('folder', 1700000002, { 'Folder-Id': DOCS, 'Parent-Folder-Id': ROOT }, { name: 'Docs', topic: 'q3' }),
		entity('folder', 1700000003, { 'Folder-Id': DOCS, 'Parent-Folder-Id': ROOT }, { name: 'Docs', isHidden: true }),
		entity(
			'file',
			1700000010,
			{ ...fileTags('7c1d2e3f-1000-4000-8000-000000000001', ROOT), Topic: 'reports' },
			{
				name: 'report.pdf',
				size: 2048,
				dataTxId: 'CoreJsFixtureData0000000000000000000000001',
				dataContentType: 'application/pdf',
				lastModifiedDate: 1699999999123,
				department: 'finance'
			}
		),
		entity('file', 1700000020, fileTags('7c1d2e3f-1000-4000-8000-000000000001', DOCS), {
			name: 'report.pdf',
			size: 2048,
			dataTxId: 'CoreJsFixtureData0000000000000000000000001',
			dataContentType: 'application/pdf',
			lastModifiedDate: 1699999999123,
			thumbnail: {
				variants: [
					{
						name: 'thumbnail',
						txId: 'CoreJsFixtureThumb000000000000000000000001',
						size: 10,
						width: 4,
						height: 4
					}
				]
			},
			assignedNames: ['core_report']
		}),
		entity('file', 1700000030, fileTags('7c1d2e3f-1000-4000-8000-000000000002', ROOT), {
			name: 'pinned.jpg',
			size: 99,
			dataTxId: 'CoreJsFixturePinnedData00000000000000000002',
			pinnedDataOwner: 'CoreJsFixturePinnedOwner000000000000000000'
		}),
		entity(
			'file',
			1700000040,
			{ ...fileTags('7c1d2e3f-1000-4000-8000-000000000003', DOCS), 'Import-Source': 'arweave' },
			{
				name: 'imported.txt',
				size: 5,
				dataTxId: 'CoreJsFixtureData0000000000000000000000003',
				licenseTxId: 'CoreJsFixtureLicence000000000000000000003',
				fallbackTxId: 'CoreJsFixtureFallback00000000000000000003'
			}
		)
	];
}

function chain(entities: ProducerEntity[]): DriveStateChain {
	const byId = new Map(entities.map((e) => [e.txId, e]));
	const node = (e: ProducerEntity) =>
		({
			id: e.txId,
			owner: { address: OWNER },
			block: { height: e.blockHeight },
			tags: e.tags,
			bundledIn: { id: e.bundledIn }
		}) as unknown as GQLNodeInterface;
	const isDrive = (e: ProducerEntity) => e.tags.some((t) => t.name === 'Entity-Type' && t.value === 'drive');
	return {
		currentHeight: async () => 1_600_000,
		driveNodes: async () => entities.filter(isDrive).map(node),
		folderAndFileNodes: async () => entities.filter((e) => !isDrive(e)).map(node),
		metadata: async (nd) => byId.get(nd.id)!.json,
		// The third file's data is not mined yet.
		minedTxIds: async (ids) => new Set(ids.filter((id) => !id.endsWith('3')))
	};
}

const fixedNonce: DriveStateCipher = { ...nodeDriveStateCipher, newNonce: () => NONCE };

async function produce(privacy: 'public' | 'private') {
	setDriveStateCipher(fixedNonce);
	try {
		const built = await buildDriveState({
			driveId: DRIVE,
			owner: OWNER,
			protection: privacy === 'public' ? { kind: 'public' } : { kind: 'private', driveKey: KEY },
			producer: 'ArDrive-Core/cross-test',
			chain: chain(driveEntities(privacy)),
			driveStateId: '7c1d2e3f-9999-4000-8000-000000000000'
		});
		const tags = [
			...built.tags,
			{ name: 'ArFS', value: '0.15' },
			{ name: 'App-Name', value: 'ArDrive-Core' },
			{ name: 'App-Version', value: 'cross-test' },
			{ name: 'Unix-Time', value: '1792454400' }
		];
		const contents = await readDriveState(
			{
				txId: 'CoreJsDriveStateFixtureTransactionId0000000',
				ownerAddress: OWNER,
				tags: Object.fromEntries(tags.map((t) => [t.name, t.value]))
			},
			built.sealed.body,
			{
				expectedOwnerAddress: OWNER,
				protection: privacy === 'public' ? { kind: 'public' } : { kind: 'private', driveKey: KEY }
			}
		);
		return { built, tags, contents };
	} finally {
		setDriveStateCipher(nodeDriveStateCipher);
	}
}

async function tablesOf(plaintextBody: Uint8Array) {
	const db = await defaultArtifactEngine().open(plaintextBody);
	try {
		return Object.fromEntries(DRIVE_STATE_TABLES.map((t) => [t, db.all(`SELECT * FROM ${t} ORDER BY rowid`)]));
	} finally {
		db.close();
	}
}

describe('drive states this package produces, for ardrive-web to read', () => {
	for (const privacy of ['public', 'private'] as const) {
		it(`${privacy}: builds the same payload every time, and matches what is checked in`, async () => {
			const first = await produce(privacy);
			const again = await produce(privacy);
			expect(Buffer.from(again.built.sealed.body)).to.deep.equal(Buffer.from(first.built.sealed.body));

			const { gunzipBounded } = await import('./drive_state_envelope');
			const compressed =
				privacy === 'public'
					? first.built.sealed.body
					: await nodeDriveStateCipher.decrypt(KEY, NONCE, first.built.sealed.body);
			const plaintext = gunzipBounded(compressed);
			const sidecar = {
				name: `core-${privacy}`,
				description: `A ${privacy} drive state built by ardrive-core-js's producer.`,
				body: `core-${privacy}.bin`,
				transaction: {
					id: 'CoreJsDriveStateFixtureTransactionId0000000',
					owner: OWNER,
					tags: first.tags
				},
				reader: {
					driveId: DRIVE,
					ownerAddress: OWNER,
					privacy,
					driveKey:
						privacy === 'private'
							? KEY.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
							: null,
					syncedToBlock: 0
				},
				payloadSha256: createHash('sha256').update(plaintext).digest('hex'),
				expected: { outcome: 'used', tables: await tablesOf(plaintext) }
			};

			if (process.env['DRIVE_STATE_WRITE_FIXTURES'] === '1') {
				mkdirSync(OUT, { recursive: true });
				writeFileSync(join(OUT, `core-${privacy}.bin`), first.built.sealed.body);
				writeFileSync(join(OUT, `core-${privacy}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
			}

			expect(existsSync(join(OUT, `core-${privacy}.json`)), 'run with DRIVE_STATE_WRITE_FIXTURES=1').to.equal(
				true
			);
			const checkedIn = JSON.parse(readFileSync(join(OUT, `core-${privacy}.json`), 'utf8'));
			expect(checkedIn.payloadSha256).to.equal(sidecar.payloadSha256);
			expect(Buffer.from(readFileSync(join(OUT, `core-${privacy}.bin`)))).to.deep.equal(
				Buffer.from(first.built.sealed.body)
			);
			expect(first.contents.entityCount).to.equal(6);
		});
	}

	it('are all here', () => {
		expect(readdirSync(OUT).filter((f) => f.endsWith('.json'))).to.have.length(2);
	});
});
