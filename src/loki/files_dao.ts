import { DaoBase } from './dao_base';
import { ArFSLocalFile } from '../types/client_Types';

export class FilesDao extends DaoBase<ArFSLocalFile> {
	constructor() {
		super('files');
	}

	//Proposed functions, but any queries from these can be accessed from the collection object

	// saveFiles(folders: ArFSLocalFile[]): void {
	// 	this.collection.insert(folders);
	// }

	// getFileById(id: number): ArFSLocalFile {
	// 	return this.collection.get(id);
	// }

	// getFileByEntityId(id: string): ArFSLocalFile[] {
	// 	return this.collection.where((e) => e.entity.entityId == id);
	// }

	// getLocalFileByHashAndParent(){}

	// getLocalFileByHashAndName(){}
	// getLocalFileByPath(){}
	// getExactLocalFile(){}
	// getLatestLocalFile(){}
	// getPreviousLocalFile(){}
	// getLocalFileByTx(){}
	// getFilesToDownload(){}
	// getAllLocalFiles(){}
	// getFilesToUpload(){}
	// getRecentlyUploadedFiles(){}
	// getFilesWithMissingPaths(){}
	// getFilesWithMissingParents(){}
	// getUnhashedLocalFiles(){}
	// getLatestLocalFiles(){}
}
