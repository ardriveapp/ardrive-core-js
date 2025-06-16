import { FolderID } from '../types';

export const errorMessage = {
	entityNameExists: 'Entity name already exists in destination folder!',
	cannotMoveToDifferentDrive: 'Entity must stay in the same drive!',
	cannotMoveParentIntoChildFolder: 'Parent folder cannot be moved inside any of its children folders!',
	folderCannotMoveIntoItself: 'Folders cannot be moved into themselves!',
	fileIsTheSame: 'The file to upload matches an existing file entity!',
	cannotMoveIntoSamePlace: (type: 'File' | 'Folder', parentFolderId: FolderID): string =>
		`${type} already has parent folder with ID: ${parentFolderId}`,
	privateDriveRequiresDriveKey: 'Private drive requires a drive key to upload.',
	publicDriveDoesNotRequireDriveKey: 'Public drive does not require a drive key to upload.'
};
