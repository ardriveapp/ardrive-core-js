import * as fs from 'fs';
import * as os from 'os';
import path from 'path';

/**
 * Sealed Drive State bodies on disk, by drive and transaction id, so a CLI
 * that lists a drive twice downloads its artifact once.
 *
 * Only the body as the gateway served it is kept: for a private drive that is
 * ciphertext, the same exposure as the encrypted metadata core-js already
 * caches. Each drive keeps only its newest body. A transaction's data never
 * changes, so an entry never goes stale.
 */
export class DriveStateBodyCache {
	constructor(readonly folder: string = DriveStateBodyCache.defaultFolder()) {}

	static defaultFolder(): string {
		const base = process.env['XDG_CACHE_HOME'] ?? os.homedir();
		return os.platform() === 'win32'
			? path.join(base, 'ardrive-caches', 'drive-state')
			: path.join(base, '.ardrive', 'caches', 'drive-state');
	}

	private pathFor(driveId: string, txId: string): string {
		// Both come from a gateway; refuse anything that could leave the folder.
		if (!/^[A-Za-z0-9_-]+$/.test(driveId) || !/^[A-Za-z0-9_-]+$/.test(txId)) {
			throw new Error(`refusing to cache ${driveId}/${txId}`);
		}
		return path.join(this.folder, driveId, txId);
	}

	async get(driveId: string, txId: string): Promise<Buffer | undefined> {
		try {
			const body = await fs.promises.readFile(this.pathFor(driveId, txId));
			// An empty file is no body: a write that never finished, or a stubbed fs.
			return body.byteLength > 0 ? body : undefined;
		} catch {
			return undefined;
		}
	}

	/** Drops a cached body, such as one the reader refused. Never throws. */
	async remove(driveId: string, txId: string): Promise<void> {
		try {
			await fs.promises.rm(this.pathFor(driveId, txId), { force: true });
		} catch {
			// Nothing to drop.
		}
	}

	/** Stores [body] as the drive's one cached artifact. Never throws. */
	async put(driveId: string, txId: string, body: Uint8Array): Promise<void> {
		try {
			const file = this.pathFor(driveId, txId);
			const dir = path.dirname(file);
			await fs.promises.mkdir(dir, { recursive: true });
			for (const old of await fs.promises.readdir(dir)) {
				if (old !== txId) {
					await fs.promises.rm(path.join(dir, old), { force: true });
				}
			}
			// Written aside and renamed, so a reader never sees half a body.
			const partial = `${file}.${process.pid}.partial`;
			await fs.promises.writeFile(partial, body);
			await fs.promises.rename(partial, file);
		} catch (e) {
			if (process.env['ARDRIVE_CACHE_LOG'] === '1') {
				console.error(`[drive-state] could not cache ${txId}: ${e}`);
			}
		}
	}
}
