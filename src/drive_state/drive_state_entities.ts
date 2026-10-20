/**
 * A Drive State artifact's rows as core-js entities.
 *
 * An artifact carries each entity's latest state, not the transactions it came
 * from, so four fields an entity built from GraphQL has are not known here:
 * `appName`, `appVersion` and `arFS` are empty strings, and a private entity's
 * metadata `cipherIV` is empty. Nothing that reads, lists or downloads a drive
 * uses them: a private file's download reads its data transaction's own IV.
 * `blockHeight` is 0, the default every entity starts with.
 */
import { ArFSPrivateFile, ArFSPrivateFolder, ArFSPublicFile, ArFSPublicFolder } from '../arfs/arfs_entities';
import { RootFolderID } from '../arfs/arfs_builders/arfs_folder_builders';
import {
	ByteCount,
	CustomMetaDataGqlTags,
	CustomMetaDataJsonFields,
	DriveKey,
	EID,
	FolderID,
	JSON_CONTENT_TYPE,
	PRIVATE_CONTENT_TYPE,
	TxID,
	UnixTime
} from '../types';
import { deriveFileKey } from '../utils/crypto';
import { extToMime } from '../utils/common_browser';
import { DriveStateContents, DriveStateFileRow, DriveStateFolderRow } from './drive_state_reader';
import { refuse } from './drive_state_outcome';
import { DRIVE_STATE_CIPHER } from './drive_state_tags';

export interface DriveStateEntities<Folder, File> {
	folders: Folder[];
	files: File[];
}

function parseJson(raw: string, column: string, id: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		// Not the parse error's text: on recent Node it quotes the input, which
		// for a private drive is decrypted metadata.
		refuse('integrity-failed', `${column} of ${id} is not JSON`);
	}
}

/**
 * Tags core-js's own entity builders consume rather than keep as custom
 * metadata, so an entity read from an artifact carries the same custom tags as
 * one built from GraphQL.
 */
const CONSUMED_TAGS = new Set([
	'App-Name',
	'App-Version',
	'ArFS',
	'Content-Type',
	'Drive-Id',
	'Entity-Type',
	'Unix-Time',
	'Boost',
	'File-Id',
	'Folder-Id',
	'Parent-Folder-Id',
	'Cipher',
	'Cipher-IV',
	'Pinned-Data-Tx',
	'ArFS-Pin'
]);

/**
 * `customGQLTags`: ardrive-web writes the tags as a JSON array of
 * `{name, value}` in transaction order. core-js keeps custom tags as a record,
 * with a repeated name's values in an array.
 */
export function customTagsFromColumn(
	raw: string | null,
	id: string
): { tags?: CustomMetaDataGqlTags; pinnedDataTxId?: string } {
	if (raw === null) {
		return {};
	}
	const parsed = parseJson(raw, 'customGQLTags', id);
	const pairs: { name: unknown; value: unknown }[] = Array.isArray(parsed)
		? parsed
		: parsed !== null && typeof parsed === 'object'
			? Object.entries(parsed as Record<string, unknown>).flatMap(([name, value]) =>
					Array.isArray(value) ? value.map((v) => ({ name, value: v })) : [{ name, value }]
				)
			: refuse('integrity-failed', `customGQLTags of ${id} is not a JSON array`);
	const tags: CustomMetaDataGqlTags = {};
	let pinnedDataTxId: string | undefined;
	for (const pair of pairs) {
		if (
			pair === null ||
			typeof pair !== 'object' ||
			typeof pair.name !== 'string' ||
			typeof pair.value !== 'string'
		) {
			refuse('integrity-failed', `customGQLTags of ${id} holds an entry that is not a name and a value`);
		}
		if (pair.name === 'Pinned-Data-Tx') {
			pinnedDataTxId ??= pair.value;
		}
		if (CONSUMED_TAGS.has(pair.name)) {
			continue;
		}
		const previous = tags[pair.name];
		tags[pair.name] =
			previous === undefined
				? pair.value
				: Array.isArray(previous)
					? [...previous, pair.value]
					: [previous, pair.value];
	}
	return { tags: Object.keys(tags).length > 0 ? tags : undefined, pinnedDataTxId };
}

/** Metadata JSON keys core-js's builders model, per entity type. */
const MODELLED_JSON_KEYS = {
	file: new Set([
		'name',
		'size',
		'lastModifiedDate',
		'dataTxId',
		'dataContentType',
		'isHidden',
		'pinnedDataOwner',
		'thumbnail',
		'assignedNames'
	]),
	folder: new Set(['name', 'isHidden'])
};

/** `customJsonMetadata`: a JSON object of the metadata fields ArFS does not define. */
export function customJsonFromColumn(
	raw: string | null,
	id: string,
	entityType: 'file' | 'folder'
): CustomMetaDataJsonFields | undefined {
	if (raw === null) {
		return undefined;
	}
	const parsed = parseJson(raw, 'customJsonMetadata', id);
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		refuse('integrity-failed', `customJsonMetadata of ${id} is not a JSON object`);
	}
	const kept = Object.entries(parsed as Record<string, unknown>).filter(
		([key]) => !MODELLED_JSON_KEYS[entityType].has(key)
	);
	return kept.length > 0 ? (Object.fromEntries(kept) as CustomMetaDataJsonFields) : undefined;
}

function metadataTxId(row: { id: string; metadataTxId: string | null }) {
	if (row.metadataTxId === null) {
		refuse('integrity-failed', `${row.id} has no revision, so its metadata transaction is unknown`);
	}
	return TxID(row.metadataTxId);
}

function parentOf(row: DriveStateFolderRow): FolderID {
	return row.parentFolderId === null ? new RootFolderID() : EID(row.parentFolderId);
}

