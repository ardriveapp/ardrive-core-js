/**
 * Sealing and opening a Drive State body.
 *
 *     public:   SQLite file -> gzip
 *     private:  SQLite file -> gzip -> AES-256-GCM under the drive key
 *
 * A private body is the ciphertext followed by the 16-byte GCM tag, and its
 * 12-byte nonce travels in the `Cipher-IV` tag. Gzip is optional on read: a
 * reader tells the two apart by the first bytes. Inflation is bounded while it
 * runs, never afterwards, because the size a gzip trailer records is chosen by
 * whoever wrote the stream.
 */
import { Gunzip, gzipSync } from 'fflate';
import * as zlib from 'zlib';
import { DRIVE_STATE_CIPHER, DRIVE_STATE_MAX_PLAINTEXT_BYTES } from './drive_state_tags';
import { driveStateCipher } from './drive_state_cipher';
import { refuse } from './drive_state_outcome';

const GZIP_MAGIC = [0x1f, 0x8b];
const SQLITE_HEADER = Buffer.concat([Buffer.from('SQLite format 3', 'ascii'), Buffer.from([0])]);

/** What a reader's own drive record says about the drive's encryption. */
export type DriveStateProtection = { kind: 'public' } | { kind: 'private'; driveKey: Uint8Array };

export interface SealedDriveState {
	body: Uint8Array;
	/** The `Cipher` tag, present for a private drive only. */
	cipher?: string;
	/** The `Cipher-IV` tag: base64url without padding, present for a private drive only. */
	cipherIV?: string;
}

function startsWith(bytes: Uint8Array, prefix: ArrayLike<number>): boolean {
	if (bytes.byteLength < prefix.length) {
		return false;
	}
	for (let i = 0; i < prefix.length; i++) {
		if (bytes[i] !== prefix[i]) {
			return false;
		}
	}
	return true;
}

