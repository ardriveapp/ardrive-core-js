import { DaoBase } from './dao_base';
import { ArFSLocalPrivateFolder } from '../types/client_Types';

export class PrivateFoldersDao extends DaoBase<ArFSLocalPrivateFolder> {
	constructor() {
		super('privateFolders');
	}

	//Proposed functions, but any queries from these can be accessed from the collection object

	// saveFolders(folders: ArFSLocalPrivateFolder[]): void {
	// 	this.collection.insert(folders);
	// }

	// getLocalPrivateFolderByPath(path: string): ArFSLocalPrivateFolder {
	// 	return this.collection.findOneUnindexed('path', path);
	// }

	// getLocalPrivateFolderByHash(hash: string): ArFSLocalPrivateFolder {
	// 	return this.collection.findOneUnindexed('hash', hash);
	// }

	// getLocalPrivateFolderBySize(size: number): ArFSLocalPrivateFolder {
	// 	return this.collection.findOneUnindexed('size', size);
	// }

	// getLatestLocalPrivateFolder() {}
	// getPreviousLocalPrivateFolder() {}
	// getLocalPrivateDriveRootFolder() {}
	// getLocalPrivateFolderByTx() {}
	// getPrivateFoldersToCreate(){}
	// getAllLocalPrivateFolders(){}
	// getPrivateFoldersToUpload(){}
	// getRecentlyUploadedPrivateFolders(){}
	// getPrivateFoldersWithMissingPaths(){}
	// getPrivateFoldersWithMissingParents(){}
	// getLocalPrivateFolders(){}
	// getLatestLocalPrivateFolders(){}

	// getFolderById(id: number): ArFSLocalPrivateFolder {
	// 	return this.collection.get(id);
	// }

	// getFolderByEntityId(id: string): ArFSLocalPrivateFolder[] {
	// 	return this.collection.where((e) => e.entity.entityId == id);
	// }
}
