/**
 * Producing a Drive State artifact from a drive's chain data.
 *
 * The rows are derived exactly as ardrive-web derives them when it syncs a
 * drive (`sync_repository.dart`, `*_revision.dart`, `*_entity.dart`), because
 * two producers that disagree on which metadata transactions become revisions,
 * or on what a column holds, publish two different histories of one drive:
 *
 *  - Revisions are taken oldest first. A drive or folder revision is kept when
 *    it changed something its last kept revision did not; a file revision also
 *    has to be strictly newer than the last kept one.
 *  - Two kept revisions of one entity in the same second are one row, the
 *    later winning, as the app's primary key makes them.
 *  - An entry is its newest kept revision, dated by its oldest.
 *  - Times are Unix seconds; `Unix-Time` above 10^10 is taken as milliseconds.
 *  - `customJsonMetadata` is the metadata JSON minus the keys ArFS defines, and
 *    `customGQLTags` the tags minus those ArFS defines, as an array of
 *    `{name, value}` in transaction order.
 */
import { ArtifactDatabase, ArtifactEngine, defaultArtifactEngine } from './artifact_engine';
import { DriveStateFormatVersion } from './drive_state_format_version';
import { DRIVE_STATE_SCHEMA, DRIVE_STATE_TABLES, DriveStateTable } from './drive_state_schema';
import { DRIVE_STATE_APPLICATION_ID, DRIVE_STATE_MAX_PLAINTEXT_BYTES } from './drive_state_tags';

/** One metadata transaction of the drive, with its decoded metadata JSON. */
export interface ProducerEntity {
	txId: string;
	ownerAddress: string;
	blockHeight: number;
	bundledIn: string | null;
	/** The transaction's tags, in order. */
	tags: { name: string; value: string }[];
	/** The metadata JSON, decrypted for a private drive. */
	json: Record<string, unknown>;
}

/** Why an entity's metadata could not be turned into a revision. */
export class UnusableEntity extends Error {}

const SHARED_RESERVED_TAGS = [
	'ArFS',
	'Drive-Id',
	'Entity-Type',
	'Content-Type',
	'Unix-Time',
	'Cipher',
	'Cipher-IV',
	'App-Name',
	'App-Version',
	'App-Platform',
	'Input',
	'Contract',
	'Bundle-Format',
	'Bundle-Version'
];

const RESERVED = {
	drive: {
		tags: new Set([...SHARED_RESERVED_TAGS, 'Drive-Privacy', 'Drive-Auth-Mode', 'Signature-Type']),
		json: new Set(['name', 'rootFolderId'])
	},
	folder: {
		tags: new Set([...SHARED_RESERVED_TAGS, 'Folder-Id', 'Parent-Folder-Id']),
		json: new Set(['name', 'isHidden'])
	},
	file: {
		tags: new Set([...SHARED_RESERVED_TAGS, 'File-Id', 'Parent-Folder-Id']),
		json: new Set(['name', 'size', 'lastModifiedDate', 'dataTxId', 'licenseTxId', 'dataContentType', 'isHidden'])
	}
};

function tag(entity: ProducerEntity, name: string): string | undefined {
	return entity.tags.find((t) => t.name === name)?.value;
}

/** The commit time in milliseconds: `Unix-Time`, as seconds unless it is too large to be. */
function commitTimeMs(entity: ProducerEntity): number {
	const raw = tag(entity, 'Unix-Time');
	if (raw === undefined || !/^-?[0-9]+$/.test(raw)) {
		throw new UnusableEntity(`${entity.txId} has no usable Unix-Time`);
	}
	const value = Number(raw);
	return value > 10_000_000_000 ? value : value * 1000;
}

const seconds = (ms: number) => Math.trunc(ms / 1000);

function customJson(entity: ProducerEntity, reserved: Set<string>): string {
	const kept: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entity.json)) {
		if (!reserved.has(key)) {
			kept[key] = value;
		}
	}
	return JSON.stringify(kept);
}

