import { createDecipheriv, Decipher, DecipherGCM } from 'crypto';
import { Transform } from 'stream';
import { CipherIV, FileKey } from '../types';
import { authTagLength } from './constants';
import { aesCtrInitialCounterFromIv, CIPHER_AES_256_CTR, CIPHER_AES_256_GCM } from './crypto';

const gcmAlgo = 'aes-256-gcm'; // crypto library does not accept this in uppercase. So gotta keep using aes-256-gcm
const ctrAlgo = 'aes-256-ctr'; // AES-256-CTR: ardrive-web writes this for streamed (large) private files

/**
 * Streaming decryptor for private file DATA transactions. This is the load-bearing path for
 * LARGE files, which ardrive-web encrypts with AES-256-CTR (no auth tag). Branches on the
 * on-chain `Cipher` tag of the data transaction:
 *  - AES256-CTR: `aes-256-ctr` seeded with the 12-byte `Cipher-IV` nonce as the initial
 *    counter block (see {@link aesCtrInitialCounterFromIv}); UNAUTHENTICATED, matching
 *    ardrive-web's `SecretBox(data, nonce: cipherIv, mac: Mac.empty)`. There is no auth tag
 *    to fetch, strip, or verify — the caller passes `null`.
 *  - AES256-GCM (or absent/legacy default): the original authenticated path; the caller
 *    supplies the trailing 16-byte auth tag fetched separately.
 */
export class StreamDecrypt extends Transform {
	private readonly decipher: Decipher;

	constructor(cipherIV: CipherIV, fileKey: FileKey, authTag: Buffer | null, cipher: string = CIPHER_AES_256_GCM) {
		super();
		const iv: Buffer = Buffer.from(cipherIV, 'base64');
		if (cipher === CIPHER_AES_256_CTR) {
			this.decipher = createDecipheriv(ctrAlgo, fileKey.keyData, aesCtrInitialCounterFromIv(iv));
		} else {
			if (!authTag) {
				throw new Error(`Missing auth tag for ${gcmAlgo} stream decryption`);
			}
			const gcm: DecipherGCM = createDecipheriv(gcmAlgo, fileKey.keyData, iv, { authTagLength });
			gcm.setAuthTag(authTag);
			this.decipher = gcm;
		}
	}

	_transform(chunk: Buffer, _encoding: BufferEncoding, next: (err?: Error, data?: Buffer) => void): void {
		const decryptedChunk = this.decipher.update(chunk);
		this.push(decryptedChunk);
		next();
	}

	_flush(next: (err?: Error, data?: Buffer) => void): void {
		try {
			const decipherFinalData = this.decipher.final();
			this.push(decipherFinalData);
			next();
		} catch (err) {
			next(err as Error);
		}
	}
}
