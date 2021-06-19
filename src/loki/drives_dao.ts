import { DaoBase } from './dao_base';
import { ArFSLocalDriveEntity } from '../types/client_Types';

export class DrivesDao extends DaoBase<ArFSLocalDriveEntity> {
	constructor() {
		super('drives');
	}

	//Proposed functions, but any queries from these can be accessed from the collection object

	// saveDrives(drives: ArFSLocalDriveEntity[]): void {
	// 	this.collection.insert(drives);
	// }

	// getLocalDrives(owner: string): ArFSLocalDriveEntity[] {
	// 	return this.collection.find({ owner: owner, isLocal: 1 });
	// }
	// getAllRecentlyUploadedDrives(): ArFSLocalDriveEntity[] {
	// 	return this.collection.where((e: ArFSLocalDriveEntity) => e.entity.syncStatus == 2);
	// }
	// getDrivesToUpload(owner: string) {
	// 	return this.collection.where((e: ArFSLocalDriveEntity) => e.owner == owner && e.entity.txId == '0');
	// }
	// getLocalDrive() {}
	// getUnsyncedDrives() {}

	// getDriveById(id: number): ArFSLocalDriveEntity {
	// 	return this.collection.get(id);
	// }

	// getDriveByDriveId(id: string): ArFSLocalDriveEntity[] {
	// 	return this.collection.where((e) => e.entity.driveId == id);
	// }
}