function customTags(entity: ProducerEntity, reserved: Set<string>): string {
	return JSON.stringify(
		entity.tags.filter((t) => !reserved.has(t.name)).map((t) => ({ name: t.name, value: t.value }))
	);
}

function optionalString(entity: ProducerEntity, key: string): string | null {
	const value = entity.json[key];
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'string') {
		throw new UnusableEntity(`${entity.txId}: ${key} is not a string`);
	}
	return value;
}

function optionalBool(entity: ProducerEntity, key: string): boolean | null {
	const value = entity.json[key];
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'boolean') {
		throw new UnusableEntity(`${entity.txId}: ${key} is not a boolean`);
	}
	return value;
}

function optionalInt(entity: ProducerEntity, key: string): number | null {
	const value = entity.json[key];
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new UnusableEntity(`${entity.txId}: ${key} is not an integer`);
	}
	return value;
}

/** `thumbnail`, normalised to the fields and order the app writes. */
function thumbnailColumn(entity: ProducerEntity): string | null {
	const value = entity.json['thumbnail'];
	if (value === undefined || value === null) {
		return null;
	}
	const variants = (value as { variants?: unknown }).variants;
	if (!Array.isArray(variants)) {
		throw new UnusableEntity(`${entity.txId}: thumbnail has no variants`);
	}
	return JSON.stringify({
		variants: variants.map((v: Record<string, unknown>) => {
			for (const [key, type] of [
				['name', 'string'],
				['txId', 'string'],
				['size', 'number'],
				['width', 'number'],
				['height', 'number']
			]) {
				if (typeof v?.[key] !== type) {
					throw new UnusableEntity(`${entity.txId}: thumbnail variant ${key} is not a ${type}`);
				}
			}
			return { name: v.name, txId: v.txId, size: v.size, width: v.width, height: v.height };
		})
	});
}

function assignedNamesColumn(entity: ProducerEntity): string | null {
	const value = entity.json['assignedNames'];
	if (value === undefined || value === null) {
		return null;
	}
	if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
		throw new UnusableEntity(`${entity.txId}: assignedNames is not a list of names`);
	}
	return JSON.stringify({ assignedNames: value });
}

type Row = Record<string, string | number | null>;

interface Revision {
	row: Row;
	dateCreatedMs: number;
}

/** The rows of every table but `meta` and `transaction_statuses`. */
export interface DriveStateRows {
	drives: Row[];
	folder_entries: Row[];
	file_entries: Row[];
	drive_revisions: Row[];
	folder_revisions: Row[];
	file_revisions: Row[];
	licenses: Row[];
	/** Every data transaction a kept file revision names. */
	dataTxIds: Set<string>;
	/** Entities whose metadata was well formed but lacked a field a revision needs, as the app drops them. */
	dropped: string[];
}

/**
 * Derives the artifact's rows from the drive's metadata transactions. [drive],
 * [folders] and [files] are every revision of each, in any order.
 */
