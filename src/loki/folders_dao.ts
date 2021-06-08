import { DaoBase } from './dao_base';
import { ArFSLocalFolder } from '../types/client_Types';

export class FoldersDao extends DaoBase<ArFSLocalFolder> {
	constructor() {
		super('folders');
	}

	//Proposed functions, but any queries from these can be accessed from the collection object

	// saveFolders(folders: ArFSLocalFolder[]): void {
	// 	this.collection.insert(folders);
	// }

	// getLocalFolderByPath(driveId: string, filePath: string): ArFSLocalFolder {
	// 	return this.collection.findOne({ driveId: driveId, path: filePath });
	// }

	// getLocalFolderByHash(driveId: string, fileHash: string): ArFSLocalFolder {
	// 	return this.collection.findOne({ driveId: driveId, hash: fileHash });
	// }

	// getLocalFolderBySize(driveId: string, fileSize: number): ArFSLocalFolder {
	// 	return this.collection.findOne({ driveId: driveId, size: fileSize });
	// }

	// getLatestLocalFolder(): ArFSLocalFolder {
	// 	return this.collection.findOne({ isLocal: 1 });
	// }

	// getPreviousLocalFolder(fileId: string): ArFSLocalFolder {
	// 	return this.collection
	// 		.where((e: ArFSLocalFolder) => e.entity.entityId === fileId)
	// 		.sort((a, b) => a.unixTime - b.unixTime)
	// 		.shift()[0];
	// }
	// getLocalDriveRootFolder(driveId: string): ArFSLocalFolder {
	// 	return this.collection.where(
	// 		(e: ArFSLocalFolder) => e.entity.parentFolderId == '0' && e.entity.driveId == driveId
	// 	)[0];
	// }
	// getLocalFolderByTx(): ArFSLocalFolder {}
	// getFoldersToCreate(): ArFSLocalFolder {}
	// getAllLocalFolders(): ArFSLocalFolder {}
	// getFoldersToUpload(): ArFSLocalFolder {}
	// getRecentlyUploadedFolders(): ArFSLocalFolder {}
	// getFoldersWithMissingPaths(): ArFSLocalFolder {}
	// getFoldersWithMissingParents(): ArFSLocalFolder {}
	// getLocalFolders(): ArFSLocalFolder {}
	// getLatestLocalFolders(): ArFSLocalFolder {}

	// getFolderById(id: number): ArFSLocalFolder {
	// 	return this.collection.get(id);
	// }

	// getFolderByEntityId(id: string): ArFSLocalFolder[] {
	// 	return this.collection.where((e) => e.entity.entityId == id);
	// }
}
