import { createDecipheriv, DecipherGCM } from 'crypto';
import { Transform } from 'stream';
import { CipherIV, FileKey } from '../types';

const algo = 'aes-256-gcm'; // crypto library does not accept this in uppercase. So gotta keep using aes-256-gcm
const authTagLength = 16;

export class StreamDecrypt extends Transform {
	private readonly decipher: DecipherGCM;

	constructor(cipherIV: CipherIV, fileKey: FileKey, authTag: Buffer) {
		super();
		const iv: Buffer = Buffer.from(cipherIV, 'base64');
		this.decipher = createDecipheriv(algo, fileKey, iv, { authTagLength });
		this.decipher.setAuthTag(authTag);
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
			next(err);
		}
	}
}
