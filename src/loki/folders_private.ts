import { DbService } from './db_service';
import { ArFSLocalPrivateFolder } from '../types/client_Types';

export class PrivateFoldersService extends DbService<ArFSLocalPrivateFolder> {
	collectionName = 'privateFolders';

	saveFolders(folders: ArFSLocalPrivateFolder[]): void {
		this._collection.insert(folders);
	}

	getFolderById(id: number): ArFSLocalPrivateFolder {
		return this._collection.get(id);
	}

	getFolderByEntityId(id: string): ArFSLocalPrivateFolder[] {
		return this._collection.where((e) => e.entity.entityId == id);
	}
}