/** Every value an entity is built from, checked; a bad one refuses the artifact. */
function convert<T>(row: { id: string }, build: () => T): T {
	try {
		return build();
	} catch (e) {
		if (e instanceof Error && e.name === 'DriveStateRefused') {
			throw e;
		}
		refuse('integrity-failed', `row ${row.id} cannot be read as an entity: ${e}`);
	}
}

export function publicFolderFromRow(row: DriveStateFolderRow): ArFSPublicFolder {
	return convert(row, () => {
		const folder = new ArFSPublicFolder(
			'',
			'',
			'',
			JSON_CONTENT_TYPE,
			EID(row.driveId),
			row.name,
			metadataTxId(row),
			new UnixTime(row.lastUpdated),
			parentOf(row),
			EID(row.id),
			undefined,
			customTagsFromColumn(row.customGQLTags, row.id).tags,
			customJsonFromColumn(row.customJsonMetadata, row.id, 'folder')
		);
		folder.isHidden = row.isHidden;
		return folder;
	});
}

function setPin(entity: ArFSPublicFile | ArFSPrivateFile, row: DriveStateFileRow): void {
	entity.isHidden = row.isHidden;
	if (row.pinnedDataOwnerAddress !== null) {
		entity.pinnedDataOwner = row.pinnedDataOwnerAddress;
	}
	// As the builders do, a malformed Pinned-Data-Tx tag is ignored.
	const { pinnedDataTxId } = customTagsFromColumn(row.customGQLTags, row.id);
	if (pinnedDataTxId !== undefined) {
		try {
			entity.pinnedDataTxId = TxID(pinnedDataTxId);
		} catch {
			// ignored
		}
	}
}

export function publicFileFromRow(row: DriveStateFileRow): ArFSPublicFile {
	return convert(row, () => {
		const file = new ArFSPublicFile(
			'',
			'',
			'',
			JSON_CONTENT_TYPE,
			EID(row.driveId),
			row.name,
			metadataTxId(row),
			new UnixTime(row.lastUpdated),
			EID(row.parentFolderId),
			EID(row.id),
			new ByteCount(row.size),
			// core-js holds a file's last modified date in milliseconds, as its
			// metadata does; the artifact holds seconds.
			new UnixTime(row.lastModifiedDate * 1000),
			TxID(row.dataTxId),
			row.dataContentType ?? extToMime(row.name),
			undefined,
			customTagsFromColumn(row.customGQLTags, row.id).tags,
			customJsonFromColumn(row.customJsonMetadata, row.id, 'file')
		);
		setPin(file, row);
		return file;
	});
}

export function privateFolderFromRow(row: DriveStateFolderRow, driveKey: DriveKey): ArFSPrivateFolder {
	return convert(row, () => {
		const folder = new ArFSPrivateFolder(
			'',
			'',
			'',
			PRIVATE_CONTENT_TYPE,
			EID(row.driveId),
			row.name,
			metadataTxId(row),
			new UnixTime(row.lastUpdated),
			parentOf(row),
			EID(row.id),
			DRIVE_STATE_CIPHER,
			'',
			driveKey,
			undefined,
			customTagsFromColumn(row.customGQLTags, row.id).tags,
			customJsonFromColumn(row.customJsonMetadata, row.id, 'folder')
		);
		folder.isHidden = row.isHidden;
		return folder;
	});
}

export async function privateFileFromRow(row: DriveStateFileRow, driveKey: DriveKey): Promise<ArFSPrivateFile> {
	const fileKey = await convert(row, () => deriveFileKey(row.id, driveKey));
	return convert(row, () => {
		const file = new ArFSPrivateFile(
			'',
			'',
			'',
			PRIVATE_CONTENT_TYPE,
			EID(row.driveId),
			row.name,
			metadataTxId(row),
			new UnixTime(row.lastUpdated),
			EID(row.parentFolderId),
			EID(row.id),
			new ByteCount(row.size),
			new UnixTime(row.lastModifiedDate * 1000),
			TxID(row.dataTxId),
			row.dataContentType ?? extToMime(row.name),
			DRIVE_STATE_CIPHER,
			'',
			fileKey,
			driveKey,
			undefined,
			customTagsFromColumn(row.customGQLTags, row.id).tags,
			customJsonFromColumn(row.customJsonMetadata, row.id, 'file')
		);
		setPin(file, row);
		return file;
	});
}

/**
 * Whether a file row can be listed. ardrive-web files a file whose metadata
 * has no `Parent-Folder-Id` under an empty parent, which no folder can hold:
 * core-js's own builders skip such a file, so a reader skips its row rather
 * than refuse the whole artifact over it.
 */
function listable(row: DriveStateFileRow): boolean {
	try {
		EID(row.parentFolderId);
		return true;
	} catch {
		console.error(
			`[drive-state] skipping file ${row.id}: its parent folder id "${row.parentFolderId}" is not an entity id`
		);
		return false;
	}
}

export function publicEntitiesFromContents(
	contents: DriveStateContents
): DriveStateEntities<ArFSPublicFolder, ArFSPublicFile> {
	return {
		folders: contents.folders.map(publicFolderFromRow),
		files: contents.files.filter(listable).map(publicFileFromRow)
	};
}

export async function privateEntitiesFromContents(
	contents: DriveStateContents,
	driveKey: DriveKey
): Promise<DriveStateEntities<ArFSPrivateFolder, ArFSPrivateFile>> {
	const files: ArFSPrivateFile[] = [];
	for (const row of contents.files.filter(listable)) {
		files.push(await privateFileFromRow(row, driveKey));
	}
	return {
		folders: contents.folders.map((row) => privateFolderFromRow(row, driveKey)),
		files
	};
}
