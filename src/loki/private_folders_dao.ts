import { DaoBase } from './dao_base';
import { ArFSLocalPrivateFolder } from '../types/client_Types';

export class PrivateFoldersDao extends DaoBase<ArFSLocalPrivateFolder> {
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
