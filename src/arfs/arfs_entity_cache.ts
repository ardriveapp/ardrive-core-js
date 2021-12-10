import { Cache, SimpleCache } from '@alexsasharegan/simple-cache';

export class ArFSEntityCache<K, V> {
	private cache: Cache<string, Promise<V>>;

	constructor(capacity: number) {
		this.cache = SimpleCache<string, Promise<V>>(capacity);
	}

	put(key: K, value: Promise<V>): Promise<V> {
		this.cache.write(`${key}`, value);
		return value;
	}

	get(key: K): Promise<V> | undefined {
		return this.cache.read(`${key}`);
	}

	remove(key: K): void {
		this.cache.remove(`${key}`);
	}

	clear(): void {
		this.cache.clear();
	}

	size(): number {
		return this.cache.size();
	}
}
