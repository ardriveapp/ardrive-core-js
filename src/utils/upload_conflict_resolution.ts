import {
	askOnConflicts,
	errorOnConflict,
	renameOnConflicts,
	replaceOnConflicts,
	ResolveFileNameConflictsParams,
	ResolveFolderNameConflictsParams,
	skipOnConflicts,
	upsertOnConflicts,
	useExistingFolder
} from '../types';
import { NameConflictInfo, FolderNameAndId, FileConflictInfo } from './mapper_functions';

export async function resolveFileNameConflicts({
	wrappedFile,
	conflictResolution,
	destinationFileName: destFileName,
	nameConflictInfo,
	prompts
}: ResolveFileNameConflictsParams): Promise<void> {
	const existingNameAtDestConflict = checkNameInfoForConflicts(destFileName, nameConflictInfo);

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
			wrappedFile.newFileName = userInput.newFileName;
			return;

		case replaceOnConflicts:
			// Proceed with new revision
			wrappedFile.existingId = existingNameAtDestConflict.existingFileConflict?.fileId;
			return;
	}
}

export async function resolveFolderNameConflicts({
	wrappedFolder,
	nameConflictInfo,
	destinationFolderName: destFolderName,
	prompts,
	conflictResolution,
	getConflictInfoFn
}: ResolveFolderNameConflictsParams): Promise<void> {
	const existingNameAtDestConflict = checkNameInfoForConflicts(destFolderName, nameConflictInfo);

	if (!existingNameAtDestConflict.existingFileConflict && !existingNameAtDestConflict.existingFolderConflict) {
		// There are no conflicts, continue folder upload
		return;
	}

	if (conflictResolution !== askOnConflicts) {
		if (existingNameAtDestConflict.existingFileConflict) {
			// Folders cannot overwrite files
			// Skip this folder and all its contents
			wrappedFolder.conflictResolution = skipOnConflicts;
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
				wrappedFolder.newFolderName = userInput.newFolderName;

				// Conflict resolved by rename -- return early, do NOT recurse into this folder
				return;
		}
	}

	if (wrappedFolder.existingId) {
		// Re-using existing folder id, check for name conflicts inside the folder
		const childConflictInfo = await getConflictInfoFn(wrappedFolder.existingId);

		for await (const file of wrappedFolder.files) {
			// Check each file upload within the folder for name conflicts
			await resolveFileNameConflicts({
				wrappedFile: file,
				conflictResolution,
				destinationFileName: file.getBaseFileName(),
				nameConflictInfo: childConflictInfo,
				prompts
			});
		}

		for await (const folder of wrappedFolder.folders) {
			// Recurse into each folder to check for more name conflicts
			await resolveFolderNameConflicts({
				wrappedFolder: folder,
				conflictResolution,
				getConflictInfoFn,
				destinationFolderName: folder.getBaseFileName(),
				nameConflictInfo: childConflictInfo,
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
