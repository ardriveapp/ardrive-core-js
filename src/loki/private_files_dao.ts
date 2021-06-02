import { DaoBase } from './dao_base';
import { ArFSLocalPrivateFile } from '../types/client_Types';

export class PrivateFilesDao extends DaoBase<ArFSLocalPrivateFile> {
	collectionName = 'privateFiles';

	saveFiles(folders: ArFSLocalPrivateFile[]): void {
		this._collection.insert(folders);
	}

	getFileById(id: number): ArFSLocalPrivateFile {
		return this._collection.get(id);
	}

	getFileByEntityId(id: string): ArFSLocalPrivateFile[] {
		return this._collection.where((e) => e.entity.entityId == id);
	}
}
