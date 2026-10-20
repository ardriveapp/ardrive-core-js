/**
 * The Drive State format's tables, exactly as ardrive-web writes them
 * (`drive_state_artifact_schema.dart`, `artifactSchema`). A reader compares
 * each table's `sqlite_master.sql` with these strings byte for byte and
 * refuses any difference, and a producer creates its tables from them.
 *
 * Generated from the Dart source; do not edit by hand.
 */

export type DriveStateTable =
	| 'meta'
	| 'drives'
	| 'folder_entries'
	| 'file_entries'
	| 'drive_revisions'
	| 'folder_revisions'
	| 'file_revisions'
	| 'licenses'
	| 'transaction_statuses';

export const DRIVE_STATE_SCHEMA: Readonly<Record<DriveStateTable, string>> = {
	meta:
		'CREATE TABLE meta (version TEXT NOT NULL, driveId TEXT NOT NULL, ownerAddress TEXT NOT NULL, privacy TEXT NOT NULL, blockStart INTEGER NOT NULL, blockEnd INTEGER NOT NULL, entityCount INTEGER NOT NULL, producer TEXT NOT NULL)',
	drives:
		'CREATE TABLE drives (id TEXT NOT NULL, rootFolderId TEXT NOT NULL, ownerAddress TEXT NOT NULL, name TEXT NOT NULL, privacy TEXT NOT NULL, bundledIn TEXT, customJsonMetadata TEXT, customGQLTags TEXT, isHidden INTEGER NOT NULL, signatureType TEXT, dateCreated INTEGER NOT NULL, lastUpdated INTEGER NOT NULL)',
	folder_entries:
		'CREATE TABLE folder_entries (id TEXT NOT NULL, driveId TEXT NOT NULL, name TEXT NOT NULL, parentFolderId TEXT, dateCreated INTEGER NOT NULL, lastUpdated INTEGER NOT NULL, customJsonMetadata TEXT, customGQLTags TEXT, isHidden INTEGER NOT NULL)',
	file_entries:
		'CREATE TABLE file_entries (id TEXT NOT NULL, driveId TEXT NOT NULL, name TEXT NOT NULL, parentFolderId TEXT NOT NULL, size INTEGER NOT NULL, lastModifiedDate INTEGER NOT NULL, dataContentType TEXT, dataTxId TEXT NOT NULL, licenseTxId TEXT, bundledIn TEXT, thumbnail TEXT, pinnedDataOwnerAddress TEXT, customJsonMetadata TEXT, customGQLTags TEXT, isHidden INTEGER NOT NULL, dateCreated INTEGER NOT NULL, lastUpdated INTEGER NOT NULL, assignedNames TEXT, fallbackTxId TEXT, originalOwner TEXT, importSource TEXT)',
	drive_revisions:
		'CREATE TABLE drive_revisions (driveId TEXT NOT NULL, rootFolderId TEXT NOT NULL, ownerAddress TEXT NOT NULL, name TEXT NOT NULL, privacy TEXT NOT NULL, metadataTxId TEXT NOT NULL, dateCreated INTEGER NOT NULL, action TEXT NOT NULL, bundledIn TEXT, customJsonMetadata TEXT, customGQLTags TEXT, isHidden INTEGER NOT NULL)',
	folder_revisions:
		'CREATE TABLE folder_revisions (folderId TEXT NOT NULL, driveId TEXT NOT NULL, name TEXT NOT NULL, parentFolderId TEXT, metadataTxId TEXT NOT NULL, dateCreated INTEGER NOT NULL, action TEXT NOT NULL, customJsonMetadata TEXT, customGQLTags TEXT, isHidden INTEGER NOT NULL)',
	file_revisions:
		'CREATE TABLE file_revisions (fileId TEXT NOT NULL, driveId TEXT NOT NULL, name TEXT NOT NULL, parentFolderId TEXT NOT NULL, size INTEGER NOT NULL, lastModifiedDate INTEGER NOT NULL, dataContentType TEXT, metadataTxId TEXT NOT NULL, dataTxId TEXT NOT NULL, licenseTxId TEXT, thumbnail TEXT, bundledIn TEXT, dateCreated INTEGER NOT NULL, customJsonMetadata TEXT, customGQLTags TEXT, action TEXT NOT NULL, pinnedDataOwnerAddress TEXT, isHidden INTEGER NOT NULL, assignedNames TEXT, fallbackTxId TEXT, originalOwner TEXT, importSource TEXT)',
	licenses:
		'CREATE TABLE licenses (fileId TEXT NOT NULL, driveId TEXT NOT NULL, dataTxId TEXT NOT NULL, licenseTxType TEXT NOT NULL, licenseTxId TEXT NOT NULL, bundledIn TEXT, dateCreated INTEGER NOT NULL, licenseType TEXT NOT NULL, customGQLTags TEXT)',
	transaction_statuses:
		'CREATE TABLE transaction_statuses (id TEXT NOT NULL, status TEXT NOT NULL)',
};

