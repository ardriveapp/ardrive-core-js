import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'fflate';
import { DriveStateFormatVersion } from './drive_state_format_version';
import { decodeCipherIV, encodeCipherIV, gunzipBounded, openDriveState, sealDriveState } from './drive_state_envelope';
import { DriveStateRefused } from './drive_state_outcome';
import { DriveStateCandidate, firstFolderCycle, readDriveState } from './drive_state_reader';
import { isUsableCandidate, orderCandidates } from './drive_state_discovery';
import {
	customJsonFromColumn,
	customTagsFromColumn,
	privateEntitiesFromContents,
	publicEntitiesFromContents
} from './drive_state_entities';
import { EntityKey } from '../types';
import { deriveFileKey } from '../utils/crypto';

const FIXTURES = join(__dirname, '../../tests/fixtures/drive_state');

function fixture(name: string) {
	const sidecar = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
	const tags: Record<string, string> = {};
	for (const tag of sidecar.transaction.tags) {
		tags[tag.name] ??= tag.value;
	}
	const candidate: DriveStateCandidate = {
		txId: sidecar.transaction.id,
		ownerAddress: sidecar.transaction.owner,
		tags
	};
	return {
		sidecar,
		candidate,
		body: readFileSync(join(FIXTURES, sidecar.body)),
		owner: sidecar.reader.ownerAddress as string,
		driveKey: sidecar.reader.driveKey ? Buffer.from(sidecar.reader.driveKey, 'base64') : undefined
	};
}

async function refusal(promise: Promise<unknown>): Promise<DriveStateRefused> {
	try {
		await promise;
	} catch (e) {
		if (e instanceof DriveStateRefused) {
			return e;
		}
		throw e;
	}
	throw new Error('expected a refusal');
}

describe('DriveStateFormatVersion', () => {
	it('parses major.minor and nothing adjacent to it', () => {
		expect(`${DriveStateFormatVersion.tryParse('0.2')}`).to.equal('0.2');
		for (const bad of ['1', '1.0.0', '01.0', '0.02', ' 0.2', '0.2 ', 'a.b', '', '1234567890.0']) {
			expect(DriveStateFormatVersion.tryParse(bad), bad).to.equal(undefined);
		}
	});

	it('reads only its own version while 0.x', () => {
		expect(DriveStateFormatVersion.tryParse('0.2')!.isReadableByThisBuild).to.equal(true);
		expect(DriveStateFormatVersion.tryParse('0.1')!.isOlderThanThisBuild).to.equal(true);
		expect(DriveStateFormatVersion.tryParse('0.3')!.isNewerThanThisBuild).to.equal(true);
		expect(DriveStateFormatVersion.tryParse('1.0')!.isNewerThanThisBuild).to.equal(true);
	});
});

