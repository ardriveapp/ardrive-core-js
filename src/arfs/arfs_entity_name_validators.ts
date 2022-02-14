import { EntityType } from '../types';
import { ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';

// From ArFS Standards
const MAX_VALID_NAME_BYTE_LENGTH = 255;

export const assertValidArFSFileName = assertValidArFSEntityNameFactory('file');
export const assertValidArFSFolderName = assertValidArFSEntityNameFactory('folder');
export const assertValidArFSDriveName = assertValidArFSEntityNameFactory('drive');

export function assertValidArFSEntityNameFactory(entityType: EntityType): (name: string) => void | Error {
	return function (name: string): void {
		// Check for empty names
		if (name.length === 0) {
			throw new Error(`The ${entityType} name cannot be empty`);
		}

		// Check for max byte length
		const nameByteLength = new TextEncoder().encode(name).length;
		if (nameByteLength > MAX_VALID_NAME_BYTE_LENGTH) {
			throw new Error(`The ${entityType} name must not exceed ${MAX_VALID_NAME_BYTE_LENGTH} bytes`);
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
	assertValidArFSFolderName(rootFolderDestName ?? rootFolder.destinationBaseName);

	for (const file of rootFolder.files) {
		assertValidArFSFileName(file.destinationBaseName);
	}

	for (const folder of rootFolder.folders) {
		assertValidArFSFolderName(folder.destinationBaseName);

		assertArFSCompliantNamesWithinFolder(folder);
	}

	return true;
}
