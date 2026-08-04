import { expect } from 'chai';
import { createCipheriv } from 'crypto';
import { EntityKey } from '../types';
import { EntityDecryptionError } from '../types/exceptions';
import {
	aesCtrInitialCounterFromIv,
	CIPHER_AES_256_CTR,
	CIPHER_AES_256_GCM,
	driveDecrypt,
	driveEncrypt,
	fileDecrypt,
	fileEncrypt
} from './crypto';

// Regression coverage for the AES-256-CTR interop fix (ardrive-web writes AES256-CTR for
// streamed/large private files) and for killing the silent `Buffer.from('Error')` sentinel.
describe('AES-256-CTR private-entity decryption — ardrive-web interop [aes-ctr]', () => {
	// GOLDEN VECTOR — mirrors ardrive-web's streaming AES-256-CTR write path exactly:
	//   fileKey   : a fixed 32-byte KDF-derived key
	//   Cipher-IV : a fixed 12-byte nonce; the initial counter block is nonce || 0x00000000
	//   Cipher    : 'AES256-CTR'; NO MAC / auth tag (ardrive-web uses Mac.empty)
	const fileKeyData = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
	const fileKey = new EntityKey(fileKeyData);
	const nonce = Buffer.from('ardrive-ctr!', 'utf8'); // 12-byte Cipher-IV nonce
	const cipherIV = nonce.toString('base64'); // 'YXJkcml2ZS1jdHIh'
	const plaintext = Buffer.from(
		'The quick brown fox jumps over 13 lazy ArDrive dogs, spanning several AES blocks!!',
		'utf8'
	);
	// Fixed, externally-verified web-interop ciphertext — a HARDCODED literal, deliberately NOT
	// recomputed from any helper under test (recomputation would make the golden-decrypt assertion
	// circular). Provenance: verified byte-for-byte against ardrive-web's stream_aes.dart counterBlock
	// (nonce‖0x00000000, low-32-bit BE) by an independent Python AES-ECB oracle — see the AES-CTR gate.
	// Because it is a fixed literal, the golden-decrypt test below FAILS on any regression in the
	// counter/CTR logic (e.g. treating the 12-byte IV as 16, or stripping a nonexistent auth tag).
	const GOLDEN_CTR_CIPHERTEXT_HEX =
		'fcfeb3afdd4685ac21858d6e9b0b6083f367a3fce833d4a47c79a8874d91864d' +
		'173aae73fb9ab4ac4306d8cf12ec25ca49a7dab4954dc841e2f2f9680ed86105' +
		'ebed3589e6442c0742eba20cff323c8c7339';
	const goldenCiphertext = Buffer.from(GOLDEN_CTR_CIPHERTEXT_HEX, 'hex');

	it('aesCtrInitialCounterFromIv zero-pads a 12-byte nonce to a 16-byte counter (nonce || 0x00000000)', () => {
		const counter = aesCtrInitialCounterFromIv(nonce);
		expect(counter.length).to.equal(16);
		expect(counter.subarray(0, 12).equals(nonce)).to.equal(true);
		expect(counter.subarray(12).equals(Buffer.alloc(4))).to.equal(true);
	});

	it('aesCtrInitialCounterFromIv passes a 16-byte IV through unchanged', () => {
		const sixteen = Buffer.alloc(16, 7);
		expect(aesCtrInitialCounterFromIv(sixteen).equals(sixteen)).to.equal(true);
	});

	// CTR is unauthenticated: silently zero-padding/truncating a malformed Cipher-IV to 16 bytes
	// would produce corrupted plaintext with NO error. The guard must reject bad lengths loudly.
	it('rejects a malformed 10-byte Cipher-IV with a RangeError (no silent zero-pad)', () => {
		expect(() => aesCtrInitialCounterFromIv(Buffer.alloc(10, 5))).to.throw(
			RangeError,
			/must be 12 or 16 bytes, got 10/
		);
	});

	it('rejects a malformed 20-byte Cipher-IV with a RangeError (no silent truncation)', () => {
		expect(() => aesCtrInitialCounterFromIv(Buffer.alloc(20, 5))).to.throw(
			RangeError,
			/must be 12 or 16 bytes, got 20/
		);
	});

	it('decrypts the golden AES-256-CTR ciphertext back to the exact plaintext (buffer path)', async () => {
		const decrypted = await fileDecrypt(cipherIV, fileKey, goldenCiphertext, CIPHER_AES_256_CTR);
		expect(decrypted.equals(plaintext)).to.equal(true);
	});

	it('pins the ardrive-web counter construction (encrypt side) to the verified golden literal', () => {
		// This exercises the ENCRYPT / counter-construction path, NOT the decrypt branch, so it is
		// intentionally not the load-bearing decrypt guard (that is the golden-decrypt test above).
		// Its job is to catch drift in aesCtrInitialCounterFromIv by pinning the produced keystream
		// to the externally-verified GOLDEN_CTR_CIPHERTEXT_HEX literal — an independent constant, not
		// a value recomputed from the same helper, so the check is not circular.
		const c = createCipheriv('aes-256-ctr', fileKeyData, aesCtrInitialCounterFromIv(nonce));
		const ct = Buffer.concat([c.update(plaintext), c.final()]);
		expect(ct.toString('hex')).to.equal(GOLDEN_CTR_CIPHERTEXT_HEX);
	});

	it('routes CTR-tagged input to the CTR path with NO auth-tag stripping (full length recovered)', async () => {
		// If CTR were mis-routed to GCM, the trailing 16 bytes would be consumed as an auth tag
		// and the plaintext would be truncated/rejected. A correct CTR route recovers every byte.
		const decrypted = await fileDecrypt(cipherIV, fileKey, goldenCiphertext, CIPHER_AES_256_CTR);
		expect(decrypted.length).to.equal(plaintext.length);
		expect(decrypted.subarray(-2).toString('utf8')).to.equal('!!');
	});

	it('driveDecrypt also honors the CTR cipher tag', async () => {
		const driveKey = new EntityKey(fileKeyData);
		const decrypted = await driveDecrypt(cipherIV, driveKey, goldenCiphertext, CIPHER_AES_256_CTR);
		expect(decrypted.equals(plaintext)).to.equal(true);
	});
});

