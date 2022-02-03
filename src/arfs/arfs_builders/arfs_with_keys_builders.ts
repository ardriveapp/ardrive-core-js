import {
	ArFSPrivateFile,
	ArFSPrivateFileOrFolderWithPathsAndKeys,
	ArFSPrivateFolder,
	FolderHierarchy
} from '../../exports';
import { DriveKey, FileKey } from '../../types';
import { deriveFileKey } from '../../utils/crypto';

export class ArFSPrivateFileOrFolderWithPathsAndKeysBuider {
	constructor(
		private readonly entity: ArFSPrivateFile | ArFSPrivateFolder,
		private readonly hierarchy: FolderHierarchy,
		private readonly driveKey: DriveKey
	) {}

	async build(): Promise<ArFSPrivateFileOrFolderWithPathsAndKeys> {
		const fileKey = await this.getFileKey();
		return new ArFSPrivateFileOrFolderWithPathsAndKeys(this.entity, this.hierarchy, this.driveKey, fileKey);
	}

	private async getFileKey(): Promise<FileKey | undefined> {
		if (this.entity.entityType === 'file') {
			const fileId = this.entity.entityId;
			const fileKey = await deriveFileKey(`${fileId}`, this.driveKey);
			return fileKey;
		}
		return;
	}
}
