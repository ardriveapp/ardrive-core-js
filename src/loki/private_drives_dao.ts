import { DaoBase } from './dao_base';
import { ArFSLocalPrivateDriveEntity } from '../types/client_Types';

export class PrivateDrivesDao extends DaoBase<ArFSLocalPrivateDriveEntity> {
	constructor() {
		super('privateDrives');
	}

	//Proposed functions, but any queries from these can be accessed from the collection object

	// saveDrives(drives: ArFSLocalPrivateDriveEntity[]): void {
	// 	this.collection.insert(drives);
	// }

	// getLocalPrivateDrive() {

	// }
	// getAllRecentlyUploadedPrivateDrives() {}
	// getPrivateDrivesToUpload() {}
	// getLocalPrivateDrives() {}
	// getUnsyncedPrivateDrives() {}

	// getDriveById(id: number): ArFSLocalPrivateDriveEntity {
	// 	return this.collection.get(id);
	// }

	// getDriveByDriveId(id: string): ArFSLocalPrivateDriveEntity[] {
	// 	return this.collection.where((e) => e.entity.driveId == id);
	// }
}
