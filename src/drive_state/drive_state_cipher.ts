/**
 * AES-256-GCM for Drive State bodies, behind a seam: Node's `crypto` by
 * default, and the browser build's own implementation through
 * {@link setDriveStateCipher}.
 */
import * as crypto from 'crypto';

export interface DriveStateCipher {
	/** Returns the ciphertext followed by the 16-byte authentication tag. */
	encrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
	/** Decrypts ciphertext followed by its tag. Throws when the tag does not verify. */
	decrypt(key: Uint8Array, nonce: Uint8Array, body: Uint8Array): Promise<Uint8Array>;
	/** 12 random bytes. */
	newNonce(): Uint8Array;
}

const TAG_LENGTH = 16;

export const nodeDriveStateCipher: DriveStateCipher = {
	async encrypt(key, nonce, plaintext) {
		const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LENGTH });
		return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
	},
	async decrypt(key, nonce, body) {
		if (body.byteLength < TAG_LENGTH) {
			throw new Error(`the body is ${body.byteLength} bytes, shorter than its authentication tag`);
		}
		const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LENGTH });
		decipher.setAuthTag(body.subarray(body.byteLength - TAG_LENGTH));
		return Buffer.concat([decipher.update(body.subarray(0, body.byteLength - TAG_LENGTH)), decipher.final()]);
	},
	newNonce() {
		return crypto.randomBytes(12);
	}
};

let current: DriveStateCipher = nodeDriveStateCipher;

export function driveStateCipher(): DriveStateCipher {
	return current;
}

export function setDriveStateCipher(cipher: DriveStateCipher): void {
	current = cipher;
}