describe('AES-256-GCM decryption is unchanged (no interop regression) [aes-ctr]', () => {
	const fileKey = new EntityKey(
		Buffer.from('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f', 'hex')
	);
	const driveKey = new EntityKey(
		Buffer.from('404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f', 'hex')
	);

	it('GCM round-trips through fileEncrypt/fileDecrypt with the default (absent) cipher', async () => {
		const plaintext = Buffer.from('{"name":"gcm.txt","size":3}', 'utf8');
		const enc = await fileEncrypt(fileKey, plaintext);
		expect(enc.cipher).to.equal(CIPHER_AES_256_GCM);
		const dec = await fileDecrypt(enc.cipherIV, fileKey, enc.data); // default => GCM
		expect(dec.equals(plaintext)).to.equal(true);
	});

	it('GCM round-trips with an explicit AES256-GCM cipher tag', async () => {
		const plaintext = Buffer.from('hello gcm world', 'utf8');
		const enc = await fileEncrypt(fileKey, plaintext);
		const dec = await fileDecrypt(enc.cipherIV, fileKey, enc.data, CIPHER_AES_256_GCM);
		expect(dec.toString('utf8')).to.equal('hello gcm world');
	});

	it('GCM drive data round-trips through driveEncrypt/driveDecrypt', async () => {
		const plaintext = Buffer.from('{"name":"my drive"}', 'utf8');
		const enc = await driveEncrypt(driveKey, plaintext);
		const dec = await driveDecrypt(enc.cipherIV, driveKey, enc.data);
		expect(dec.equals(plaintext)).to.equal(true);
	});
});

