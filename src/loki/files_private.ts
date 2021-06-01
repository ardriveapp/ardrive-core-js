import { DbService } from './db_service';
import { ArFSLocalPrivateFile } from '../types/client_Types';

export class PrivateFilesService extends DbService<ArFSLocalPrivateFile> {
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