export function encodeCipherIV(nonce: Uint8Array): string {
	// By hand rather than 'base64url', which the browser build's Buffer lacks.
	return Buffer.from(nonce).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The nonce in a `Cipher-IV` tag. Writers use base64url without padding;
 * readers also accept standard base64, with or without padding.
 */
export function decodeCipherIV(tag: string): Uint8Array {
	const unpadded = tag.replace(/=+$/, '');
	if (!/^[A-Za-z0-9+/_-]*$/.test(unpadded) || unpadded.length % 4 === 1 || tag.length - unpadded.length > 2) {
		throw new Error(`"${tag}" is not base64`);
	}
	return Buffer.from(unpadded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Compresses [plaintext] and, for a private drive, encrypts it. Refuses a
 * payload of {@link DRIVE_STATE_MAX_PLAINTEXT_BYTES} or more, which every
 * reader would refuse.
 */
export async function sealDriveState(
	plaintext: Uint8Array,
	protection: DriveStateProtection
): Promise<SealedDriveState> {
	if (plaintext.byteLength >= DRIVE_STATE_MAX_PLAINTEXT_BYTES) {
		throw new Error(
			`the drive state is ${plaintext.byteLength} bytes, at or above the ` +
				`${DRIVE_STATE_MAX_PLAINTEXT_BYTES} byte limit every reader enforces`
		);
	}
	// mtime 0 so the same payload always seals to the same compressed bytes.
	const compressed = gzipSync(plaintext, { level: 9, mtime: 0 });
	if (protection.kind === 'public') {
		return { body: compressed };
	}
	const cipher = driveStateCipher();
	const nonce = cipher.newNonce();
	return {
		body: await cipher.encrypt(protection.driveKey, nonce, compressed),
		cipher: DRIVE_STATE_CIPHER,
		cipherIV: encodeCipherIV(nonce)
	};
}

class InflationLimitExceeded extends Error {
	constructor(readonly reached: number) {
		super(`inflated past ${reached} bytes`);
	}
}

/**
 * Node's native gunzip, about four times faster than fflate on a large drive.
 * The browser build stubs `zlib` out, which leaves this undefined and fflate
 * in use.
 */
const nativeGunzip: typeof zlib.gunzipSync | undefined =
	typeof zlib.gunzipSync === 'function' ? zlib.gunzipSync : undefined;

/** Inflates [compressed], stopping at the first byte past [limit]. */
export function gunzipBounded(compressed: Uint8Array, limit = DRIVE_STATE_MAX_PLAINTEXT_BYTES): Uint8Array {
	if (nativeGunzip) {
		try {
			// maxOutputLength stops inflating as soon as the output would pass it.
			return new Uint8Array(nativeGunzip(compressed, { maxOutputLength: limit }));
		} catch (e) {
			if ((e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
				throw new InflationLimitExceeded(limit + 1);
			}
			throw e;
		}
	}
	return gunzipBoundedPortable(compressed, limit);
}

/** {@link gunzipBounded} without Node's zlib, for the browser. Exported for tests. */
export function gunzipBoundedPortable(compressed: Uint8Array, limit = DRIVE_STATE_MAX_PLAINTEXT_BYTES): Uint8Array {
	const chunks: Uint8Array[] = [];
	let total = 0;
	let ended = false;
	const gunzip = new Gunzip((chunk, final) => {
		total += chunk.byteLength;
		if (total > limit) {
			throw new InflationLimitExceeded(total);
		}
		chunks.push(chunk);
		if (final) {
			ended = true;
		}
	});
	// Fed in small slices: gzip expands at most about 1032 to 1, so no single
	// output chunk can be far past the limit before the check above runs.
	const slice = 16 * 1024;
	for (let offset = 0; offset < compressed.byteLength; offset += slice) {
		const end = Math.min(offset + slice, compressed.byteLength);
		gunzip.push(compressed.subarray(offset, end), end === compressed.byteLength);
	}
	if (compressed.byteLength === 0) {
		gunzip.push(new Uint8Array(0), true);
	}
	if (!ended) {
		throw new Error('the gzip stream ended early');
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.byteLength;
	}
	return out;
}

/**
 * Opens a body under the drive's own protection and returns the SQLite file.
 * Every failure is a {@link refuse} with the outcome ardrive-web gives it.
 */
export async function openDriveState(
	body: Uint8Array,
	envelope: { cipher?: string; nonce?: Uint8Array },
	protection: DriveStateProtection,
	limit = DRIVE_STATE_MAX_PLAINTEXT_BYTES
): Promise<Uint8Array> {
	const encrypted = envelope.cipher !== undefined;
	if (protection.kind === 'private' && !encrypted) {
		refuse('privacy-mismatch', 'the drive is private and the artifact declares no cipher');
	}
	if (protection.kind === 'public' && encrypted) {
		refuse('privacy-mismatch', `the drive is public and the artifact declares ${envelope.cipher}`);
	}
	if (encrypted && envelope.cipher !== DRIVE_STATE_CIPHER) {
		refuse(
			'unknown-version',
			`encrypted drive states are ${DRIVE_STATE_CIPHER} only, and this one declares ${envelope.cipher}`
		);
	}

	let compressed = body;
	if (protection.kind === 'private') {
		try {
			compressed = await driveStateCipher().decrypt(protection.driveKey, envelope.nonce!, body);
		} catch (e) {
			refuse('decrypt-failed', `the body did not decrypt under the drive key: ${e}`);
		}
	}

	if (startsWith(compressed, SQLITE_HEADER)) {
		if (compressed.byteLength > limit) {
			refuse(
				'integrity-failed',
				`the SQLite file is ${compressed.byteLength} bytes, past the ${limit} byte limit`
			);
		}
		return compressed;
	}
	if (!startsWith(compressed, GZIP_MAGIC)) {
		refuse('integrity-failed', 'the payload is neither a gzip stream nor a SQLite file');
	}
	try {
		return gunzipBounded(compressed, limit);
	} catch (e) {
		if (e instanceof InflationLimitExceeded) {
			refuse(
				'integrity-failed',
				`the payload expands past the ${limit} byte limit (${compressed.byteLength} compressed bytes reached ${e.reached})`
			);
		}
		refuse('integrity-failed', `the payload is not a gzip stream: ${e}`);
	}
}
