import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { BaseSyncStateStore } from './sync_state_store';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const stat = promisify(fs.stat);

/**
 * File system based storage for Node.js environments
 * Stores each sync state as a JSON file
 */
export class FileSystemSyncStateStore extends BaseSyncStateStore {
	constructor(private basePath: string = '.ardrive-cache') {
		super();
	}

	private async ensureDirectory(): Promise<void> {
		try {
			await stat(this.basePath);
		} catch {
			await mkdir(this.basePath, { recursive: true });
		}
	}

	private getFilePath(key: string): string {
		return path.join(this.basePath, `${key}.json`);
	}

	protected async saveRaw(key: string, data: string): Promise<void> {
		await this.ensureDirectory();
		await writeFile(this.getFilePath(key), data, 'utf-8');
	}

	protected async loadRaw(key: string): Promise<string | undefined> {
		try {
			const data = await readFile(this.getFilePath(key), 'utf-8');
			return data;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}
			throw error;
		}
	}

	protected async clearRaw(key: string): Promise<void> {
		try {
			await unlink(this.getFilePath(key));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
	}

	protected async listKeys(): Promise<string[]> {
		try {
			const files = await readdir(this.basePath);
			return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)); // Remove .json extension
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return [];
			}
			throw error;
		}
	}

	protected async clearAllRaw(): Promise<void> {
		try {
			const files = await readdir(this.basePath);
			await Promise.all(files.map((file) => unlink(path.join(this.basePath, file))));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
	}

	/**
	 * Delete the cache directory and all its contents
	 */
	async destroy(): Promise<void> {
		try {
			await this.clearAllRaw();
			await rmdir(this.basePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
	}
}
