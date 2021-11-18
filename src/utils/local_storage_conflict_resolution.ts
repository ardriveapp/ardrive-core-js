import { stat, Stats } from 'fs';
import { promisify } from 'util';
import { ArFSPrivateFile, ArFSPublicFile } from '../arfs/arfs_entities';
import { FileNameConflictResolution, replaceOnConflicts, upsertOnConflicts } from '../types';

const statPromise = promisify(stat);

export async function proceedWritingFile(
	destinationPath: string,
	remoteFile: ArFSPrivateFile | ArFSPublicFile,
	conflictResolutionStrategy: FileNameConflictResolution
): Promise<boolean> {
	const remoteFileLastModifiedDate = Math.ceil(+remoteFile.lastModifiedDate / 1000);
	return await statPromise(destinationPath)
		.catch(() => {
			// file does not exist
			return true;
		})
		.then((value: Stats | boolean) => {
			if (typeof value === 'boolean') {
				// early return the same boolean value that came from catch()
				return value;
			}
			const fileStat = value;
			// file exist with the same name...
			if (fileStat.isDirectory()) {
				if ([upsertOnConflicts, replaceOnConflicts].includes(conflictResolutionStrategy)) {
					throw new Error(`Cannot override the directory "${destinationPath}" with a file!`);
				}
				console.debug(`Skipping existing directory ${destinationPath}`);
				return false;
			}
			const localFileLastModifiedDate = fileStat.mtime.getTime() / 1000;
			if (localFileLastModifiedDate === remoteFileLastModifiedDate) {
				// ... and has the same last-modified-date
				if (conflictResolutionStrategy === replaceOnConflicts) {
					console.debug(`Replace existing file ${destinationPath}`);
					return true;
				}
				console.debug(`Skip existing file ${destinationPath}`);
				return false;
			} else {
				console.debug(`Different timestamps: ${localFileLastModifiedDate} !== ${remoteFileLastModifiedDate}`);
				// ... but the last-modified-dates differ
				if ([upsertOnConflicts, replaceOnConflicts].includes(conflictResolutionStrategy)) {
					console.debug(`Replace existing but different file ${destinationPath}`);
					return true;
				}
				console.debug(`Skip existing but different file ${destinationPath}`);
				return false;
			}
		});
}

export async function proceedWritingFolder(
	destinationPath: string,
	conflictResolutionStrategy: FileNameConflictResolution
): Promise<boolean> {
	return await statPromise(destinationPath)
		.catch(() => {
			// directory does not exist
			return true;
		})
		.then((value: Stats | boolean) => {
			// file exist with the same name...
			if (typeof value === 'boolean') {
				// early return the same boolean value that came from catch()
				return value;
			}
			const fileStat = value;
			if (fileStat.isDirectory()) {
				// ... and is an actual directory
				console.debug(`Re-use existing directory ${destinationPath}`);
				return false;
			} else {
				// ... but is not a directory
				if ([upsertOnConflicts, replaceOnConflicts].includes(conflictResolutionStrategy)) {
					throw new Error(`Cannot override the file "${destinationPath}" with a folder!`);
				}
				console.debug(`Skip existing file ${destinationPath}`);
				return false;
			}
		});
}
