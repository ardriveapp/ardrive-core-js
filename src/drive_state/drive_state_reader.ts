/**
 * Reading a Drive State artifact: every check a reader makes before it trusts
 * a row, in the order ardrive-web's importer makes them, so the same artifact
 * gets the same outcome in either client.
 *
 *  1. The tags, against the reader's own record of the drive.
 *  2. The envelope: decrypt (private), detect gzip, inflate within the bound.
 *  3. The database: integrity check, application id, exactly the nine tables.
 *  4. The rows: declared types, one row per file, one drive and one meta row,
 *     a real block range, applicable transaction statuses.
 *  5. The payload's claims against the tags and the drive.
 *
 * Every refusal is a {@link DriveStateRefused} carrying the outcome. Nothing
 * here throws anything else for a malformed artifact.
 */
import { ArtifactDatabase, ArtifactEngine, ArtifactRow, defaultArtifactEngine } from './artifact_engine';
import { decodeCipherIV, DriveStateProtection, openDriveState } from './drive_state_envelope';
import { DriveStateFormatVersion } from './drive_state_format_version';
import { DriveStateRefused, refuse } from './drive_state_outcome';
import {
	DRIVE_STATE_COLUMNS,
	DRIVE_STATE_SCHEMA,
	DRIVE_STATE_TABLES,
	driveStateColumnHolds,
	driveStateColumnKind,
	DriveStateTable
} from './drive_state_schema';
import { DRIVE_STATE_APPLICATION_ID, DRIVE_STATE_MAX_PLAINTEXT_BYTES, DriveStateTagName } from './drive_state_tags';

/** A Drive State transaction as discovery found it: its id, owner and tags. */
export interface DriveStateCandidate {
	txId: string;
	/** The transaction's owner, as the gateway reports it. */
	ownerAddress: string;
	/** The transaction's tags. Where a name repeats, the first value wins. */
	tags: Readonly<Record<string, string>>;
	/** The height the transaction was mined at, when known. */
	blockHeight?: number;
}

export interface DriveStateReadOptions {
	/** The drive's owner: the wallet that created its first drive entity. */
	expectedOwnerAddress: string;
	/** What the reader's own record of the drive says about its encryption. */
	protection: DriveStateProtection;
	/**
	 * The height the caller has already synced the drive to. An artifact that
	 * ends below it would take the drive backwards and is refused. Omit when
	 * the caller holds no state, as a listing does.
	 */
	syncedToBlock?: number;
	/** Folder ids the caller already holds, which a root folder may resolve to. */
	knownFolderIds?: ReadonlySet<string>;
	engine?: ArtifactEngine;
	/** Tests only: a smaller bound than the format's, to exercise it cheaply. */
	maxPlaintextBytes?: number;
}

export interface DriveStateDriveRow {
	id: string;
	rootFolderId: string;
	ownerAddress: string;
	name: string;
	privacy: string;
	bundledIn: string | null;
	customJsonMetadata: string | null;
	customGQLTags: string | null;
	isHidden: boolean;
	signatureType: string | null;
	/** Unix seconds. */
	dateCreated: number;
	/** Unix seconds. */
	lastUpdated: number;
}

export interface DriveStateFolderRow {
	id: string;
	driveId: string;
	name: string;
	parentFolderId: string | null;
	dateCreated: number;
	lastUpdated: number;
	customJsonMetadata: string | null;
	customGQLTags: string | null;
	isHidden: boolean;
	/** The metadata transaction of the folder's newest revision, or null when none travels. */
	metadataTxId: string | null;
}

export interface DriveStateFileRow {
	id: string;
	driveId: string;
	name: string;
	parentFolderId: string;
	size: number;
	/** Unix seconds. */
	lastModifiedDate: number;
	dataContentType: string | null;
	dataTxId: string;
	licenseTxId: string | null;
	bundledIn: string | null;
	thumbnail: string | null;
	pinnedDataOwnerAddress: string | null;
	customJsonMetadata: string | null;
	customGQLTags: string | null;
	isHidden: boolean;
	dateCreated: number;
	lastUpdated: number;
	assignedNames: string | null;
	fallbackTxId: string | null;
	originalOwner: string | null;
	importSource: string | null;
	/** The metadata transaction of the file's newest revision, or null when none travels. */
	metadataTxId: string | null;
}