export function deriveDriveStateRows({
	driveId,
	drive,
	folders,
	files
}: {
	driveId: string;
	drive: ProducerEntity[];
	folders: ProducerEntity[];
	files: ProducerEntity[];
}): DriveStateRows {
	const dropped: string[] = [];
	const oldestFirst = (entities: ProducerEntity[]) =>
		entities
			.map((entity, index) => ({ entity, index, ms: commitTimeMs(entity) }))
			.sort((a, b) => a.entity.blockHeight - b.entity.blockHeight || a.ms - b.ms || a.index - b.index);

	// The drive.
	const driveRevisions: Revision[] = [];
	let driveSignatureType: string | null = null;
	for (const { entity, ms } of oldestFirst(drive)) {
		const name = optionalString(entity, 'name');
		const rootFolderId = optionalString(entity, 'rootFolderId');
		if (name === null || rootFolderId === null) {
			dropped.push(entity.txId);
			continue;
		}
		const isHidden = optionalBool(entity, 'isHidden');
		const previous = driveRevisions[driveRevisions.length - 1]?.row;
		const action =
			previous === undefined
				? 'create'
				: name !== previous.name
					? 'rename'
					: isHidden !== null && (previous.isHidden === 1) !== isHidden
						? isHidden
							? 'hide'
							: 'unhide'
						: null;
		if (action === null) {
			continue;
		}
		driveSignatureType = tag(entity, 'Signature-Type') ?? '1';
		driveRevisions.push({
			dateCreatedMs: ms,
			row: {
				driveId,
				rootFolderId,
				ownerAddress: entity.ownerAddress,
				name,
				privacy: tag(entity, 'Drive-Privacy') ?? 'public',
				metadataTxId: entity.txId,
				dateCreated: seconds(ms),
				action,
				bundledIn: entity.bundledIn,
				customJsonMetadata: customJson(entity, RESERVED.drive.json),
				customGQLTags: customTags(entity, RESERVED.drive.tags),
				isHidden: isHidden ? 1 : 0
			}
		});
	}

	// Folders: kept when they change something, no date check.
	const folderRevisions = new Map<string, Revision[]>();
	for (const { entity, ms } of oldestFirst(folders)) {
		const folderId = tag(entity, 'Folder-Id');
		const name = optionalString(entity, 'name');
		if (folderId === undefined || name === null) {
			dropped.push(entity.txId);
			continue;
		}
		const parentFolderId = tag(entity, 'Parent-Folder-Id') ?? null;
		const isHidden = optionalBool(entity, 'isHidden');
		const kept = folderRevisions.get(folderId) ?? [];
		const previous = kept[kept.length - 1]?.row;
		const action =
			previous === undefined
				? 'create'
				: name !== previous.name
					? 'rename'
					: parentFolderId !== previous.parentFolderId
						? 'move'
						: isHidden === true && previous.isHidden === 0
							? 'hide'
							: isHidden === false && previous.isHidden === 1
								? 'unhide'
								: null;
		if (action === null) {
			continue;
		}
		kept.push({
			dateCreatedMs: ms,
			row: {
				folderId,
				driveId,
				name,
				parentFolderId,
				metadataTxId: entity.txId,
				dateCreated: seconds(ms),
				action,
				customJsonMetadata: customJson(entity, RESERVED.folder.json),
				customGQLTags: customTags(entity, RESERVED.folder.tags),
				isHidden: isHidden ? 1 : 0
			}
		});
		folderRevisions.set(folderId, kept);
	}

	// Files: kept when they change something and are strictly newer.
	const fileRevisions = new Map<string, Revision[]>();
	for (const { entity, ms } of oldestFirst(files)) {
		const fileId = tag(entity, 'File-Id');
		const name = optionalString(entity, 'name');
		const size = optionalInt(entity, 'size');
		const dataTxId = optionalString(entity, 'dataTxId');
		if (fileId === undefined || name === null || size === null || dataTxId === null) {
			dropped.push(entity.txId);
			continue;
		}
		// A file with no Parent-Folder-Id goes in the drive's root path, as the app puts it.
		const parentFolderId = tag(entity, 'Parent-Folder-Id') ?? '';
		const isHidden = optionalBool(entity, 'isHidden');
		const licenseTxId = optionalString(entity, 'licenseTxId');
		const fallbackTxId = optionalString(entity, 'fallbackTxId');
		const importSource = tag(entity, 'Import-Source') ?? null;
		const thumbnail = thumbnailColumn(entity);
		const assignedNames = assignedNamesColumn(entity);
		const lastModifiedMs = optionalInt(entity, 'lastModifiedDate') ?? ms;

		const kept = fileRevisions.get(fileId) ?? [];
		const latest = kept[kept.length - 1];
		const previous = latest?.row;
		let action: string | null;
		if (previous === undefined) {
			action = importSource !== null ? 'bulk-import' : 'create';
		} else if (fallbackTxId !== null && fallbackTxId !== previous.fallbackTxId) {
			action = 'upload-new-version';
		} else if (name !== previous.name) {
			action = 'rename';
		} else if (parentFolderId !== previous.parentFolderId) {
			action = 'move';
		} else if (dataTxId !== previous.dataTxId) {
			action = 'upload-new-version';
		} else if (licenseTxId !== previous.licenseTxId) {
			action = 'assert-license';
		} else if (isHidden === true && previous.isHidden === 0) {
			action = 'hide';
		} else if (isHidden === false && previous.isHidden === 1) {
			action = 'unhide';
		} else if (thumbnail !== null && thumbnail !== previous.thumbnail) {
			action = 'create-thumbnail';
		} else if (assignedNames !== null) {
			const before =
				previous.assignedNames === null
					? null
					: (JSON.parse(previous.assignedNames as string).assignedNames as string[]);
			const now = JSON.parse(assignedNames).assignedNames as string[];
			action = before === null || now.length > before.length ? 'assign-name' : null;
		} else if (previous.importSource === null && importSource !== null) {
			action = 'bulk-import';
		} else {
			action = null;
		}
		if (action === null) {
			continue;
		}
		if (latest !== undefined && !(ms > latest.dateCreatedMs)) {
			continue;
		}
		kept.push({
			dateCreatedMs: ms,
			row: {
				fileId,
				driveId,
				name,
				parentFolderId,
				size,
				lastModifiedDate: seconds(lastModifiedMs),
				dataContentType: optionalString(entity, 'dataContentType'),
				metadataTxId: entity.txId,
				dataTxId,
				licenseTxId,
				thumbnail,
				bundledIn: entity.bundledIn,
				dateCreated: seconds(ms),
				customJsonMetadata: customJson(entity, RESERVED.file.json),
				customGQLTags: customTags(entity, RESERVED.file.tags),
				action,
				pinnedDataOwnerAddress: optionalString(entity, 'pinnedDataOwner'),
				isHidden: isHidden ? 1 : 0,
				assignedNames,
				fallbackTxId,
				originalOwner: tag(entity, 'Original-Owner') ?? null,
				importSource
			}
		});
		fileRevisions.set(fileId, kept);
	}

	/** One row per entity and second, the later winning, as the app's primary key makes them. */
	const collapse = (revisions: Revision[]): Revision[] => {
		const bySecond = new Map<number, Revision>();
		for (const revision of revisions) {
			bySecond.set(revision.row.dateCreated as number, revision);
		}
		return [...bySecond.values()];
	};

	const driveRows = collapse(driveRevisions);
	const drives: Row[] = [];
	if (driveRows.length > 0) {
		const latest = driveRows[driveRows.length - 1].row;
		drives.push({
			id: driveId,
			rootFolderId: latest.rootFolderId,
			ownerAddress: latest.ownerAddress,
			name: latest.name,
			privacy: latest.privacy,
			bundledIn: latest.bundledIn,
			customJsonMetadata: latest.customJsonMetadata,
			customGQLTags: latest.customGQLTags,
			isHidden: latest.isHidden,
			signatureType: driveSignatureType,
			dateCreated: driveRows[0].row.dateCreated,
			lastUpdated: latest.dateCreated
		});
	}

	const folderEntries: Row[] = [];
	const folderRevisionRows: Row[] = [];
	for (const [folderId, revisions] of folderRevisions) {
		const rows = collapse(revisions);
		folderRevisionRows.push(...rows.map((r) => r.row));
		const latest = rows[rows.length - 1].row;
		folderEntries.push({
			id: folderId,
			driveId,
			name: latest.name,
			parentFolderId: latest.parentFolderId,
			dateCreated: rows[0].row.dateCreated,
			lastUpdated: latest.dateCreated,
			customJsonMetadata: latest.customJsonMetadata,
			customGQLTags: latest.customGQLTags,
			isHidden: latest.isHidden
		});
	}

	const fileEntries: Row[] = [];
	const fileRevisionRows: Row[] = [];
	const dataTxIds = new Set<string>();
	for (const [fileId, revisions] of fileRevisions) {
		const rows = collapse(revisions);
		fileRevisionRows.push(...rows.map((r) => r.row));
		for (const { row } of rows) {
			dataTxIds.add(row.dataTxId as string);
		}
		const latest = rows[rows.length - 1].row;
		fileEntries.push({
			id: fileId,
			driveId,
			name: latest.name,
			parentFolderId: latest.parentFolderId,
			size: latest.size,
			lastModifiedDate: latest.lastModifiedDate,
			dataContentType: latest.dataContentType,
			dataTxId: latest.dataTxId,
			licenseTxId: latest.licenseTxId,
			bundledIn: latest.bundledIn,
			thumbnail: latest.thumbnail,
			pinnedDataOwnerAddress: latest.pinnedDataOwnerAddress,
			customJsonMetadata: latest.customJsonMetadata,
			customGQLTags: latest.customGQLTags,
			isHidden: latest.isHidden,
			dateCreated: rows[0].row.dateCreated,
			lastUpdated: latest.dateCreated,
			assignedNames: latest.assignedNames,
			fallbackTxId: latest.fallbackTxId,
			originalOwner: latest.originalOwner,
			importSource: latest.importSource
		});
	}

	return {
		drives,
		folder_entries: folderEntries,
		file_entries: fileEntries,
		drive_revisions: driveRows.map((r) => r.row),
		folder_revisions: folderRevisionRows,
		file_revisions: fileRevisionRows,
		// Licence details are read on demand by readers, from each file's licenseTxId.
		licenses: [],
		dataTxIds,
		dropped
	};
}

