import { ArFSFileOrFolderEntity } from '../arfs/arfs_entities';
import { FileID, FolderID, UnixTime } from '../types';

export interface NameConflictInfo {
	files: FileConflictInfo[];
	folders: FolderNameAndId[];
}

export interface FolderNameAndId {
	folderName: string;
	folderId: FolderID;
}

export interface FileConflictInfo {
	fileName: string;
	fileId: FileID;
	lastModifiedDate: UnixTime;
}

export function entityToNameMap(entity: ArFSFileOrFolderEntity<'file' | 'folder'>): string {
	return entity.name;
}

export function folderToNameAndIdMap(entity: ArFSFileOrFolderEntity<'folder'>): FolderNameAndId {
	return { folderId: entity.entityId, folderName: entity.name };
}

export function fileConflictInfoMap(entity: ArFSFileOrFolderEntity<'file'>): FileConflictInfo {
	return { fileId: entity.entityId, fileName: entity.name, lastModifiedDate: entity.lastModifiedDate };
}
