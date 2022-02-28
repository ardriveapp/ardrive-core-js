import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import { TransactionID } from '../types';

export class ArFSMetadataCache {
	private static cacheFolderPromise?: Promise<string>;
	private static shouldCacheLog = process.env['ARDRIVE_CACHE_LOG'] === '1';

	static async getCacheFolder(): Promise<string> {
		// Don't kick off another setup while setup is in progress
		if (this.cacheFolderPromise) {
			return this.cacheFolderPromise;
		}

		const homeDir = os.homedir();
		const metadataCacheDir = path.join(homeDir, '.ardrive', 'caches', 'metadata');
		if (fs.existsSync(metadataCacheDir)) {
			this.cacheFolderPromise = Promise.resolve(metadataCacheDir);
			return this.cacheFolderPromise;
		}
		this.cacheFolderPromise = fs.promises.mkdir(`${metadataCacheDir}`, { recursive: true }).then((result) => {
			if (!result) {
				throw new Error('Could not create persistent ArFS entity cache!');
			}
			return result;
		});
		return this.cacheFolderPromise;
	}

	static async put(txId: TransactionID, buffer: Buffer): Promise<void> {
		return ArFSMetadataCache.getCacheFolder().then((cacheFolder) => {
			const cacheFilePath = path.join(cacheFolder, `${txId}`);
			if (this.shouldCacheLog) {
				console.error(`Caching to file ${cacheFilePath}`);
			}
			return fs.promises.writeFile(cacheFilePath, buffer);
		});
	}

	static async get(txId: TransactionID): Promise<Buffer | undefined> {
		return ArFSMetadataCache.getCacheFolder().then((cacheFolder) => {
			const cachedFilePath = path.join(cacheFolder, `${txId}`);
			if (!fs.existsSync(cachedFilePath)) {
				return undefined;
			}

			return fs.promises
				.readFile(cachedFilePath)
				.then((cachedData) => {
					if (this.shouldCacheLog) {
						console.error(`file cache hit for ${txId}`);
					}
					return cachedData;
				})
				.catch((err) => {
					console.error(`failed to load cache file at path ${cachedFilePath}! Err: ${err}`);
					fs.rmSync(cachedFilePath); // TODO: robustness needed
					return undefined;
				});
		});
	}
}
