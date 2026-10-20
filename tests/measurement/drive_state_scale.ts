/**
 * Measures Drive State at the sizes the implementation plan set targets for:
 * building and sealing an artifact, and opening one (decrypt, inflate, gate,
 * materialise entities), at 3,000 and 41,767 files, public and private.
 *
 * Not part of `yarn test`. Run before a release:
 *
 *   node -r ts-node/register/transpile-only tests/measurement/drive_state_scale.ts
 *
 * Each case runs in its own process so its peak RSS is its own. The drive has
 * the shape of ardrive-web's measurement drive (test/drive_state/
 * drive_state_scale_measurement_test.dart): files across 120 folders under a
 * root, one entity in 21 with a second revision, and ids at full entropy,
 * because counter-built ids compress far better than real ones.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildDriveState, DriveStateChain } from '../../src/drive_state/drive_state_builder';
import { privateEntitiesFromContents, publicEntitiesFromContents } from '../../src/drive_state/drive_state_entities';
import { DriveStateProtection } from '../../src/drive_state/drive_state_envelope';
import { readDriveState } from '../../src/drive_state/drive_state_reader';
import { EntityKey } from '../../src/types/entity_key';
import { GQLNodeInterface } from '../../src/types/gql_Types';

type Privacy = 'public' | 'private';

const SIZES = [3000, 41767];
const FOLDERS = 120;
const SECOND_REVISION_EVERY = 21;
const HEIGHT = 1_600_000;
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256));
const MIB = 1024 * 1024;

/** Targets from CORE_JS_AND_CLI_PLAN.md section 9.6, in seconds and MiB. */
const TARGETS: Record<number, { open: number; openRss: number; build: number; buildRss: number }> = {
	3000: { open: 0.4, openRss: 150, build: 0.5, buildRss: 150 },
	41767: { open: 3, openRss: 500, build: 4, buildRss: 600 }
};

/** A seeded PRNG (mulberry32), so every run measures the same drive. */
function prng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Node {
	node: GQLNodeInterface;
	json: Record<string, unknown>;
}

function measuredDrive(fileCount: number, privacy: Privacy) {
	const rng = prng(20260819);
	const pick = (s: string) => s[Math.floor(rng() * s.length)];
	const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
	const hex = (n: number) => Array.from({ length: n }, () => pick('0123456789abcdef')).join('');
	const txId = () => Array.from({ length: 43 }, () => pick(b64)).join('');
	const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
	const owner = txId();
	const driveId = uuid();
	const rootFolderId = uuid();
	const nouns = ['invoice', 'photo', 'scan', 'render', 'export', 'backup', 'contract', 'draft', 'notes'];
	const exts = ['.jpeg', '.png', '.pdf', '.mp4', '.zip', '.json'];

	const nodes: Node[] = [];
	let unixTime = 1709294400;
	let entities = 0;
	const add = (type: string, tags: Record<string, string>, json: Record<string, unknown>) => {
		const revisions = ++entities % SECOND_REVISION_EVERY === 0 ? 2 : 1;
		for (let r = 0; r < revisions; r++) {
			const id = txId();
			nodes.push({
				node: {
					id,
					owner: { address: owner },
					block: { height: HEIGHT - 1000 + (nodes.length % 1000) },
					bundledIn: { id: txId() },
					tags: Object.entries({
						ArFS: '0.15',
						'Entity-Type': type,
						'Drive-Id': driveId,
						'Unix-Time': `${unixTime++}`,
						...tags
					}).map(([name, value]) => ({ name, value }))
				} as unknown as GQLNodeInterface,
				json: r === 0 ? json : { ...json, name: `renamed ${json.name}` }
			});
		}
	};

	add('drive', { 'Drive-Privacy': privacy }, { name: 'my drive', rootFolderId });
	add('folder', { 'Folder-Id': rootFolderId }, { name: 'my drive' });
	const folderIds = Array.from({ length: FOLDERS }, uuid);
	folderIds.forEach((id, i) =>
		add('folder', { 'Folder-Id': id, 'Parent-Folder-Id': rootFolderId }, { name: `folder ${i}` })
	);
	for (let i = 0; i < fileCount; i++) {
		add(
			'file',
			{ 'File-Id': uuid(), 'Parent-Folder-Id': folderIds[i % FOLDERS] },
			{
				name: `${nouns[i % nouns.length]} ${i}${exts[i % exts.length]}`,
				size: 1000 + Math.floor(rng() * 5_000_000),
				lastModifiedDate: 1709294400000 + i,
				dataTxId: txId(),
				dataContentType: 'application/octet-stream'
			}
		);
	}
	return { driveId, owner, nodes };
}

function chainOf(nodes: Node[]): DriveStateChain {
	const byId = new Map(nodes.map((n) => [n.node.id, n.json]));
	const isDrive = (n: Node) => n.node.tags.some((t) => t.name === 'Entity-Type' && t.value === 'drive');
	return {
		currentHeight: async () => HEIGHT,
		driveNodes: async () => nodes.filter(isDrive).map((n) => n.node),
		folderAndFileNodes: async () => nodes.filter((n) => !isDrive(n)).map((n) => n.node),
		metadata: async (node) => byId.get(node.id)!,
		minedTxIds: async (ids) => new Set(ids)
	};
}

