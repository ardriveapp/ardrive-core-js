import { DbService } from './db_service';
import { ArFSLocalFolder } from '../types/client_Types';

export class PublicFoldersService extends DbService<ArFSLocalFolder> {
	collectionName = 'publicFolders';

	saveFolders(folders: ArFSLocalFolder[]): void {
		this._collection.insert(folders);
	}

	getFolderById(id: number): ArFSLocalFolder {
		return this._collection.get(id);
	}

	getFolderByEntityId(id: string): ArFSLocalFolder[] {
		return this._collection.where((e) => e.entity.entityId == id);
	}
}
