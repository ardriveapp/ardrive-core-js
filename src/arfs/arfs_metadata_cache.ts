import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import { TransactionID } from '../types';

export class ArFSMetadataCache {
	private static cacheFolderPromise?: Promise<string>;
	private static shouldCacheLog = process.env['ARDRIVE_CACHE_LOG'] === '1';
	private static metadataCacheFolder = ArFSMetadataCache.platformCacheFolder();
	private static logTag = '[Metadata Cache] ';

	private static platformCacheFolder(): string {
		const cacheBaseFolder = process.env['XDG_CACHE_HOME'] ?? os.homedir();
		return os.platform() === 'win32'
			? path.join(cacheBaseFolder, 'ardrive-caches', 'metadata')
			: path.join(cacheBaseFolder, '.ardrive', 'caches', 'metadata');
	}

	static async getCacheFolder(): Promise<string> {
		// Don't kick off another setup while setup is in progress
		if (this.cacheFolderPromise) {
			return this.cacheFolderPromise;
		}

		if (fs.existsSync(this.metadataCacheFolder)) {
			this.cacheFolderPromise = Promise.resolve(this.metadataCacheFolder);
			return this.cacheFolderPromise;
		}

		if (this.shouldCacheLog) {
			console.error(this.logTag, `Creating ArDrive metadata cache folder at ${this.metadataCacheFolder}...`);
		}
		this.cacheFolderPromise = fs.promises
			.mkdir(`${this.metadataCacheFolder}`, { recursive: true })
			.then((result) => {
				if (!result) {
					throw new Error('Could not create persistent ArFS entity metadata cache!');
				}
				if (this.shouldCacheLog) {
					console.error(this.logTag, `Created ArDrive metadata cache folder at ${this.metadataCacheFolder}.`);
				}
				return this.metadataCacheFolder;
			});
		return this.cacheFolderPromise;
	}

	static async put(txId: TransactionID, buffer: Buffer): Promise<void> {
		return ArFSMetadataCache.getCacheFolder().then((cacheFolder) => {
			const cacheFilePath = path.join(cacheFolder, `${txId}`);
			if (this.shouldCacheLog) {
				console.error(this.logTag, `Caching metadata to file ${cacheFilePath}`);
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
						console.error(this.logTag, `Metadata cache hit for ${txId}`);
					}
					return cachedData;
				})
				.catch((err) => {
					console.error(
						this.logTag,
						`Failed to load metadata cache file at path ${cachedFilePath}! Err: ${err}`
					);
					fs.rmSync(cachedFilePath); // TODO: robustness needed
					return undefined;
				});
		});
	}
}
