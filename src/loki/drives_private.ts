import { DbService } from './db_service';
import { ArFSLocalPrivateDriveEntity } from '../types/client_Types';

export class PrivateDrivesService extends DbService<ArFSLocalPrivateDriveEntity> {
	collectionName = 'privateDrives';

	saveDrives(drives: ArFSLocalPrivateDriveEntity[]): void {
		this._collection.insert(drives);
	}

	getDriveById(id: number): ArFSLocalPrivateDriveEntity {
		return this._collection.get(id);
	}

	getDriveByDriveId(id: string): ArFSLocalPrivateDriveEntity[] {
		return this._collection.where((e) => e.entity.driveId == id);
	}
}
