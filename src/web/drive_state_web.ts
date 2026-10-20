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
 * [locateFile] maps the wasm file name sql.js asks for to its URL. The name
 * depends on which sql.js entry the bundler picks: `sql-wasm-browser.wasm`
 * under the `browser` export condition, `sql-wasm.wasm` otherwise. Serving
 * the package's `dist/` directory covers both. Until this is called, listings
 * skip Drive State.
 *
 *     enableDriveState({ locateFile: (file) => `/assets/${file}` });
 */
export function enableDriveState({ locateFile }: { locateFile: (file: string) => string }): void {
	setDefaultArtifactEngine(new SqlJsArtifactEngine({ locateFile }));
}