const protectionOf = (privacy: Privacy): DriveStateProtection =>
	privacy === 'public' ? { kind: 'public' } : { kind: 'private', driveKey: KEY };

/** The process's peak RSS so far, in bytes. */
const peakRss = () => process.resourceUsage().maxRSS * 1024;

function settle() {
	(global as unknown as { gc?: () => void }).gc?.();
	return process.memoryUsage().rss;
}

/** Child: builds and seals the drive, and writes the artifact to [out]. */
async function build(fileCount: number, privacy: Privacy, out: string) {
	const drive = measuredDrive(fileCount, privacy);
	const chain = chainOf(drive.nodes);
	const baseline = settle();
	const peakBefore = peakRss();
	const start = process.hrtime.bigint();
	const built = await buildDriveState({
		driveId: drive.driveId,
		owner: drive.owner,
		protection: protectionOf(privacy),
		producer: 'ArDrive-Core/measurement',
		chain,
		driveStateId: '00000000-0000-4000-8000-000000000000'
	});
	const seconds = Number(process.hrtime.bigint() - start) / 1e9;
	const peak = peakRss();
	writeFileSync(`${out}.bin`, built.sealed.body);
	writeFileSync(
		`${out}.json`,
		JSON.stringify({ owner: drive.owner, tags: built.tags, revisions: drive.nodes.length })
	);
	return {
		seconds,
		// A peak reached before the build (generating the input) would hide the build's own.
		rssMiB: peak > peakBefore ? (peak - baseline) / MIB : null,
		entityCount: built.entityCount,
		revisions: drive.nodes.length,
		plaintextMiB: built.plaintextBytes / MIB,
		sealedMiB: built.sealed.body.byteLength / MIB
	};
}

/** Child: opens the artifact at [out] and materialises its entities. */
async function open(privacy: Privacy, out: string) {
	const body = new Uint8Array(readFileSync(`${out}.bin`));
	const { owner, tags } = JSON.parse(readFileSync(`${out}.json`, 'utf8'));
	const candidate = {
		txId: 'MeasuredDriveStateTransaction00000000000000',
		ownerAddress: owner,
		tags: Object.fromEntries((tags as { name: string; value: string }[]).map((t) => [t.name, t.value]))
	};
	const baseline = settle();
	const peakBefore = peakRss();
	const start = process.hrtime.bigint();
	const contents = await readDriveState(candidate, body, {
		expectedOwnerAddress: owner,
		protection: protectionOf(privacy)
	});
	const read = Number(process.hrtime.bigint() - start) / 1e9;
	const entities =
		privacy === 'public'
			? publicEntitiesFromContents(contents)
			: await privateEntitiesFromContents(contents, new EntityKey(KEY));
	const seconds = Number(process.hrtime.bigint() - start) / 1e9;
	const peak = peakRss();
	return {
		seconds,
		readSeconds: read,
		rssMiB: peak > peakBefore ? (peak - baseline) / MIB : null,
		files: entities.files.length,
		folders: entities.folders.length
	};
}

function child(args: string[]) {
	const output = execFileSync(
		process.execPath,
		['--expose-gc', '-r', 'ts-node/register/transpile-only', __filename, ...args],
		{ encoding: 'utf8', maxBuffer: 64 * MIB, stdio: ['ignore', 'pipe', 'inherit'] }
	);
	return JSON.parse(output.trim().split('\n').pop()!);
}

const fmt = (n: number | null, digits = 2) => (n === null ? 'n/a' : n.toFixed(digits));
const verdict = (value: number | null, target: number) => (value === null ? '?' : value <= target ? 'ok' : 'OVER');

async function main() {
	const [mode, ...rest] = process.argv.slice(2);
	if (mode === 'build') {
		console.log(JSON.stringify(await build(Number(rest[0]), rest[1] as Privacy, rest[2])));
		return;
	}
	if (mode === 'open') {
		console.log(JSON.stringify(await open(rest[0] as Privacy, rest[1])));
		return;
	}

	const dir = mkdtempSync(join(tmpdir(), 'drive-state-scale-'));
	console.log(`node ${process.version}, ${process.platform} ${process.arch}`);
	for (const size of SIZES) {
		for (const privacy of ['public', 'private'] as Privacy[]) {
			const out = join(dir, `${size}-${privacy}`);
			const b = child(['build', `${size}`, privacy, out]);
			const o = child(['open', privacy, out]);
			const t = TARGETS[size];
			console.log(
				[
					`${size} files, ${privacy}: ${b.entityCount} entities from ${b.revisions} revisions,`,
					`${fmt(b.plaintextMiB)} MiB SQLite, ${fmt(b.sealedMiB)} MiB sealed`,
					`  build and seal: ${fmt(b.seconds)} s (target ${t.build}, ${verdict(b.seconds, t.build)}),` +
						` peak RSS +${fmt(b.rssMiB, 0)} MiB (target ${t.buildRss}, ${verdict(b.rssMiB, t.buildRss)})`,
					`  open:           ${fmt(o.seconds)} s (target ${t.open}, ${verdict(o.seconds, t.open)};` +
						` ${fmt(o.readSeconds)} s reading, the rest materialising),` +
						` peak RSS +${fmt(o.rssMiB, 0)} MiB (target ${t.openRss}, ${verdict(o.rssMiB, t.openRss)})`,
					`  opened ${o.files} files and ${o.folders} folders`
				].join('\n')
			);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
