import { DbService } from './db_service';
import { ArFSLocalDriveEntity } from '../types/client_Types';

export class PublicDrivesService extends DbService<ArFSLocalDriveEntity> {
	collectionName = 'publicDrives';

	saveDrives(drives: ArFSLocalDriveEntity[]): void {
		this._collection.insert(drives);
	}

	getDriveById(id: number): ArFSLocalDriveEntity {
		return this._collection.get(id);
	}

	getDriveByDriveId(id: string): ArFSLocalDriveEntity[] {
		return this._collection.where((e) => e.entity.driveId == id);
	}
}
