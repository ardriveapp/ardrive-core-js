/**
 * Building a drive's Drive State artifact from chain data, ready to upload.
 *
 * The producer refuses rather than publish a drive state it cannot vouch for:
 * an entity whose metadata could not be read, a metadata transaction not yet
 * mined, a drive with nothing in it, or a payload every reader would refuse
 * for its size. Each refusal is permanent money not spent.
 */
import { GQLNodeInterface } from '../types/gql_Types';
import { ArtifactEngine } from './artifact_engine';
import { DriveStateProtection, SealedDriveState, sealDriveState } from './drive_state_envelope';
import { DriveStateFormatVersion } from './drive_state_format_version';
import { buildDriveStateFile, deriveDriveStateRows, ProducerEntity, UnusableEntity } from './drive_state_producer';
import { DriveStateRefused } from './drive_state_outcome';
import { readDriveState } from './drive_state_reader';
import { DRIVE_STATE_CONTENT_TYPE, DRIVE_STATE_ENTITY_TYPE, DriveStateTagName } from './drive_state_tags';

export type DriveStateBuildRefusal =
	| 'skipped-entities'
	| 'unconfirmed-changes'
	| 'empty-drive'
	| 'no-drive'
	| 'too-large'
	| 'incomplete-index'
	| 'unreadable';

export class DriveStateBuildRefused extends Error {
	constructor(
		readonly reason: DriveStateBuildRefusal,
		readonly detail: string
	) {
		super(`${reason}: ${detail}`);
		this.name = 'DriveStateBuildRefused';
	}
}

/** How the builder reads the chain. Implemented by the DAOs. */
export interface DriveStateChain {
	/** The network's current block height. */
	currentHeight(): Promise<number>;
	/** Every revision of the drive entity, from its owner. */
	driveNodes(): Promise<GQLNodeInterface[]>;
	/** Every revision of every folder and file in the drive, from its owner. */
	folderAndFileNodes(): Promise<GQLNodeInterface[]>;
	/** A node's metadata JSON, decrypted for a private drive. Throws when it cannot be read. */
	metadata(node: GQLNodeInterface): Promise<Record<string, unknown>>;
	/** Which of [ids] are mined, as data transactions or bundled data items. */
	minedTxIds(ids: string[]): Promise<Set<string>>;
}

export interface BuildDriveStateParams {
	driveId: string;
	owner: string;
	protection: DriveStateProtection;
	/** `<App-Name>/<App-Version>`, recorded as `meta.producer`. */
	producer: string;
	chain: DriveStateChain;
	/** The `Drive-State-Id` tag. */
	driveStateId: string;
	engine?: ArtifactEngine;
	/** How many metadata fetches run at once. */
	concurrency?: number;
	/** Progress, for a person watching a large drive. */
	log?: (line: string) => void;
	/**
	 * The most entities a drive state already published for this drive holds.
	 * ArFS never deletes an entity, so a build with fewer was read from a
	 * gateway that has not indexed the whole drive, and is refused rather than
	 * published as the drive's state.
	 */
	published?: { txId: string; entityCount: number };
}

export interface BuiltDriveState {
	sealed: SealedDriveState;
	/**
	 * The Drive State tags, in the order ardrive-web writes them. The uploader
	 * adds `ArFS`, `App-Name` and `App-Version`.
	 */
	tags: { name: string; value: string }[];
	plaintextBytes: number;
	entityCount: number;
	blockEnd: number;
	/** Data transactions listed as pending for readers to check. */
	unconfirmedDataTxs: number;
	/** Metadata transactions dropped because they lacked a field a revision needs, as ardrive-web drops them. */
	dropped: string[];
}

async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await work(items[index]);
		}
	});
	await Promise.all(workers);
	return results;
}

/** A node as the drive state queries select it, with the bundle it was posted in. */
export type NodeWithBundle = GQLNodeInterface & { bundledIn?: { id: string } | null };

const entityTypeOf = (node: GQLNodeInterface) => node.tags?.find((t) => t.name === 'Entity-Type')?.value;