describe('the drive state envelope', () => {
	const sqlite = Buffer.concat([Buffer.from('SQLite format 3\0', 'ascii'), Buffer.alloc(4080, 7)]);

	it('seals and opens a public body', async () => {
		const sealed = await sealDriveState(sqlite, { kind: 'public' });

		expect(sealed.cipher).to.equal(undefined);
		expect(Buffer.from(await openDriveState(sealed.body, {}, { kind: 'public' }))).to.deep.equal(sqlite);
	});

	it('seals and opens a private body under the drive key', async () => {
		const key = Buffer.alloc(32, 3);
		const sealed = await sealDriveState(sqlite, { kind: 'private', driveKey: key });

		expect(sealed.cipher).to.equal('AES256-GCM');
		expect(sealed.cipherIV).to.match(/^[A-Za-z0-9_-]{16}$/);
		const opened = await openDriveState(
			sealed.body,
			{ cipher: sealed.cipher, nonce: decodeCipherIV(sealed.cipherIV!) },
			{ kind: 'private', driveKey: key }
		);
		expect(Buffer.from(opened)).to.deep.equal(sqlite);
	});

	it('gzips the same payload to the same bytes', async () => {
		const a = await sealDriveState(sqlite, { kind: 'public' });
		const b = await sealDriveState(sqlite, { kind: 'public' });

		expect(Buffer.from(a.body)).to.deep.equal(Buffer.from(b.body));
	});

	it('refuses to seal a payload at the format bound', async () => {
		let threw = false;
		try {
			await sealDriveState(new Uint8Array(100 * 1024 * 1024), { kind: 'public' });
		} catch {
			threw = true;
		}
		expect(threw).to.equal(true);
	});

	it('stops inflating at the first byte past the bound', () => {
		const bomb = gzipSync(new Uint8Array(1024 * 1024), { level: 9 });

		expect(() => gunzipBounded(bomb, 1024 * 1024)).not.to.throw();
		expect(() => gunzipBounded(bomb, 1024 * 1024 - 1)).to.throw(/inflated past/);
	});

	it('refuses a raw SQLite file past the bound', async () => {
		const result = await refusal(openDriveState(sqlite, {}, { kind: 'public' }, sqlite.byteLength - 1));

		expect(result.outcome).to.equal('integrity-failed');
	});

	it('writes Cipher-IV as base64url and reads either alphabet', () => {
		const nonce = Uint8Array.from([0xfb, 0xef, 0xbe, 0xfb, 0xff, 0xff, 1, 2, 3, 4, 5, 6]);

		expect(encodeCipherIV(nonce)).to.equal('-----___AQIDBAUG');
		expect(Buffer.from(decodeCipherIV('-----___AQIDBAUG'))).to.deep.equal(Buffer.from(nonce));
		const standard = Buffer.from(nonce).toString('base64');
		expect(standard).to.match(/[+/]/);
		expect(Buffer.from(decodeCipherIV(standard))).to.deep.equal(Buffer.from(nonce));
		expect(() => decodeCipherIV('not base64!')).to.throw();
	});

	it('is refused, not decrypted, under the wrong privacy', async () => {
		const sealed = await sealDriveState(sqlite, { kind: 'public' });
		const result = await refusal(openDriveState(sealed.body, {}, { kind: 'private', driveKey: Buffer.alloc(32) }));

		expect(result.outcome).to.equal('privacy-mismatch');
	});
});

describe('reading a drive state', () => {
	it('refuses an artifact that would take a stateful reader backwards', async () => {
		const { candidate, body, owner } = fixture('public-gzip');
		const blockEnd = Number(candidate.tags['Block-End']);

		const result = await refusal(
			readDriveState(candidate, body, {
				expectedOwnerAddress: owner,
				protection: { kind: 'public' },
				syncedToBlock: blockEnd + 1
			})
		);
		expect(result.outcome).to.equal('range-already-covered');

		const equal = await readDriveState(candidate, body, {
			expectedOwnerAddress: owner,
			protection: { kind: 'public' },
			syncedToBlock: blockEnd
		});
		expect(equal.blockEnd).to.equal(blockEnd);
	});

	it('names the newest revision of each entity', async () => {
		const { candidate, body, owner } = fixture('public-gzip');
		const contents = await readDriveState(candidate, body, {
			expectedOwnerAddress: owner,
			protection: { kind: 'public' }
		});

		for (const entity of [...contents.folders, ...contents.files]) {
			expect(entity.metadataTxId, entity.id).to.match(/^[A-Za-z0-9_-]{43}$/);
		}
	});

	it('finds a folder cycle and nothing else', () => {
		expect(
			firstFolderCycle([
				{ id: 'a', parentFolderId: 'b' },
				{ id: 'b', parentFolderId: 'a' },
				{ id: 'c', parentFolderId: null }
			])
		).to.deep.equal(['a', 'b', 'a']);
		expect(
			firstFolderCycle([
				{ id: 'root', parentFolderId: null },
				{ id: 'a', parentFolderId: 'root' },
				{ id: 'b', parentFolderId: 'a' },
				{ id: 'orphan', parentFolderId: 'missing' }
			])
		).to.equal(undefined);
	});
});

