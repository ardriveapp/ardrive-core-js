import { gcm } from '@noble/ciphers/aes.js';
import { DriveStateCipher, setDriveStateCipher } from '../drive_state/drive_state_cipher';
import { setDefaultArtifactEngine, SqlJsArtifactEngine } from '../drive_state/artifact_engine';

/** AES-256-GCM for Drive State bodies in the browser. */
const webDriveStateCipher: DriveStateCipher = {
	async encrypt(key, nonce, plaintext) {
		return gcm(key, nonce).encrypt(plaintext);
	},
	async decrypt(key, nonce, body) {
		return gcm(key, nonce).decrypt(body);
	},
	newNonce() {
		return crypto.getRandomValues(new Uint8Array(12));
	}
};

setDriveStateCipher(webDriveStateCipher);

/**
 * Turns on reading drives from their Drive State artifacts in the browser.
 * [locateFile] returns the URL of `sql-wasm.wasm` from the `sql.js` package,
 * which the page must serve. Until this is called, listings skip Drive State.
 *
 *     enableDriveState({ locateFile: (file) => `/assets/${file}` });
 */
export function enableDriveState({ locateFile }: { locateFile: (file: string) => string }): void {
	setDefaultArtifactEngine(new SqlJsArtifactEngine({ locateFile }));
}
