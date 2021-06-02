import { DaoBase } from './dao_base';
import { ArFSLocalPrivateDriveEntity } from '../types/client_Types';

export class PrivateDrivesDao extends DaoBase<ArFSLocalPrivateDriveEntity> {
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
