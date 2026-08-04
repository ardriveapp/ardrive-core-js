import { expect } from 'chai';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { EntityKey } from '../types';
import { StreamDecrypt } from './stream_decrypt';
import { EntityDecryptionError } from '../types/exceptions';

const pipelinePromise = promisify(pipeline);

describe('the StreamDecrypt class', () => {
	const healthyCipherIV = '44PEY4EvVXq6TuBp';
	const badCipherIV = 'xxxxxxxxxxxxxxxx';
	const healthyFileKey = new EntityKey(Buffer.from('Zzaf6YeMb0chjYXjGkluCnLdufiu7/SxbuEbyPzR+1g=', 'base64'));
	const data = ':)\n\n';
	const rawEncryptedData = Buffer.from('boFKovaNPFrbNHt0mftHjmQexP4=', 'base64');
	const encryptedData = rawEncryptedData.slice(0, rawEncryptedData.length - 16);
	const authTag = rawEncryptedData.slice(rawEncryptedData.length - 16, rawEncryptedData.length);
	let mockStream: Readable;

	beforeEach(() => {
		mockStream = new Readable();
		mockStream.push(encryptedData);
		mockStream.push(null); // EOF
	});

	it('successfully decrypts a file with a healthy input', () => {
		const decryptingStream = new StreamDecrypt(healthyCipherIV, healthyFileKey, authTag);
		let decryptedData = '';
		decryptingStream.on('data', (chunk: Buffer | string) => {
			decryptedData = `${decryptedData}${chunk.toString()}`;
		});
		return pipelinePromise(mockStream, decryptingStream).then(() => {
			return expect(decryptedData).to.equal(data);
		});
	});

	it('fails while decrypting with wrong secrets', () => {
		const decryptingStream = new StreamDecrypt(badCipherIV, healthyFileKey, authTag);
		return pipelinePromise(mockStream, decryptingStream).catch((err) => {
			return expect(err).to.be.instanceOf(Error);
		});
	});
});

// Streaming CTR is the load-bearing interop path: ardrive-web encrypts LARGE private file DATA
// with AES-256-CTR (12-byte Cipher-IV nonce, initial counter = nonce || 0x00000000, NO auth tag).
describe('the StreamDecrypt class — AES-256-CTR (ardrive-web streamed large files)', () => {
	// Same golden vector as crypto_aes_ctr.test.ts (buffer path), decrypted here via the stream.
	const ctrFileKey = new EntityKey(
		Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex')
	);
	const ctrNonce = Buffer.from('ardrive-ctr!', 'utf8'); // 12-byte Cipher-IV
	const ctrCipherIV = ctrNonce.toString('base64');
	const ctrPlaintext = 'The quick brown fox jumps over 13 lazy ArDrive dogs, spanning several AES blocks!!';
	// Fixed, externally-verified web-interop ciphertext (HARDCODED literal, not recomputed from any
	// helper under test). This decrypt is load-bearing: fed straight into StreamDecrypt below, it fails
	// on any CTR-counter regression. Provenance: verified byte-for-byte against ardrive-web's
	// stream_aes.dart counterBlock (nonce‖0x00000000, low-32-bit BE) by an independent Python AES-ECB
	// oracle — see the AES-CTR gate.
	const GOLDEN_CTR_CIPHERTEXT_HEX =
		'fcfeb3afdd4685ac21858d6e9b0b6083f367a3fce833d4a47c79a8874d91864d' +
		'173aae73fb9ab4ac4306d8cf12ec25ca49a7dab4954dc841e2f2f9680ed86105' +
		'ebed3589e6442c0742eba20cff323c8c7339';
	const ctrCiphertext = Buffer.from(GOLDEN_CTR_CIPHERTEXT_HEX, 'hex');

	const collect = (stream: Readable, decrypt: StreamDecrypt): Promise<string> => {
		let out = '';
		decrypt.on('data', (chunk: Buffer | string) => {
			out = `${out}${chunk.toString()}`;
		});
		return pipelinePromise(stream, decrypt).then(() => out);
	};

	it('decrypts a golden CTR ciphertext back to the exact plaintext (no auth tag)', () => {
		const src = new Readable();
		src.push(ctrCiphertext);
		src.push(null);
		const decryptingStream = new StreamDecrypt(ctrCipherIV, ctrFileKey, null, 'AES256-CTR');
		return collect(src, decryptingStream).then((decrypted) => expect(decrypted).to.equal(ctrPlaintext));
	});

	it('keeps the CTR counter continuous across multiple chunks', () => {
		// Split the ciphertext across two pushes so the counter must advance correctly between
		// _transform() calls — the failure mode that would corrupt everything after the first chunk.
		const src = new Readable();
		src.push(ctrCiphertext.subarray(0, 20));
		src.push(ctrCiphertext.subarray(20));
		src.push(null);
		const decryptingStream = new StreamDecrypt(ctrCipherIV, ctrFileKey, null, 'AES256-CTR');
		return collect(src, decryptingStream).then((decrypted) => expect(decrypted).to.equal(ctrPlaintext));
	});
});

// Cipher-dispatch guard: the stream constructor must not silently fall through to GCM for an
// unrecognized cipher, but absent/empty (legacy) must still route to the authenticated GCM path.
describe('the StreamDecrypt class — cipher dispatch guard [aes-ctr]', () => {
	const healthyCipherIV = '44PEY4EvVXq6TuBp';
	const healthyFileKey = new EntityKey(Buffer.from('Zzaf6YeMb0chjYXjGkluCnLdufiu7/SxbuEbyPzR+1g=', 'base64'));
	const rawEncryptedData = Buffer.from('boFKovaNPFrbNHt0mftHjmQexP4=', 'base64');
	const authTag = rawEncryptedData.slice(rawEncryptedData.length - 16, rawEncryptedData.length);

	it('throws EntityDecryptionError for an unknown NON-EMPTY cipher instead of falling through to GCM', () => {
		// A VALID GCM auth tag is supplied, so the old silent `else` GCM path would construct fine.
		// The explicit dispatch must reject the unrecognized cipher at construction time.
		expect(() => new StreamDecrypt(healthyCipherIV, healthyFileKey, authTag, 'AES256-XYZ')).to.throw(
			EntityDecryptionError
		);
	});

	it('treats an empty-string cipher as legacy GCM (constructs the authenticated path)', () => {
		expect(() => new StreamDecrypt(healthyCipherIV, healthyFileKey, authTag, '')).to.not.throw();
	});
});
