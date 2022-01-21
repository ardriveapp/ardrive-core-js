import { ArFSFolderToUpload } from '../arfs/arfs_file_wrapper';
import {
	askOnConflicts,
	errorOnConflict,
	renameOnConflicts,
	replaceOnConflicts,
	ResolveFileNameConflictsParams,
	ResolveFolderNameConflictsParams,
	skipOnConflicts,
	UploadStats,
	upsertOnConflicts,
	useExistingFolder
} from '../types';
import { NameConflictInfo, FolderNameAndId, FileConflictInfo } from './mapper_functions';

/** Throws an error if the entitiesToUpload contain conflicting file names being sent to the same destination folder */
export function assertLocalNameConflicts(entitiesToUpload: UploadStats[]): void {
	const namesWithinUpload: { [destFolderId: string /* FolderID */]: string[] } = {};

	for (const { destFolderId, wrappedEntity, destName } of entitiesToUpload) {
		const destinationName = destName ?? wrappedEntity.destinationBaseName;

		const existingName = namesWithinUpload[`${destFolderId}`]?.find((n) => n === destinationName);
		if (existingName) {
			throw new Error('Upload cannot contain multiple destination names to the same destination folder!');
		}

		if (wrappedEntity.entityType === 'folder') {
			assertConflictsWithinFolder(wrappedEntity);
		}

		// Add local upload info to check for name conflicts within the upload itself
		if (!namesWithinUpload[`${destFolderId}`]) {
			namesWithinUpload[`${destFolderId}`] = [];
		}
		namesWithinUpload[`${destFolderId}`].push(destinationName);
	}
}

/** Recursive function to assert any name conflicts between entities within each folder */
export function assertConflictsWithinFolder(wrappedFolder: ArFSFolderToUpload): void {
	const namesWithinFolder: string[] = [];
	for (const folder of wrappedFolder.folders) {
		if (namesWithinFolder.includes(folder.destinationBaseName)) {
			throw new Error('Folders cannot contain identical destination names!');
		}
		namesWithinFolder.push(folder.destinationBaseName);

		// Recurse into each folder to check for  local conflicts
		assertConflictsWithinFolder(folder);
	}

	for (const file of wrappedFolder.files) {
		if (namesWithinFolder.includes(file.destinationBaseName)) {
			throw new Error('Folders cannot contain identical destination names!');
		}
		namesWithinFolder.push(file.destinationBaseName);
	}
}

export async function resolveFileNameConflicts({
	wrappedFile,
	conflictResolution,
	destinationFileName: destFileName,
	prompts,
	getConflictInfoFn,
	destFolderId
}: ResolveFileNameConflictsParams): Promise<void> {
	const nameConflictInfo = await getConflictInfoFn(destFolderId);
	const existingNameAtDestConflict = checkNameInfoForConflicts(destFileName, nameConflictInfo);

	// Assign and preserve destination name
	wrappedFile.destName = destFileName;

	if (!existingNameAtDestConflict.existingFileConflict && !existingNameAtDestConflict.existingFolderConflict) {
		// There are no conflicts, continue file upload
		return;
	}

	const hasSameLastModifiedDate = existingNameAtDestConflict.existingFileConflict?.lastModifiedDate
		? wrappedFile.lastModifiedDate.equals(existingNameAtDestConflict.existingFileConflict?.lastModifiedDate)
		: false;

	if (conflictResolution !== askOnConflicts) {
		if (existingNameAtDestConflict.existingFolderConflict) {
			// Skip this file with an error, files CANNOT overwrite folders
			wrappedFile.conflictResolution = errorOnConflict;
			return;
		}

		if (conflictResolution === skipOnConflicts) {
			// Skip this file
			wrappedFile.conflictResolution = skipOnConflicts;
			return;
		}

		if (conflictResolution === replaceOnConflicts) {
			// Proceed with new revision
			wrappedFile.existingId = existingNameAtDestConflict.existingFileConflict.fileId;
			return;
		}

		// Otherwise, default to upsert behavior
		if (hasSameLastModifiedDate) {
			// Skip this file with upsert, it has a matching last modified date
			wrappedFile.conflictResolution = upsertOnConflicts;
			return;
		}
		// Proceed with creating a new revision
		wrappedFile.existingId = existingNameAtDestConflict.existingFileConflict.fileId;
		return;
	}

	// Use the ask prompt behavior
	if (!prompts) {
		throw new Error('App must provide file name conflict resolution prompts to use the `ask` conflict resolution!');
	}

	const allExistingNames = [
		...nameConflictInfo.files.map((f) => f.fileName),
		...nameConflictInfo.folders.map((f) => f.folderName)
	];

	const userInput = await (() => {
		if (existingNameAtDestConflict.existingFolderConflict) {
			return prompts.fileToFolderNameConflict({
				folderId: existingNameAtDestConflict.existingFolderConflict.folderId,
				folderName: destFileName,
				namesWithinDestFolder: allExistingNames
			});
		}

		return prompts.fileToFileNameConflict({
			fileId: existingNameAtDestConflict.existingFileConflict.fileId,
			fileName: destFileName,
			hasSameLastModifiedDate,
			namesWithinDestFolder: allExistingNames
		});
	})();

	switch (userInput.resolution) {
		case skipOnConflicts:
			// Skip this file
			wrappedFile.conflictResolution = skipOnConflicts;
			return;

		case renameOnConflicts:
			// These cases should be handled at the app level, but throw errors here if not
			if (destFileName === userInput.newFileName) {
				throw new Error('You must provide a different name!');
			}
			if (allExistingNames.includes(userInput.newFileName)) {
				throw new Error('That name also exists within dest folder!');
			}

			// Use specified new file name
			wrappedFile.destName = userInput.newFileName;
			return;

		case replaceOnConflicts:
			// Proceed with new revision
			wrappedFile.existingId = existingNameAtDestConflict.existingFileConflict?.fileId;
			return;
	}
}

