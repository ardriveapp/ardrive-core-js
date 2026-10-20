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

function parseJsonObject<T>(raw: string | null, column: string, id: string): T | undefined {
	if (raw === null) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		refuse('integrity-failed', `${column} of ${id} is not JSON: ${e}`);
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		refuse('integrity-failed', `${column} of ${id} is not a JSON object`);
	}
	return parsed as T;
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
			parseJsonObject<CustomMetaDataGqlTags>(row.customGQLTags, 'customGQLTags', row.id),
			parseJsonObject<CustomMetaDataJsonFields>(row.customJsonMetadata, 'customJsonMetadata', row.id)
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
			parseJsonObject<CustomMetaDataGqlTags>(row.customGQLTags, 'customGQLTags', row.id),
			parseJsonObject<CustomMetaDataJsonFields>(row.customJsonMetadata, 'customJsonMetadata', row.id)
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
			parseJsonObject<CustomMetaDataGqlTags>(row.customGQLTags, 'customGQLTags', row.id),
			parseJsonObject<CustomMetaDataJsonFields>(row.customJsonMetadata, 'customJsonMetadata', row.id)
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
			parseJsonObject<CustomMetaDataGqlTags>(row.customGQLTags, 'customGQLTags', row.id),
			parseJsonObject<CustomMetaDataJsonFields>(row.customJsonMetadata, 'customJsonMetadata', row.id)
		);
		setPin(file, row);
		return file;
	});
}

export function publicEntitiesFromContents(
	contents: DriveStateContents
): DriveStateEntities<ArFSPublicFolder, ArFSPublicFile> {
	return {
		folders: contents.folders.map(publicFolderFromRow),
		files: contents.files.map(publicFileFromRow)
	};
}

export async function privateEntitiesFromContents(
	contents: DriveStateContents,
	driveKey: DriveKey
): Promise<DriveStateEntities<ArFSPrivateFolder, ArFSPrivateFile>> {
	const files: ArFSPrivateFile[] = [];
	for (const row of contents.files) {
		files.push(await privateFileFromRow(row, driveKey));
	}
	return {
		folders: contents.folders.map((row) => privateFolderFromRow(row, driveKey)),
		files
	};
}