describe('genuine decryption failures throw EntityDecryptionError — no silent skip, no bogus buffer [aes-ctr]', () => {
	it('throws a clear EntityDecryptionError (never a Buffer("Error")) on a wrong-key GCM file', async () => {
		const rightKey = new EntityKey(Buffer.alloc(32, 1));
		const wrongKey = new EntityKey(Buffer.alloc(32, 2));
		const enc = await fileEncrypt(rightKey, Buffer.from('a secret metadata blob', 'utf8'));

		let thrown: unknown;
		try {
			await fileDecrypt(enc.cipherIV, wrongKey, enc.data); // GCM auth tag mismatch
		} catch (e) {
			thrown = e;
		}
		expect(thrown, 'fileDecrypt must throw, not return a sentinel buffer').to.be.instanceOf(EntityDecryptionError);
		expect((thrown as EntityDecryptionError).cipher).to.equal(CIPHER_AES_256_GCM);
		expect((thrown as Error).message).to.match(/Failed to decrypt file \(cipher AES256-GCM\)/);
	});

	it('throws EntityDecryptionError carrying the CTR cipher when the CTR decipher itself fails', async () => {
		// CTR is unauthenticated (by ardrive-web's Mac.empty design) so a wrong key cannot be
		// detected at decrypt time; force a genuine decipher failure via an invalid key length to
		// prove the CTR branch also surfaces a typed, honest error instead of a bogus buffer.
		const badLengthKey = new EntityKey(Buffer.alloc(31, 9));
		let thrown: unknown;
		try {
			await fileDecrypt(
				Buffer.alloc(12).toString('base64'),
				badLengthKey,
				Buffer.from('data'),
				CIPHER_AES_256_CTR
			);
		} catch (e) {
			thrown = e;
		}
		expect(thrown).to.be.instanceOf(EntityDecryptionError);
		expect((thrown as EntityDecryptionError).cipher).to.equal(CIPHER_AES_256_CTR);
	});

	it('the "Error" sentinel is gone — a decrypt failure never yields the string "Error"', async () => {
		const enc = await fileEncrypt(new EntityKey(Buffer.alloc(32, 3)), Buffer.from('x', 'utf8'));
		let result: Buffer | undefined;
		try {
			result = await fileDecrypt(enc.cipherIV, new EntityKey(Buffer.alloc(32, 4)), enc.data);
		} catch {
			result = undefined;
		}
		expect(result, 'must throw rather than return a buffer').to.equal(undefined);
	});
});

describe('cipher dispatch (buffer path) — unknown ciphers refused, absent/empty routes to legacy GCM [aes-ctr]', () => {
	const fileKey = new EntityKey(
		Buffer.from('606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f', 'hex')
	);

	it('throws EntityDecryptionError for an unknown NON-EMPTY cipher — never a silent GCM decrypt', async () => {
		// Encrypt a VALID GCM payload, then ask to decrypt it under a bogus cipher tag. A silent GCM
		// fallback (the old `else` branch) would happily decrypt this and return the plaintext; the
		// explicit dispatch must refuse the unrecognized cipher instead.
		const plaintext = Buffer.from('{"name":"attacker-controlled"}', 'utf8');
		const enc = await fileEncrypt(fileKey, plaintext);
		let thrown: unknown;
		try {
			await fileDecrypt(enc.cipherIV, fileKey, enc.data, 'AES256-XYZ');
		} catch (e) {
			thrown = e;
		}
		expect(thrown, 'must throw, not silently GCM-decrypt an unknown cipher').to.be.instanceOf(
			EntityDecryptionError
		);
		expect((thrown as EntityDecryptionError).cipher).to.equal('AES256-XYZ');
	});

	it('treats an empty-string cipher as legacy GCM (absent-tag safety) and decrypts normally', async () => {
		// Legacy ArFS data with no/empty Cipher tag must still decrypt as GCM, not throw as "unknown".
		const plaintext = Buffer.from('legacy gcm metadata blob', 'utf8');
		const enc = await fileEncrypt(fileKey, plaintext);
		const dec = await fileDecrypt(enc.cipherIV, fileKey, enc.data, ''); // '' => GCM default
		expect(dec.toString('utf8')).to.equal('legacy gcm metadata blob');
	});
});
