import { DbService } from './db_service';
import { ArFSLocalFile } from '../types/client_Types';

export class PublicFilesService extends DbService<ArFSLocalFile> {
	collectionName = 'publicFiles';

	saveFiles(folders: ArFSLocalFile[]): void {
		this._collection.insert(folders);
	}

	getFileById(id: number): ArFSLocalFile {
		return this._collection.get(id);
	}

	getFileByEntityId(id: string): ArFSLocalFile[] {
		return this._collection.where((e) => e.entity.entityId == id);
	}
}