/** What a reader takes from an artifact that passed every check. */
export interface DriveStateContents {
	txId: string;
	version: string;
	blockStart: number;
	blockEnd: number;
	entityCount: number;
	producer: string;
	drive: DriveStateDriveRow;
	folders: DriveStateFolderRow[];
	files: DriveStateFileRow[];
	/**
	 * Transactions the producer had not seen confirmed, with the status a reader
	 * gives them: `pending` for a file's data, which the reader may check again,
	 * and `failed` for anything else.
	 */
	unconfirmed: Map<string, 'pending' | 'failed'>;
}

function tag(candidate: DriveStateCandidate, name: string): string | undefined {
	return candidate.tags[name];
}

/** An integer tag, or undefined when absent or not an integer. */
function intTag(candidate: DriveStateCandidate, name: string): number | undefined {
	const raw = tag(candidate, name);
	if (raw === undefined || !/^-?[0-9]+$/.test(raw)) {
		return undefined;
	}
	const value = Number(raw);
	return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Reads [body], the data of the transaction [candidate] describes, and returns
 * its contents. Throws {@link DriveStateRefused} for every artifact a reader
 * must not use.
 */
export async function readDriveState(
	candidate: DriveStateCandidate,
	body: Uint8Array,
	options: DriveStateReadOptions
): Promise<DriveStateContents> {
	// 1. The tags. The indexer that reported them is untrusted, so a tag that is
	//    missing or malformed is a refusal with a reason, never an exception.
	const driveId = tag(candidate, DriveStateTagName.driveId);
	const blockEnd = intTag(candidate, DriveStateTagName.blockEnd);
	// Absent reads as 0: every artifact starts there, and a payload that says
	// otherwise is caught at the coverage check.
	const blockStart =
		tag(candidate, DriveStateTagName.blockStart) === undefined
			? 0
			: intTag(candidate, DriveStateTagName.blockStart);
	const declaredCount = intTag(candidate, DriveStateTagName.entityCount);
	const cipher = tag(candidate, DriveStateTagName.cipher);
	const cipherIV = tag(candidate, DriveStateTagName.cipherIV);

	if (driveId === undefined || blockEnd === undefined || declaredCount === undefined || blockStart === undefined) {
		refuse(
			'integrity-failed',
			`a required tag is missing or unreadable on ${candidate.txId}: Drive-Id=${driveId} ` +
				`Block-End=${tag(candidate, DriveStateTagName.blockEnd)} Entity-Count=${tag(candidate, DriveStateTagName.entityCount)}`
		);
	}

	// 1a. Who uploaded it: the drive's owner, the same attribution every ArFS
	//     entity gets.
	if (options.expectedOwnerAddress === '' || candidate.ownerAddress !== options.expectedOwnerAddress) {
		refuse(
			'owner-mismatch',
			`${candidate.txId} was uploaded by ${candidate.ownerAddress}, and the drive is owned by ${options.expectedOwnerAddress}`
		);
	}

	// 1b. Cipher and Cipher-IV, together or not at all.
	if ((cipher === undefined) !== (cipherIV === undefined)) {
		refuse(
			'integrity-failed',
			`the cipher tags on ${candidate.txId} are incomplete: Cipher=${cipher ?? 'absent'} Cipher-IV=${cipherIV === undefined ? 'absent' : 'set'}`
		);
	}

	// 1c. The tags' encryption against the drive's own privacy, both ways.
	const encrypted = cipher !== undefined;
	const isPrivate = options.protection.kind === 'private';
	if (isPrivate !== encrypted) {
		refuse(
			'privacy-mismatch',
			isPrivate
				? `drive ${driveId} is private and ${candidate.txId} carries no Cipher tag`
				: `drive ${driveId} is public and ${candidate.txId} declares Cipher=${cipher}`
		);
	}

	// 2. State-Version: unreadable, newer and older are three different things.
	const rawVersion = tag(candidate, DriveStateTagName.stateVersion);
	const taggedVersion = DriveStateFormatVersion.tryParse(rawVersion);
	if (!taggedVersion) {
		refuse(
			'integrity-failed',
			`State-Version is ${rawVersion === undefined ? 'absent' : `"${rawVersion}"`}, which is not a major.minor format version`
		);
	}
	const current = DriveStateFormatVersion.current;
	if (taggedVersion.isNewerThanThisBuild) {
		refuse(
			'unknown-version',
			`State-Version is ${taggedVersion} and this build reads ${current}: the artifact is newer`
		);
	}
	if (taggedVersion.isOlderThanThisBuild) {
		refuse(
			'unknown-version',
			`State-Version is ${taggedVersion} and this build reads ${current}: the artifact predates a breaking change`
		);
	}

	let nonce: Uint8Array | undefined;
	if (encrypted) {
		try {
			nonce = decodeCipherIV(cipherIV!);
		} catch (e) {
			refuse('integrity-failed', `the Cipher-IV tag is not base64: ${e}`);
		}
	}

	// 3. Open it.
	const limit = options.maxPlaintextBytes ?? DRIVE_STATE_MAX_PLAINTEXT_BYTES;
	const plaintext = await openDriveState(body, { cipher, nonce }, options.protection, limit);

	// 4. The database.
	const engine = options.engine ?? defaultArtifactEngine();
	let db: ArtifactDatabase;
	try {
		db = await engine.open(plaintext);
	} catch (e) {
		refuse('integrity-failed', `the payload is not a readable drive state container: ${e}`);
	}

	try {
		return readOpened(db, candidate, {
			driveId,
			blockStart,
			blockEnd,
			declaredCount,
			taggedVersion,
			options
		});
	} catch (e) {
		if (e instanceof DriveStateRefused) {
			throw e;
		}
		// A database that throws while it is read is one this reader cannot use.
		refuse('integrity-failed', `the payload is not a readable drive state container: ${e}`);
	} finally {
		db.close();
	}
}

interface TagClaims {
	driveId: string;
	blockStart: number;
	blockEnd: number;
	declaredCount: number;
	taggedVersion: DriveStateFormatVersion;
	options: DriveStateReadOptions;
}

function readOpened(db: ArtifactDatabase, candidate: DriveStateCandidate, claims: TagClaims): DriveStateContents {
	const { driveId, blockStart, blockEnd, declaredCount, taggedVersion, options } = claims;

	// The file opened as a database of its own, with nothing else in the
	// connection for a hostile object to reach, and nothing in it run before
	// these checks pass.
	db.run('PRAGMA trusted_schema = OFF');
	db.run('PRAGMA cell_size_check = ON');
	db.run('PRAGMA query_only = ON');

	const integrity = db.all('PRAGMA integrity_check');
	const verdict = integrity.length === 0 ? 'no result' : Object.values(integrity[0])[0];
	if (integrity.length !== 1 || verdict !== 'ok') {
		refuse(
			'integrity-failed',
			integrity.length > 1 ? `${integrity.length} problems, first: ${verdict}` : `integrity_check: ${verdict}`
		);
	}

	const applicationId = Object.values(db.all('PRAGMA application_id')[0] ?? {})[0];
	if (applicationId !== DRIVE_STATE_APPLICATION_ID) {
		refuse('integrity-failed', `application_id is ${applicationId}, not an ArDrive drive state artifact`);
	}

	// Exactly the format's tables: no view, trigger, index or virtual table, and
	// every table's DDL identical to the format's, byte for byte.
	const seen = new Map<string, string>();
	for (const row of db.all(
		// Escaped: in LIKE, `_` matches any character, which would also skip
		// a table or view named, say, `sqlitex`.
		"SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\'"
	)) {
		if (row.type !== 'table') {
			refuse('integrity-failed', `found ${row.type} "${row.name}"`);
		}
		seen.set(String(row.name), String(row.sql));
	}
	if (seen.size !== DRIVE_STATE_TABLES.length) {
		refuse('integrity-failed', `expected ${DRIVE_STATE_TABLES.join(', ')}, found ${[...seen.keys()].join(', ')}`);
	}
	for (const table of DRIVE_STATE_TABLES) {
		if (seen.get(table) !== DRIVE_STATE_SCHEMA[table]) {
			refuse('integrity-failed', `table "${table}" is not the format's`);
		}
	}

	// 4b. The rows. SQLite stores whatever it is given, whatever a column
	//     declares, so every value is checked for the kind its column declares.
	for (const table of DRIVE_STATE_TABLES) {
		const violation = typeViolation(db, table);
		if (violation) {
			refuse('integrity-failed', violation);
		}
	}

	const duplicate = db.all('SELECT id FROM file_entries GROUP BY id HAVING count(*) > 1 LIMIT 1');
	if (duplicate.length > 0) {
		refuse('integrity-failed', `file ${duplicate[0].id} is listed twice`);
	}

	const driveRows = db.all('SELECT * FROM drives');
	if (driveRows.length !== 1) {
		refuse('integrity-failed', `drives holds ${driveRows.length} rows, not one`);
	}
	const metaRows = db.all('SELECT * FROM meta');
	if (metaRows.length !== 1) {
		refuse('integrity-failed', `meta holds ${metaRows.length} rows, not one`);
	}
	const meta = metaRows[0];
	const drive = toDrive(driveRows[0]);

	const payloadStart = meta.blockStart as number;
	const payloadEnd = meta.blockEnd as number;
	if (payloadStart < 0 || payloadEnd < 0 || payloadStart > payloadEnd) {
		refuse('integrity-failed', `coverage [${payloadStart}, ${payloadEnd}] is not a block range`);
	}

	const payloadVersion = DriveStateFormatVersion.tryParse(meta.version as string);
	if (!payloadVersion) {
		refuse('integrity-failed', `meta.version "${meta.version}" is not a major.minor format version`);
	}

	const unconfirmed = readStatuses(db);

	// 5. The payload's claims. Version first: the tag and the payload must
	//    agree, minor included.
	if (!payloadVersion.equals(taggedVersion)) {
		refuse(
			'integrity-failed',
			`State-Version is tagged ${taggedVersion} and the payload declares ${payloadVersion}`
		);
	}

	// Identity: the drive the tag names, every row in it, its privacy and owner.
	if (drive.id !== driveId) {
		refuse('integrity-failed', `the Drive-Id tag says ${driveId} and the payload holds ${drive.id}`);
	}
	const foreign = db.all(
		'SELECT driveId FROM (' +
			'SELECT driveId FROM folder_entries UNION ALL SELECT driveId FROM file_entries ' +
			'UNION ALL SELECT driveId FROM drive_revisions UNION ALL SELECT driveId FROM folder_revisions ' +
			'UNION ALL SELECT driveId FROM file_revisions UNION ALL SELECT driveId FROM licenses' +
			') WHERE driveId IS NOT ? LIMIT 1',
		[drive.id]
	);
	if (foreign.length > 0) {
		refuse('integrity-failed', `the payload for ${driveId} carries rows belonging to ${foreign[0].driveId}`);
	}
	if (meta.driveId !== drive.id) {
		refuse('integrity-failed', `meta names drive ${meta.driveId} and the drive row is ${drive.id}`);
	}
	const expectedPrivacy = options.protection.kind;
	if (drive.privacy !== expectedPrivacy || meta.privacy !== expectedPrivacy) {
		refuse(
			'privacy-mismatch',
			`the payload says drive ${driveId} is ${drive.privacy} (meta: ${meta.privacy}), and the reader holds it as ${expectedPrivacy}`
		);
	}
	if (drive.ownerAddress !== options.expectedOwnerAddress || meta.ownerAddress !== options.expectedOwnerAddress) {
		refuse(
			'integrity-failed',
			`the payload names owner ${drive.ownerAddress} (meta: ${meta.ownerAddress}) and the artifact was uploaded by ${options.expectedOwnerAddress}`
		);
	}

	const folders = readFolders(db);
	const files = readFiles(db);

	// Entity-Count: folders, files and the drive.
	const entityCount = folders.length + files.length + 1;
	if (entityCount !== declaredCount || meta.entityCount !== declaredCount) {
		refuse(
			'count-mismatch',
			`Entity-Count declared ${declaredCount}, meta says ${meta.entityCount}, and the payload holds ${entityCount} ` +
				`(${folders.length} folders, ${files.length} files, 1 drive)`
		);
	}

	// Coverage, both ends.
	if (payloadEnd !== blockEnd || payloadStart !== blockStart) {
		refuse(
			'coverage-mismatch',
			`the tags claim [${blockStart}, ${blockEnd}] and the payload claims [${payloadStart}, ${payloadEnd}]`
		);
	}

	// Every drive state is a full copy from block 0. One that starts later says
	// nothing about the blocks before it, and a reader that took it as the
	// drive's whole state would lose every entity last changed there.
	if (payloadStart !== 0) {
		refuse('coverage-mismatch', `the artifact starts at block ${payloadStart}; a drive state covers from block 0`);
	}

	// No going backwards. Equal coverage is still read: it can hold entities a
	// sync skipped.
	if (options.syncedToBlock !== undefined && payloadEnd < options.syncedToBlock) {
		refuse(
			'range-already-covered',
			`the artifact ends at ${payloadEnd}, below the ${options.syncedToBlock} already synced`
		);
	}

	// The folder graph: the root must resolve, and no folder may be its own
	// ancestor, which would hang anything that walks the tree.
	const carried = new Set(folders.map((f) => f.id));
	if (!carried.has(drive.rootFolderId) && !options.knownFolderIds?.has(drive.rootFolderId)) {
		refuse('integrity-failed', `the drive row names root folder ${drive.rootFolderId}, which no table carries`);
	}
	const cycle = firstFolderCycle(folders);
	if (cycle) {
		refuse('integrity-failed', `the folder graph contains a cycle: ${cycle.join(' -> ')}`);
	}

	return {
		txId: candidate.txId,
		version: payloadVersion.toString(),
		blockStart: payloadStart,
		blockEnd: payloadEnd,
		entityCount,
		producer: meta.producer as string,
		drive,
		folders,
		files,
		unconfirmed
	};
}

/** The first value in [table] that does not hold its column's kind, described. */
function typeViolation(db: ArtifactDatabase, table: DriveStateTable): string | undefined {
	const columns = DRIVE_STATE_COLUMNS[table];
	const conditions = columns.map((c) => driveStateColumnHolds(c, driveStateColumnKind(table, c)));
	// One scan for the usual case, a clean table; a dirty one is scanned again to
	// name the column.
	if (db.all(`SELECT 1 FROM ${table} WHERE NOT (${conditions.join(' AND ')}) LIMIT 1`).length === 0) {
		return undefined;
	}
	for (const column of columns) {
		const kind = driveStateColumnKind(table, column);
		const bad = db.all(
			`SELECT typeof(${column}) AS t FROM ${table} WHERE NOT ${driveStateColumnHolds(column, kind)} LIMIT 1`
		);
		if (bad.length > 0) {
			return `${table}.${column} holds a ${bad[0].t} value where the format declares ${kind}`;
		}
	}
	return `${table} holds a value of the wrong kind`;
}

/**
 * `transaction_statuses`, with the status a reader gives each. A file's data
 * transaction becomes `pending`, so the reader can check it again; any other
 * transaction keeps `failed`. Anything else, or an id listed twice, is not
 * something a producer writes.
 */
function readStatuses(db: ArtifactDatabase): Map<string, 'pending' | 'failed'> {
	const statuses = new Map<string, 'pending' | 'failed'>();
	const rows = db.all(
		'SELECT s.id AS id, s.status AS status, s.id IN (SELECT dataTxId FROM file_revisions) AS isData FROM transaction_statuses s'
	);
	for (const row of rows) {
		const id = row.id as string;
		const status = row.status as string;
		if (status !== 'pending' && status !== 'failed') {
			refuse('integrity-failed', `transaction ${id} is listed as "${status}", which a reader cannot apply`);
		}
		const applied = row.isData ? 'pending' : status === 'failed' ? 'failed' : undefined;
		if (applied === undefined) {
			refuse('integrity-failed', `transaction ${id} is listed as "${status}", which a reader cannot apply`);
		}
		if (statuses.has(id)) {
			refuse('integrity-failed', `transaction ${id} is listed twice`);
		}
		statuses.set(id, applied);
	}
	return statuses;
}

function toDrive(row: ArtifactRow): DriveStateDriveRow {
	return {
		id: row.id as string,
		rootFolderId: row.rootFolderId as string,
		ownerAddress: row.ownerAddress as string,
		name: row.name as string,
		privacy: row.privacy as string,
		bundledIn: row.bundledIn as string | null,
		customJsonMetadata: row.customJsonMetadata as string | null,
		customGQLTags: row.customGQLTags as string | null,
		isHidden: row.isHidden !== 0,
		signatureType: row.signatureType as string | null,
		dateCreated: row.dateCreated as number,
		lastUpdated: row.lastUpdated as number
	};
}

/**
 * Each entity's newest revision's metadata transaction. Read in one pass and
 * reduced here: the tables carry no index, so a correlated subquery per row
 * would be quadratic.
 */
function newestRevisionTx(
	db: ArtifactDatabase,
	table: 'folder_revisions' | 'file_revisions',
	idColumn: string
): Map<string, string> {
	const newest = new Map<string, { date: number; txId: string }>();
	for (const row of db.all(`SELECT ${idColumn} AS id, dateCreated, metadataTxId FROM ${table}`)) {
		const id = row.id as string;
		const date = row.dateCreated as number;
		const known = newest.get(id);
		if (!known || date >= known.date) {
			newest.set(id, { date, txId: row.metadataTxId as string });
		}
	}
	return new Map([...newest].map(([id, { txId }]) => [id, txId]));
}

function readFolders(db: ArtifactDatabase): DriveStateFolderRow[] {
	const txIds = newestRevisionTx(db, 'folder_revisions', 'folderId');
	return db.all('SELECT * FROM folder_entries ORDER BY rowid').map((row) => ({
		id: row.id as string,
		driveId: row.driveId as string,
		name: row.name as string,
		parentFolderId: row.parentFolderId as string | null,
		dateCreated: row.dateCreated as number,
		lastUpdated: row.lastUpdated as number,
		customJsonMetadata: row.customJsonMetadata as string | null,
		customGQLTags: row.customGQLTags as string | null,
		isHidden: row.isHidden !== 0,
		metadataTxId: txIds.get(row.id as string) ?? null
	}));
}

function readFiles(db: ArtifactDatabase): DriveStateFileRow[] {
	const txIds = newestRevisionTx(db, 'file_revisions', 'fileId');
	return db.all('SELECT * FROM file_entries ORDER BY rowid').map((row) => ({
		id: row.id as string,
		driveId: row.driveId as string,
		name: row.name as string,
		parentFolderId: row.parentFolderId as string,
		size: row.size as number,
		lastModifiedDate: row.lastModifiedDate as number,
		dataContentType: row.dataContentType as string | null,
		dataTxId: row.dataTxId as string,
		licenseTxId: row.licenseTxId as string | null,
		bundledIn: row.bundledIn as string | null,
		thumbnail: row.thumbnail as string | null,
		pinnedDataOwnerAddress: row.pinnedDataOwnerAddress as string | null,
		customJsonMetadata: row.customJsonMetadata as string | null,
		customGQLTags: row.customGQLTags as string | null,
		isHidden: row.isHidden !== 0,
		dateCreated: row.dateCreated as number,
		lastUpdated: row.lastUpdated as number,
		assignedNames: row.assignedNames as string | null,
		fallbackTxId: row.fallbackTxId as string | null,
		originalOwner: row.originalOwner as string | null,
		importSource: row.importSource as string | null,
		metadataTxId: txIds.get(row.id as string) ?? null
	}));
}

/** The first parent cycle among [folders], as the path around it. */
export function firstFolderCycle(
	folders: readonly { id: string; parentFolderId: string | null }[]
): string[] | undefined {
	const parents = new Map<string, string | null>();
	for (const folder of folders) {
		parents.set(folder.id, folder.parentFolderId);
	}
	const settled = new Set<string>();
	for (const start of parents.keys()) {
		const path: string[] = [];
		const onPath = new Set<string>();
		let at: string | null | undefined = start;
		while (at !== null && at !== undefined && parents.has(at) && !settled.has(at)) {
			if (onPath.has(at)) {
				return [...path.slice(path.indexOf(at)), at];
			}
			onPath.add(at);
			path.push(at);
			at = parents.get(at);
		}
		for (const id of path) {
			settled.add(id);
		}
	}
	return undefined;
}