describe('drive state rows as entities', () => {
	it('reads custom tags in the array shape ardrive-web writes', () => {
		const { tags, pinnedDataTxId } = customTagsFromColumn(
			JSON.stringify([
				{ name: 'Topic', value: 'a' },
				{ name: 'Topic', value: 'b' },
				{ name: 'App-Name', value: 'ArDrive-App' },
				{ name: 'Pinned-Data-Tx', value: 'x'.repeat(43) },
				{ name: 'Boost', value: '1.5' }
			]),
			'id'
		);

		expect(tags).to.deep.equal({ Topic: ['a', 'b'] });
		expect(pinnedDataTxId).to.equal('x'.repeat(43));
		expect(customTagsFromColumn('[]', 'id').tags).to.equal(undefined);
		expect(customTagsFromColumn(null, 'id').tags).to.equal(undefined);
	});

	it('keeps only the metadata fields core-js does not model', () => {
		expect(
			customJsonFromColumn('{"department":"finance","pinnedDataOwner":"o","name":"n"}', 'id', 'file')
		).to.deep.equal({ department: 'finance' });
		expect(customJsonFromColumn('{}', 'id', 'folder')).to.equal(undefined);
	});

	it('builds public entities with what GraphQL would have given', async () => {
		const { candidate, body, owner, sidecar } = fixture('public-gzip');
		const contents = await readDriveState(candidate, body, {
			expectedOwnerAddress: owner,
			protection: { kind: 'public' }
		});
		const { folders, files } = publicEntitiesFromContents(contents);

		expect(folders).to.have.length(sidecar.expected.tables.folder_entries.length);
		expect(files).to.have.length(sidecar.expected.tables.file_entries.length);

		const report = files.find((f) => f.name === 'report.pdf')!;
		const row = sidecar.expected.tables.file_entries.find((r: { name: string }) => r.name === 'report.pdf');
		expect(`${report.fileId}`).to.equal(row.id);
		expect(`${report.parentFolderId}`).to.equal(row.parentFolderId);
		expect(+report.lastModifiedDate).to.equal(row.lastModifiedDate * 1000);
		expect(+report.unixTime).to.equal(row.lastUpdated);
		expect(report.customMetaDataJson).to.deep.equal({ department: 'finance' });
		expect(report.customMetaDataGqlTags).to.deep.equal({ 'Fixture-Tag': 'report' });

		const pinned = files.find((f) => f.name === 'pinned.jpg')!;
		expect(pinned.pinnedDataOwner).to.equal('PinnedDataOwnerAddress00000000000000000000');

		const hidden = files.find((f) => f.name === 'old.txt')!;
		expect(hidden.isHidden).to.equal(true);

		const root = folders.find((f) => `${f.folderId}` === contents.drive.rootFolderId)!;
		expect(`${root.parentFolderId}`).to.equal('root folder');
	});

	it('skips a file filed under an empty parent instead of refusing the drive', async () => {
		const { candidate, body, owner } = fixture('public-gzip');
		const contents = await readDriveState(candidate, body, {
			expectedOwnerAddress: owner,
			protection: { kind: 'public' }
		});
		contents.files[0].parentFolderId = '';

		const { files } = publicEntitiesFromContents(contents);

		expect(files).to.have.length(contents.files.length - 1);
	});

	it('derives each private file key from the drive key', async () => {
		const { candidate, body, owner, driveKey } = fixture('private-gzip');
		const contents = await readDriveState(candidate, body, {
			expectedOwnerAddress: owner,
			protection: { kind: 'private', driveKey: driveKey! }
		});
		const key = new EntityKey(driveKey!);
		const { files } = await privateEntitiesFromContents(contents, key);

		for (const file of files) {
			const expected = await deriveFileKey(`${file.fileId}`, key);
			expect(file.fileKey.keyData.equals(expected.keyData)).to.equal(true);
		}
	});
});

describe('drive state discovery', () => {
	const candidate = (txId: string, blockEnd?: string, blockHeight?: number): DriveStateCandidate => ({
		txId,
		ownerAddress: 'owner',
		tags: {
			'Drive-Id': 'drive',
			'Entity-Type': 'drive-state',
			...(blockEnd === undefined ? {} : { 'Block-End': blockEnd })
		},
		blockHeight
	});

	it('tries the highest Block-End first, unreadable ones last', () => {
		const ordered = orderCandidates([
			candidate('a', '10', 50),
			candidate('b', undefined, 99),
			candidate('c', '30', 40),
			candidate('d', '30', 45)
		]);

		expect(ordered.map((c) => c.txId)).to.deep.equal(['d', 'c', 'a', 'b']);
	});

	it('drops a node the gateway should not have returned', () => {
		expect(isUsableCandidate(candidate('a', '1'), 'drive', 'owner')).to.equal(true);
		expect(isUsableCandidate(candidate('a', '1'), 'drive', 'someone-else')).to.equal(false);
		expect(isUsableCandidate(candidate('a', '1'), 'other-drive', 'owner')).to.equal(false);
	});
});
