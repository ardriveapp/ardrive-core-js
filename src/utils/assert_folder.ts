import { statSync } from 'fs';

export function assertFolderExists(folderPath: string): void {
	const folderStats = statSync(folderPath);
	if (!folderStats.isDirectory()) {
		throw new Error(`Path "${folderPath}" is not a directory!`);
	}
}