export async function buildDriveState({
	driveId,
	owner,
	protection,
	producer,
	chain,
	driveStateId,
	engine,
	concurrency = 30,
	log = () => undefined,
	published
}: BuildDriveStateParams): Promise<BuiltDriveState> {
	// Block-End first: the listing that follows can only be complete through a
	// height that existed before it started. Rows newer than the claim are
	// harmless; a claim newer than the rows would hide entities from readers.
	const blockEnd = await chain.currentHeight();
	if (!Number.isSafeInteger(blockEnd) || blockEnd <= 0) {
		throw new DriveStateBuildRefused('no-drive', `the network height ${blockEnd} is not usable`);
	}

	const [driveNodes, otherNodes] = await Promise.all([chain.driveNodes(), chain.folderAndFileNodes()]);
	log(
		`[drive-state] ${driveId}: ${driveNodes.length} drive and ${otherNodes.length} folder and file revisions found`
	);
	const allNodes = [...driveNodes, ...otherNodes];

	const unmined = allNodes.filter(
		(node) => !node.block || node.block.height === null || node.block.height === undefined
	);
	if (unmined.length > 0) {
		throw new DriveStateBuildRefused(
			'unconfirmed-changes',
			`${unmined.length} recent change(s) to this drive are still being confirmed on Arweave. Try again in a few minutes.`
		);
	}
	const foreign = allNodes.filter((node) => node.owner?.address !== owner);
	if (foreign.length > 0) {
		throw new DriveStateBuildRefused(
			'skipped-entities',
			`${foreign.length} revision(s) were not uploaded by the drive owner`
		);
	}

	const skipped: string[] = [];
	let done = 0;
	const entities = await mapLimited(allNodes, concurrency, async (node): Promise<ProducerEntity | undefined> => {
		try {
			const json = await chain.metadata(node);
			if (json === null || typeof json !== 'object' || Array.isArray(json)) {
				throw new Error('the metadata is not a JSON object');
			}
			return {
				txId: node.id,
				ownerAddress: node.owner.address,
				blockHeight: node.block!.height,
				bundledIn: (node as NodeWithBundle).bundledIn?.id ?? null,
				tags: (node.tags ?? []).map((t) => ({ name: t.name, value: t.value })),
				json
			};
		} catch {
			skipped.push(node.id);
			return undefined;
		} finally {
			done++;
			if (done % 1000 === 0) {
				log(`[drive-state] ${driveId}: read ${done} of ${allNodes.length} revisions`);
			}
		}
	});
	if (skipped.length > 0) {
		throw new DriveStateBuildRefused(
			'skipped-entities',
			`${skipped.length} revision(s) could not be read, such as ${skipped.slice(0, 3).join(', ')}; ` +
				'a drive state would publish them as missing'
		);
	}

	const byType = (type: string) =>
		entities.filter(
			(e): e is ProducerEntity => e !== undefined && entityTypeOf({ tags: e.tags } as GQLNodeInterface) === type
		);

	let rows;
	try {
		rows = deriveDriveStateRows({
			driveId,
			drive: byType('drive'),
			folders: byType('folder'),
			files: byType('file')
		});
	} catch (e) {
		if (e instanceof UnusableEntity) {
			throw new DriveStateBuildRefused('skipped-entities', e.message);
		}
		throw e;
	}
	if (rows.drives.length === 0) {
		throw new DriveStateBuildRefused('no-drive', `no drive entity for ${driveId} was found from ${owner}`);
	}
	if (rows.drives[0].privacy !== protection.kind) {
		throw new DriveStateBuildRefused(
			'no-drive',
			`drive ${driveId} is ${rows.drives[0].privacy}, and it was asked to be published as ${protection.kind}`
		);
	}
	if (rows.folder_entries.length + rows.file_entries.length === 0) {
		throw new DriveStateBuildRefused('empty-drive', `drive ${driveId} has no folders or files to publish`);
	}
	const found = rows.drives.length + rows.folder_entries.length + rows.file_entries.length;
	if (published && found < published.entityCount) {
		throw new DriveStateBuildRefused(
			'incomplete-index',
			`the gateway returned ${found} entities, and the drive state ${published.txId} already published ` +
				`for this drive holds ${published.entityCount}. Entities are never deleted, so this gateway has not ` +
				'indexed the whole drive. Use a gateway that has'
		);
	}

	// Data transactions: a reader trusts every one not listed, so only those the
	// chain shows mined go unlisted.
	const dataTxIds = [...rows.dataTxIds];
	const mined = new Set<string>();
	for (let i = 0; i < dataTxIds.length; i += 100) {
		for (const id of await chain.minedTxIds(dataTxIds.slice(i, i + 100))) {
			mined.add(id);
		}
	}
	const unconfirmed = dataTxIds.filter((id) => !mined.has(id));

	let file;
	try {
		file = await buildDriveStateFile(
			rows,
			{ driveId, ownerAddress: owner, privacy: protection.kind, blockEnd, producer },
			unconfirmed,
			engine
		);
	} catch (e) {
		throw new DriveStateBuildRefused('too-large', `${e instanceof Error ? e.message : e}`);
	}

	const sealed = await sealDriveState(file.bytes, protection);
	const tags = [
		{ name: DriveStateTagName.entityType, value: DRIVE_STATE_ENTITY_TYPE },
		{ name: DriveStateTagName.driveId, value: driveId },
		{ name: DriveStateTagName.driveStateId, value: driveStateId },
		{ name: DriveStateTagName.stateVersion, value: DriveStateFormatVersion.current.toString() },
		{ name: DriveStateTagName.contentType, value: DRIVE_STATE_CONTENT_TYPE },
		{ name: DriveStateTagName.blockStart, value: '0' },
		{ name: DriveStateTagName.blockEnd, value: `${blockEnd}` },
		// The rows carry dates, not block heights, so the honest claim is the
		// whole range they account for, as ardrive-web makes it.
		{ name: DriveStateTagName.dataStart, value: '0' },
		{ name: DriveStateTagName.dataEnd, value: `${blockEnd}` },
		{ name: DriveStateTagName.entityCount, value: `${file.entityCount}` },
		...(sealed.cipher
			? [
					{ name: DriveStateTagName.cipher, value: sealed.cipher },
					{ name: DriveStateTagName.cipherIV, value: sealed.cipherIV! }
				]
			: [])
	];

	// Read back as every reader will, before anything is paid for. A drive whose
	// root folder the gateway has not indexed, say, builds a file each reader
	// refuses; publishing it would cost the upload and help no one.
	try {
		await readDriveState(
			{
				txId: 'DriveStateSelfCheck00000000000000000000000',
				ownerAddress: owner,
				tags: Object.fromEntries(tags.map((t) => [t.name, t.value]))
			},
			sealed.body,
			{ expectedOwnerAddress: owner, protection, engine }
		);
	} catch (e) {
		if (e instanceof DriveStateRefused) {
			throw new DriveStateBuildRefused(
				e.detail.includes('root folder') ? 'incomplete-index' : 'unreadable',
				`every reader would refuse it (${e.outcome}): ${e.detail}`
			);
		}
		throw e;
	}

	return {
		sealed,
		tags,
		plaintextBytes: file.bytes.byteLength,
		entityCount: file.entityCount,
		blockEnd,
		unconfirmedDataTxs: unconfirmed.length,
		dropped: rows.dropped
	};
}
