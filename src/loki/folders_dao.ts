import { DaoBase } from './dao_base';
import { ArFSLocalFolder } from '../types/client_Types';

export class FoldersDao extends DaoBase<ArFSLocalFolder> {
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