export async function resolveFolderNameConflicts({
	wrappedFolder,
	destinationFolderName: destFolderName,
	prompts,
	conflictResolution,
	getConflictInfoFn,
	destFolderId
}: ResolveFolderNameConflictsParams): Promise<void> {
	const nameConflictInfo = await getConflictInfoFn(destFolderId);
	const existingNameAtDestConflict = checkNameInfoForConflicts(destFolderName, nameConflictInfo);

	// Assign and preserve destination name
	wrappedFolder.destName = destFolderName;

	if (!existingNameAtDestConflict.existingFileConflict && !existingNameAtDestConflict.existingFolderConflict) {
		// There are no conflicts, continue folder upload
		return;
	}

	if (conflictResolution !== askOnConflicts) {
		if (existingNameAtDestConflict.existingFileConflict) {
			// Folders cannot overwrite files
			wrappedFolder.conflictResolution = errorOnConflict;
			return;
		}
		// Re-use this folder, upload its contents within the existing folder
		wrappedFolder.existingId = existingNameAtDestConflict.existingFolderConflict.folderId;
	} else {
		// Use the ask prompt behavior
		if (!prompts) {
			throw new Error(
				'App must provide folder and file name conflict resolution prompts to use the `ask` conflict resolution!'
			);
		}

		const allExistingNames = [
			...nameConflictInfo.files.map((f) => f.fileName),
			...nameConflictInfo.folders.map((f) => f.folderName)
		];

		const userInput = await (() => {
			if (existingNameAtDestConflict.existingFolderConflict) {
				return prompts.folderToFolderNameConflict({
					folderId: existingNameAtDestConflict.existingFolderConflict.folderId,
					folderName: destFolderName,
					namesWithinDestFolder: allExistingNames
				});
			}

			return prompts.folderToFileNameConflict({
				fileId: existingNameAtDestConflict.existingFileConflict.fileId,
				fileName: destFolderName,
				namesWithinDestFolder: allExistingNames
			});
		})();

		switch (userInput.resolution) {
			case skipOnConflicts:
				// Skip this folder and all its contents
				wrappedFolder.conflictResolution = skipOnConflicts;
				return;

			case useExistingFolder:
				// Re-use this folder, upload its contents within the existing folder

				// useExistingFolder will only ever be returned from a folderToFolder prompt, which
				// WILL have existingFolderConflict -- this can not be null here
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				wrappedFolder.existingId = existingNameAtDestConflict.existingFolderConflict!.folderId;

				// Break to check conflicts within folder
				break;

			case renameOnConflicts:
				// These cases should be handled at the app level, but throw errors here if not
				if (destFolderName === userInput.newFolderName) {
					throw new Error('You must provide a different name!');
				}
				if (allExistingNames.includes(userInput.newFolderName)) {
					throw new Error('That name also exists within dest folder!');
				}

				// Use new folder name and upload all contents within new folder
				wrappedFolder.destName = userInput.newFolderName;

				// Conflict resolved by rename -- return early, do NOT recurse into this folder
				return;
		}
	}

	if (wrappedFolder.existingId) {
		// Re-using existing folder id, check for name conflicts inside the folder
		const destinationFolderId = wrappedFolder.existingId;

		for (const file of wrappedFolder.files) {
			// Check each file upload within the folder for name conflicts
			await resolveFileNameConflicts({
				wrappedFile: file,
				conflictResolution,
				destinationFileName: file.getBaseName(),
				prompts,
				destFolderId: destinationFolderId,
				getConflictInfoFn
			});
		}

		for (const folder of wrappedFolder.folders) {
			// Recurse into each folder to check for more name conflicts
			await resolveFolderNameConflicts({
				wrappedFolder: folder,
				conflictResolution,
				getConflictInfoFn,
				destinationFolderName: folder.getBaseName(),
				destFolderId: destinationFolderId,
				prompts
			});
		}
	}
}

/**
 * Utility function for finding name conflicts within NameConflictInfo
 * Returns a union of objects to be safely used in type narrowing
 */
function checkNameInfoForConflicts(
	destinationName: string,
	nameConflictInfo: NameConflictInfo
):
	| { existingFolderConflict: FolderNameAndId; existingFileConflict: undefined }
	| { existingFolderConflict: undefined; existingFileConflict: FileConflictInfo }
	| { existingFolderConflict: undefined; existingFileConflict: undefined } {
	const conflictResult = { existingFolderConflict: undefined, existingFileConflict: undefined };

	const existingFolderConflict = nameConflictInfo.folders.find((f) => f.folderName === destinationName);
	if (existingFolderConflict) {
		return { ...conflictResult, existingFolderConflict };
	}

	const existingFileConflict = nameConflictInfo.files.find((f) => f.fileName === destinationName);
	if (existingFileConflict) {
		return { ...conflictResult, existingFileConflict };
	}

	return conflictResult;
}
