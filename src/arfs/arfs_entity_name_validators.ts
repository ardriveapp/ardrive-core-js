import { EntityType } from '../types';
import { ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';

// From ArFS Standards
const MAX_VALID_NAME_LENGTH = 255;

export const assertValidArFSFileName = assertValidArFSEntityNameFactory('file');
export const assertValidArFSFolderName = assertValidArFSEntityNameFactory('folder');
export const assertValidArFSDriveName = assertValidArFSEntityNameFactory('drive');

export function assertValidArFSEntityNameFactory(entityType: EntityType): (name: string) => void | Error {
	return function (name: string) {
		// Check for max length and empty names
		if (name.length > MAX_VALID_NAME_LENGTH || name.length === 0) {
			throw new Error(`The ${entityType} name must contain between 1 and ${MAX_VALID_NAME_LENGTH} characters`);
		}

		// Check for null characters
		if (/\0/.test(name)) {
			throw new Error(`The ${entityType} name cannot contain null characters`);
		}
	};
}

export function assertArFSCompliantNamesWithinFolder(
	rootFolder: ArFSFolderToUpload,
	rootFolderDestName?: string
): boolean {
	assertValidArFSFolderName(rootFolderDestName ?? rootFolder.getBaseFileName());

	for (const file of rootFolder.files) {
		assertValidArFSFileName(file.destinationBaseName);
	}

	for (const folder of rootFolder.folders) {
		assertValidArFSFolderName(folder.getBaseFileName());

		assertArFSCompliantNamesWithinFolder(folder);
	}

	return true;
}
