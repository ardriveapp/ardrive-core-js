import { statSync } from 'fs';
import { dirname, join as joinPath, resolve as resolvePath } from 'path';

export function resolveLocalFilePath(destFolderPath: string, defaultFileName: string, stat = statSync): string {
	const fullPath = resolvePath(destFolderPath);
	try {
		const pathStats = stat(fullPath);
		if (pathStats.isDirectory()) {
			// the path exists and it is a directory
			return joinPath(fullPath, defaultFileName);
		} else {
			// the path exists and it is a file
			return fullPath;
		}
	} catch (e) {
		const parentFolderPath = dirname(fullPath);
		const parentPathStats = stat(parentFolderPath);
		if (parentPathStats.isDirectory()) {
			// the path does not exist, but the parent is an existing directory
			return fullPath;
		}
		// neither path nor its parent exist
		throw e;
	}
}
