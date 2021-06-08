import { DaoBase } from './dao_base';
import { ArFSLocalPrivateFile } from '../types/client_Types';

export class PrivateFilesDao extends DaoBase<ArFSLocalPrivateFile> {
	constructor() {
		super('privateFiles');
	}

	//Proposed functions, but any queries from these can be accessed from the collection object

	// saveFiles(folders: ArFSLocalPrivateFile[]): void {
	// 	this.collection.insert(folders);
	// }

	// getFileById(id: number): ArFSLocalPrivateFile {
	// 	return this.collection.get(id);
	// }

	// getFileByEntityId(id: string): ArFSLocalPrivateFile[] {
	// 	return this.collection.where((e) => e.entity.entityId == id);
	// }

	// getLocalPrivateFileByHashAndParent() {}
	// getLocalPrivateFileByHashAndName (){}
	// getLocalPrivateFileByPath(){}
	// getExactLocalPrivateFile (){}
	// getLatestLocalPrivateFile(){}
	// getPreviousLocalPrivateFile(){}
	// getLocalPrivateFileByTx(){}
	// getPrivateFilesToDownload(){}
	// getAllLocalPrivateFiles(){}
	// getPrivateFilesToUpload(){}
	// getRecentlyUploadedPrivateFiles(){}
	// getPrivateFilesWithMissingPaths(){}
	// getPrivateFilesWithMissingParents(){}
	// getUnhashedLocalPrivateFiles(){}
	// getLatestLocalPrivateFiles(){}
}
