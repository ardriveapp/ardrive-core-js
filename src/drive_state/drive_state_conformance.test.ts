import { expect } from 'chai';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DriveStateProtection } from './drive_state_envelope';
import { DriveStateRefused } from './drive_state_outcome';
import { DriveStateCandidate, DriveStateContents, readDriveState } from './drive_state_reader';

/**
 * The golden fixtures ardrive-web builds with its own producer and records
 * with its own importer's outcome (`test/fixtures/drive_state` there). This
 * reader must reach the same outcome on every one, and read the same rows from
 * every one ardrive-web uses.
 */
const FIXTURES = join(__dirname, '../../tests/fixtures/drive_state');

interface Sidecar {
	name: string;
	description: string;
	body: string;
	transaction: { id: string; owner: string; tags: { name: string; value: string }[] };
	reader: {
		driveId: string;
		ownerAddress: string;
		privacy: 'public' | 'private';
		driveKey: string | null;
		syncedToBlock: number;
	};
	payloadSha256: string | null;
	expected: { outcome: string; tables?: Record<string, Record<string, unknown>[]> };
}

/** ardrive-web's enum names, in this package's spelling. */
function kebab(outcome: string): string {
	return outcome.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function fixtures(): Sidecar[] {
	return readdirSync(FIXTURES)
		.filter((f) => f.endsWith('.json'))
		.map((f) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as Sidecar);
}

async function read(sidecar: Sidecar): Promise<{ outcome: string; contents?: DriveStateContents; detail?: string }> {
	const tags: Record<string, string> = {};
	for (const tag of sidecar.transaction.tags) {
		if (!(tag.name in tags)) {
			tags[tag.name] = tag.value;
		}
	}
	const candidate: DriveStateCandidate = {
		txId: sidecar.transaction.id,
		ownerAddress: sidecar.transaction.owner,
		tags
	};
	const protection: DriveStateProtection =
		sidecar.reader.privacy === 'private'
			? { kind: 'private', driveKey: Buffer.from(sidecar.reader.driveKey!, 'base64') }
			: { kind: 'public' };
	const body = readFileSync(join(FIXTURES, sidecar.body));
	try {
		const contents = await readDriveState(candidate, body, {
			expectedOwnerAddress: sidecar.reader.ownerAddress,
			protection,
			syncedToBlock: sidecar.reader.syncedToBlock
		});
		return { outcome: 'used', contents };
	} catch (e) {
		if (e instanceof DriveStateRefused) {
			return { outcome: e.outcome, detail: e.detail };
		}
		throw e;
	}
}

/** A row as the fixture's table holds it: booleans as 0 or 1, no reader-added fields. */
function asTableRow(row: object): Record<string, unknown> {
	const copy: Record<string, unknown> = { ...row };
	delete copy.metadataTxId;
	for (const [key, value] of Object.entries(copy)) {
		if (typeof value === 'boolean') {
			copy[key] = value ? 1 : 0;
		}
	}
	return copy;
}

describe('the golden drive state fixtures', () => {
	const all = fixtures();

	it('are all here', () => {
		expect(all.length).to.be.greaterThan(40);
	});

	for (const sidecar of all) {
		it(`${sidecar.name}: ${kebab(sidecar.expected.outcome)}`, async () => {
			const result = await read(sidecar);

			expect(result.outcome, `${sidecar.description}\n${result.detail ?? ''}`).to.equal(
				kebab(sidecar.expected.outcome)
			);

			if (result.contents && sidecar.expected.tables) {
				const tables = sidecar.expected.tables;
				expect(asTableRow(result.contents.drive)).to.deep.equal(tables.drives[0]);
				expect(result.contents.folders.map(asTableRow)).to.deep.equal(tables.folder_entries);
				expect(result.contents.files.map(asTableRow)).to.deep.equal(tables.file_entries);
				expect(result.contents.entityCount).to.equal(tables.meta[0].entityCount);
				expect(result.contents.producer).to.equal(tables.meta[0].producer);
			}
		});
	}
});
