import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { parse as uuidParse } from 'uuid';
import utf8 from 'utf8';
import { ArweaveSigner, JWKInterface, createData, getCryptoDriver } from '@dha-team/arbundles';

export type Bytes = Uint8Array;
const KEY_LEN = 32;
const IV_LEN = 12; // 96-bit GCM nonce

function randomIV(): Bytes {
	const iv = new Uint8Array(IV_LEN);
	crypto.getRandomValues(iv);
	return iv;
}

function u8ToB64(u8: Bytes): string {
	let s = '';
	for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
	return btoa(s);
}

function b64ToU8(b64: string): Bytes {
	const bin = atob(b64);
	const u8 = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
	return u8;
}

// AES-256-GCM seal: returns ciphertext||tag and base64 IV string
export async function aesGcmEncrypt(key: Bytes, data: Bytes): Promise<{ cipherIV: string; data: Bytes }> {
	const iv = randomIV();
	const cipher = gcm(key, iv);
	const sealed = cipher.encrypt(data);
	return { cipherIV: u8ToB64(iv), data: sealed };
}

export async function aesGcmDecrypt(cipherIV: string, key: Bytes, sealed: Bytes): Promise<Bytes> {
	const iv = b64ToU8(cipherIV);
	const cipher = gcm(key, iv);
	try {
		return cipher.decrypt(sealed);
	} catch {
		throw new Error('AES-GCM decryption failed');
	}
}

// HKDF-SHA256 without salt (to match Node impl), info controls context
export function hkdfSha256(ikm: Bytes, info: Bytes, length = KEY_LEN): Bytes {
	return hkdf(sha256, ikm, new Uint8Array(0), info, length);
}

// Wallet signature v2 via arbundles, saltLength=0 to match Node
export async function generateWalletSignatureV2(jwk: JWKInterface, data: Bytes): Promise<Bytes> {
	const signer = new ArweaveSigner(jwk);
	// Create the data item with default signer first
	const dataItem = createData(data, signer, { tags: [{ name: 'Action', value: 'Drive-Signature-V2' }] });
	
	// Sign using the crypto driver with saltLength: 0 for Node compatibility
	const signatureData = await dataItem.getSignatureData();
	const signature = await getCryptoDriver().sign(jwk, signatureData, { saltLength: 0 });
	dataItem.setSignature(Buffer.from(signature));
	
	return new Uint8Array(dataItem.rawSignature);
}

// Derive Drive Key (v2) using HKDF(info=dataEncryptionKey) over signature of "drive"||UUID(driveId)
export async function deriveDriveKeyV2(params: {
	dataEncryptionKey: string; // same as Node: user password
	driveId: string; // UUID
	walletPrivateKey: string; // JWK JSON string
}): Promise<Bytes> {
	const signInput = new Uint8Array(5 + 16); // 'drive' (5 bytes) + UUID(16)
	const driveBytes = new TextEncoder().encode('drive');
	signInput.set(driveBytes, 0);
	signInput.set(uuidParse(params.driveId) as unknown as Uint8Array, 5);
	const sig = await generateWalletSignatureV2(JSON.parse(params.walletPrivateKey), signInput);
	const info = new TextEncoder().encode(utf8.encode(params.dataEncryptionKey));
	return hkdfSha256(sig, info, KEY_LEN);
}

export function deriveFileKey(fileId: string, driveKey: Bytes): Bytes {
	const info = uuidParse(fileId) as unknown as Uint8Array;
	return hkdfSha256(driveKey, info as Bytes, KEY_LEN);
}