export interface DriveStateMeta {
	driveId: string;
	ownerAddress: string;
	privacy: 'public' | 'private';
	blockEnd: number;
	/** `<App-Name>/<App-Version>` of the producer. */
	producer: string;
}

/**
 * Writes [rows] into a fresh database, built up from the format's own DDL and
 * never copied from another database, and returns its bytes.
 *
 * [unconfirmed] lists the data transactions the producer has not seen
 * confirmed; each travels as `pending`, for a reader to check again.
 */
export async function buildDriveStateFile(
	rows: DriveStateRows,
	meta: DriveStateMeta,
	unconfirmed: Iterable<string>,
	engine: ArtifactEngine = defaultArtifactEngine()
): Promise<{ bytes: Uint8Array; entityCount: number }> {
	const db: ArtifactDatabase = await engine.create();
	try {
		db.run(`PRAGMA application_id = ${DRIVE_STATE_APPLICATION_ID}`);
		db.run('BEGIN');
		for (const table of DRIVE_STATE_TABLES) {
			db.run(DRIVE_STATE_SCHEMA[table]);
		}
		const insert = (table: DriveStateTable, row: Row) => {
			const columns = Object.keys(row);
			db.run(
				`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
				columns.map((c) => row[c])
			);
		};
		for (const table of [
			'drives',
			'folder_entries',
			'file_entries',
			'drive_revisions',
			'folder_revisions',
			'file_revisions',
			'licenses'
		] as const) {
			for (const row of rows[table]) {
				insert(table, row);
			}
		}
		for (const id of new Set(unconfirmed)) {
			insert('transaction_statuses', { id, status: 'pending' });
		}
		const entityCount = rows.folder_entries.length + rows.file_entries.length + rows.drives.length;
		insert('meta', {
			version: DriveStateFormatVersion.current.toString(),
			driveId: meta.driveId,
			ownerAddress: meta.ownerAddress,
			privacy: meta.privacy,
			blockStart: 0,
			blockEnd: meta.blockEnd,
			entityCount,
			producer: meta.producer
		});
		db.run('COMMIT');
		const bytes = db.exportBytes();
		if (bytes.byteLength >= DRIVE_STATE_MAX_PLAINTEXT_BYTES) {
			throw new Error(
				`the drive state is ${bytes.byteLength} bytes, at or above the ${DRIVE_STATE_MAX_PLAINTEXT_BYTES} byte limit every reader enforces`
			);
		}
		return { bytes, entityCount };
	} finally {
		db.close();
	}
}