/** The tables in the order the format lists them. */
export const DRIVE_STATE_TABLES = Object.keys(DRIVE_STATE_SCHEMA) as DriveStateTable[];

/** Each table's columns, in declaration order. */
export const DRIVE_STATE_COLUMNS: Readonly<Record<DriveStateTable, readonly string[]>> = {
	meta: ['version', 'driveId', 'ownerAddress', 'privacy', 'blockStart', 'blockEnd', 'entityCount', 'producer'],
	drives: ['id', 'rootFolderId', 'ownerAddress', 'name', 'privacy', 'bundledIn', 'customJsonMetadata', 'customGQLTags', 'isHidden', 'signatureType', 'dateCreated', 'lastUpdated'],
	folder_entries: ['id', 'driveId', 'name', 'parentFolderId', 'dateCreated', 'lastUpdated', 'customJsonMetadata', 'customGQLTags', 'isHidden'],
	file_entries: ['id', 'driveId', 'name', 'parentFolderId', 'size', 'lastModifiedDate', 'dataContentType', 'dataTxId', 'licenseTxId', 'bundledIn', 'thumbnail', 'pinnedDataOwnerAddress', 'customJsonMetadata', 'customGQLTags', 'isHidden', 'dateCreated', 'lastUpdated', 'assignedNames', 'fallbackTxId', 'originalOwner', 'importSource'],
	drive_revisions: ['driveId', 'rootFolderId', 'ownerAddress', 'name', 'privacy', 'metadataTxId', 'dateCreated', 'action', 'bundledIn', 'customJsonMetadata', 'customGQLTags', 'isHidden'],
	folder_revisions: ['folderId', 'driveId', 'name', 'parentFolderId', 'metadataTxId', 'dateCreated', 'action', 'customJsonMetadata', 'customGQLTags', 'isHidden'],
	file_revisions: ['fileId', 'driveId', 'name', 'parentFolderId', 'size', 'lastModifiedDate', 'dataContentType', 'metadataTxId', 'dataTxId', 'licenseTxId', 'thumbnail', 'bundledIn', 'dateCreated', 'customJsonMetadata', 'customGQLTags', 'action', 'pinnedDataOwnerAddress', 'isHidden', 'assignedNames', 'fallbackTxId', 'originalOwner', 'importSource'],
	licenses: ['fileId', 'driveId', 'dataTxId', 'licenseTxType', 'licenseTxId', 'bundledIn', 'dateCreated', 'licenseType', 'customGQLTags'],
	transaction_statuses: ['id', 'status'],
};

/** What a column must hold for a reader to accept the row. */
export type DriveStateColumnKind = 'text' | 'nullable-text' | 'integer' | 'time';

const TIME_COLUMNS = new Set(['dateCreated', 'lastUpdated', 'lastModifiedDate']);

/**
 * The kind a column's declaration implies: `TEXT NOT NULL` is text, `TEXT` is
 * text or NULL, `INTEGER NOT NULL` is an integer, and the date columns are
 * integer seconds within what a JavaScript or Dart date can represent.
 */
export function driveStateColumnKind(table: DriveStateTable, column: string): DriveStateColumnKind {
	const ddl = DRIVE_STATE_SCHEMA[table];
	const declaration = new RegExp(`[(,] ?${column} (TEXT|INTEGER)( NOT NULL)?[,)]`).exec(ddl);
	if (!declaration) {
		throw new Error(`${table} has no column ${column}`);
	}
	const [, type, notNull] = declaration;
	if (type === 'TEXT') {
		return notNull ? 'text' : 'nullable-text';
	}
	return TIME_COLUMNS.has(column) ? 'time' : 'integer';
}

/** The largest magnitude, in seconds, a date in either client can hold: 8.64e15 ms. */
export const DRIVE_STATE_MAX_SECONDS = 8_640_000_000_000;

/** An SQL condition true when `column` holds a value of its kind. */
export function driveStateColumnHolds(column: string, kind: DriveStateColumnKind): string {
	switch (kind) {
		case 'text':
			return `typeof(${column}) = 'text'`;
		case 'nullable-text':
			return `typeof(${column}) IN ('text', 'null')`;
		case 'integer':
			return `typeof(${column}) = 'integer'`;
		case 'time':
			return `(typeof(${column}) = 'integer' AND ${column} BETWEEN -${DRIVE_STATE_MAX_SECONDS} AND ${DRIVE_STATE_MAX_SECONDS})`;
	}
}
