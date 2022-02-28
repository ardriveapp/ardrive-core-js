import os from 'os';
import { join as joinPath } from 'path';
import Loki from 'lokijs';

const CACHE_DB_NAME = process.env.NODE_ENV === 'test' ? 'testMetadata' : 'metadata';
const CACHE_DB_DIRECTORY = joinPath(os.homedir(), '.ardrive/caches', CACHE_DB_NAME);

interface CacheEntry<V> {
	key: string;
	value: V;
}

export class ArFSEntityCache<K, V> {
	// private cache: Cache<string, Promise<V>>;
	private static db: Loki = new Loki(CACHE_DB_DIRECTORY);
	private readonly collection: Collection<CacheEntry<V>>;

	constructor(private readonly collectionName: string) {
		this.collection = this.setupCollection();
	}

	private setupCollection(): Collection<CacheEntry<V>> {
		const existingCollection = ArFSEntityCache.db.getCollection<CacheEntry<V>>(this.collectionName);
		return (
			existingCollection ??
			ArFSEntityCache.db.addCollection<CacheEntry<V>>(this.collectionName, { unique: ['key'] })
		);
	}

	cacheKeyString(key: K): string {
		// Note: This implementation may not sufficiently differentiate keys
		// for certain object types depending on their toJSON implementation
		return typeof key === 'string' ? key : JSON.stringify(key);
	}

	async put(key: K, value: Promise<V>): Promise<V> {
		const stringifiedKey = this.cacheKeyString(key);
		const doc = this.collection.by('key', this.getIndexForKey(key));
		const awaitedValue = await value;
		if (doc) {
			doc.value = awaitedValue;
			this.collection.update(doc);
		} else {
			const entry: CacheEntry<V> = { key: stringifiedKey, value: awaitedValue };
			this.collection.insert(entry);
		}
		return value;
	}

	get(key: K): Promise<V> | undefined {
		const entry = this.collection.findOne({ key: this.cacheKeyString(key) });
		const result = entry?.value;
		return result ? Promise.resolve(result) : undefined;
	}

	remove(key: K): void {
		const entryIndex = this.getIndexForKey(key);
		this.collection.remove(entryIndex);
	}

	clear(): void {
		this.collection.clear();
	}

	size(): number {
		return this.collection.count();
	}

	private getIndexForKey(key: K): number {
		const entry = this.collection.findOne({ key: this.cacheKeyString(key) });
		const index = entry?.$loki;
		return index || -1;
	}
}
