// Minimal in-memory metadata cache for browser builds.
export class ArFSMetadataCacheWeb {
	private static cache = new Map<string, Uint8Array>();

	static async put(txId: string, buffer: Uint8Array): Promise<void> {
		this.cache.set(txId, buffer);
	}

	static async get(txId: string): Promise<Uint8Array | undefined> {
		return this.cache.get(txId);
	}
}
