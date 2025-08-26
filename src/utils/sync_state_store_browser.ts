import { BaseSyncStateStore } from './sync_state_store';

/**
 * Browser localStorage based storage
 * Note: localStorage has size limits (~5-10MB) and is synchronous
 * For larger datasets, consider IndexedDB
 */
export class LocalStorageSyncStateStore extends BaseSyncStateStore {
	constructor(private prefix: string = 'ardrive-') {
		super();
	}

	private getStorageKey(key: string): string {
		return `${this.prefix}${key}`;
	}

	protected async saveRaw(key: string, data: string): Promise<void> {
		if (typeof window === 'undefined' || !window.localStorage) {
			throw new Error('localStorage is not available');
		}
		window.localStorage.setItem(this.getStorageKey(key), data);
	}

	protected async loadRaw(key: string): Promise<string | undefined> {
		if (typeof window === 'undefined' || !window.localStorage) {
			throw new Error('localStorage is not available');
		}
		const data = window.localStorage.getItem(this.getStorageKey(key));
		return data ?? undefined;
	}

	protected async clearRaw(key: string): Promise<void> {
		if (typeof window === 'undefined' || !window.localStorage) {
			throw new Error('localStorage is not available');
		}
		window.localStorage.removeItem(this.getStorageKey(key));
	}

	protected async listKeys(): Promise<string[]> {
		if (typeof window === 'undefined' || !window.localStorage) {
			throw new Error('localStorage is not available');
		}
		const keys: string[] = [];
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (key && key.startsWith(this.prefix)) {
				keys.push(key.substring(this.prefix.length));
			}
		}
		return keys;
	}

	protected async clearAllRaw(): Promise<void> {
		if (typeof window === 'undefined' || !window.localStorage) {
			throw new Error('localStorage is not available');
		}
		const keysToRemove: string[] = [];
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (key && key.startsWith(this.prefix)) {
				keysToRemove.push(key);
			}
		}
		keysToRemove.forEach((key) => window.localStorage.removeItem(key));
	}
}

/**
 * Browser IndexedDB based storage
 * Better for larger datasets and supports async operations
 */
export class IndexedDBSyncStateStore extends BaseSyncStateStore {
	private dbName: string;
	private storeName = 'syncStates';
	private db: IDBDatabase | null = null;

	constructor(dbName: string = 'ardrive-sync-cache') {
		super();
		this.dbName = dbName;
	}

	private async ensureDB(): Promise<IDBDatabase> {
		if (this.db) return this.db;

		if (typeof window === 'undefined' || !window.indexedDB) {
			throw new Error('IndexedDB is not available');
		}

		return new Promise((resolve, reject) => {
			const request = window.indexedDB.open(this.dbName, 1);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve(this.db);
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName, { keyPath: 'key' });
				}
			};
		});
	}

	protected async saveRaw(key: string, data: string): Promise<void> {
		const db = await this.ensureDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.put({ key, data });

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	protected async loadRaw(key: string): Promise<string | undefined> {
		const db = await this.ensureDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.get(key);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const result = request.result;
				resolve(result ? result.data : undefined);
			};
		});
	}

	protected async clearRaw(key: string): Promise<void> {
		const db = await this.ensureDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.delete(key);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	protected async listKeys(): Promise<string[]> {
		const db = await this.ensureDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.getAllKeys();

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				resolve(request.result as string[]);
			};
		});
	}

	protected async clearAllRaw(): Promise<void> {
		const db = await this.ensureDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.clear();

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	/**
	 * Delete the entire database
	 */
	async destroy(): Promise<void> {
		await this.close();
		if (typeof window === 'undefined' || !window.indexedDB) {
			throw new Error('IndexedDB is not available');
		}

		return new Promise((resolve, reject) => {
			const request = window.indexedDB.deleteDatabase(this.dbName);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}
}
