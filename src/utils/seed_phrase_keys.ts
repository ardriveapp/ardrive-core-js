import { createPrivateKey, JsonWebKey } from 'node:crypto';
import { generateMnemonic, mnemonicToSeed } from 'bip39';
import forge from 'node-forge';
import HmacDRBG from 'hmac-drbg';
import hash from 'hash.js';

/**
 * Seed phrase to RSA wallet derivation, vendored from the ardriveapp fork of
 * human-crypto-keys (github.com/ardriveapp/js-human-crypto-keys#expose_lib), which
 * core-js used to install from git. Only the RSA path that core-js calls is kept.
 *
 * Every wallet ever made from an ArDrive seed phrase depends on this code producing
 * the same key, so it must stay byte-for-byte equivalent to the fork:
 * - the seed is the standard BIP39 seed (PBKDF2-SHA512, empty passphrase);
 * - a NIST HMAC-DRBG (SHA-256) seeded with the seed's hex string feeds forge's
 *   prime search as its only randomness;
 * - forge generates a 4096-bit key with public exponent 65537 by PRIMEINC.
 *
 * seed_phrase_keys.test.ts pins known wallets. Do not change a dependency version
 * here without running its release vectors.
 */

const modulusLength = 4096;
const publicExponent = 65537;

/** The forge PRNG interface, backed by HMAC-DRBG instead of real randomness. */
function seededPrng(seed: Uint8Array): { getBytesSync(count: number): string } {
	const drbg = new HmacDRBG({
		hash: hash.sha256,
		entropy: Buffer.from(seed).toString('hex'),
		nonce: null,
		pers: null
	});
	return {
		getBytesSync: (count: number) => Buffer.from(drbg.generate(count)).toString('binary')
	};
}

function base64UrlFromBigInteger(value: forge.jsbn.BigInteger): string {
	let hex = value.toString(16);
	if (hex.length % 2) {
		hex = `0${hex}`;
	}
	return Buffer.from(hex, 'hex').toString('base64url');
}

/** Returns the standard 64-byte BIP39 seed for a mnemonic, with no passphrase. */
export async function seedFromMnemonic(mnemonic: string): Promise<Uint8Array> {
	const seed = await mnemonicToSeed(mnemonic);
	// A view of exactly the seed's bytes: a Buffer's backing ArrayBuffer can be a
	// shared pool, so `new Uint8Array(seed.buffer)` would read unrelated memory.
	return new Uint8Array(seed.buffer, seed.byteOffset, seed.byteLength);
}

/** Derives the RSA private key, as a JWK, for a BIP39 seed. */
export async function rsaJwkFromSeed(seed: Uint8Array): Promise<JsonWebKey> {
	const keyPair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) =>
		forge.pki.rsa.generateKeyPair(
			{
				bits: modulusLength,
				e: publicExponent,
				prng: seededPrng(seed),
				algorithm: 'PRIMEINC',
				// Workers would take their randomness from elsewhere.
				workers: -1
			},
			(error, generated) => (error ? reject(error) : resolve(generated))
		)
	);
	const key = keyPair.privateKey;
	// Round trip through node:crypto so the JWK has the same shape as one exported
	// from a PEM, which is how this was produced before it was vendored.
	return createPrivateKey({
		key: {
			kty: 'RSA',
			n: base64UrlFromBigInteger(key.n),
			e: base64UrlFromBigInteger(key.e),
			d: base64UrlFromBigInteger(key.d),
			p: base64UrlFromBigInteger(key.p),
			q: base64UrlFromBigInteger(key.q),
			dp: base64UrlFromBigInteger(key.dP),
			dq: base64UrlFromBigInteger(key.dQ),
			qi: base64UrlFromBigInteger(key.qInv)
		},
		format: 'jwk'
	}).export({ format: 'jwk' });
}

/** Derives the RSA private key, as a JWK, for a 12-word seed phrase. */
export async function rsaJwkFromMnemonic(mnemonic: string): Promise<JsonWebKey> {
	return rsaJwkFromSeed(await seedFromMnemonic(mnemonic));
}

/** Returns a new random 12-word English BIP39 mnemonic. */
export function generateSeedPhraseMnemonic(): string {
	return generateMnemonic();
}
