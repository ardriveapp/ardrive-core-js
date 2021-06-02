import { DaoBase } from './dao_base';
import { ArFSLocalDriveEntity } from '../types/client_Types';

export class DrivesDao extends DaoBase<ArFSLocalDriveEntity> {
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
