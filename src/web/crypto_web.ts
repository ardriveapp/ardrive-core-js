import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { parse as uuidParse } from 'uuid';
import utf8 from 'utf8';
import { ArweaveSigner, JWKInterface, createData, getCryptoDriver, type Signer } from '@dha-team/arbundles';
import { ArDriveSigner, isArDriveSigner } from './ardrive_signer';

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
	try {
		// Convert base64url to base64 (replace URL-safe characters)
		// This handles both standard base64 and base64url formats
		let standardB64 = b64.replace(/-/g, '+').replace(/_/g, '/');

		// Add padding if needed
		while (standardB64.length % 4 !== 0) {
			standardB64 += '=';
		}

		const bin = atob(standardB64);
		const u8 = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
		return u8;
	} catch (error) {
		console.error('Failed to decode base64 string:', b64);
		console.error('Base64 decode error:', error);
		throw new Error(`Invalid base64 string: ${b64.substring(0, 50)}... (length: ${b64.length})`);
	}
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

	// The sealed data from Arweave is: encryptedData || authTag (16 bytes)
	// @noble/ciphers gcm().decrypt() expects exactly this format
	// The auth tag is the last 16 bytes
	const authTagLength = 16;

	if (sealed.length < authTagLength) {
		throw new Error(`Sealed data too short: ${sealed.length} bytes (need at least ${authTagLength})`);
	}

	const cipher = gcm(key, iv);
	try {
		// @noble/ciphers expects: ciphertext || tag
		// The data from Arweave is already in this format
		return cipher.decrypt(sealed);
	} catch (error) {
		console.error('AES-GCM decryption error:', error);
		console.error('Sealed data length:', sealed.length);
		console.error('IV length:', iv.length);
		console.error('Key length:', key.length);
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

/**
 * Derive drive key using ArDriveSigner instead of JWK
 * This allows browser wallets to derive drive keys without exposing the private key
 *
 * @param params - Derivation parameters
 * @param params.dataEncryptionKey - User's password
 * @param params.driveId - Drive UUID
 * @param params.signer - ArDriveSigner instance (must support signDataItem for v2 drives)
 * @param params.driveSignatureType - Signature type (v1 or v2)
 * @param params.encryptedSignatureData - For v1 drives with encrypted signatures
 * @returns Derived drive key as Uint8Array
 */
export async function deriveDriveKeyWithSigner(params: {
	dataEncryptionKey: string;
	driveId: string;
	signer: Signer | ArDriveSigner; // Accepts Signer or ArDriveSigner
	driveSignatureType?: number; // DriveSignatureType enum value
	encryptedSignatureData?: { cipherIV: string; encryptedData: Uint8Array };
}): Promise<Bytes> {
	const {
		dataEncryptionKey,
		driveId,
		signer,
		driveSignatureType = 2, // Default to v2
		encryptedSignatureData
	} = params;

	// Build signing input: "drive" + UUID(driveId)
	const driveBytes = new TextEncoder().encode('drive');
	const uuidBytes = uuidParse(driveId);

	// Convert to Uint8Array if needed
	const uuidArray = uuidBytes instanceof Uint8Array ? uuidBytes : new Uint8Array(uuidBytes);

	// Create sign input by concatenating drive bytes and UUID bytes
	const signInput = new Uint8Array(driveBytes.length + uuidArray.length);
	signInput.set(driveBytes, 0);
	signInput.set(uuidArray, driveBytes.length);

	let walletSignature: Uint8Array;

	if (driveSignatureType === 1) {
		// v1 signature type
		if (encryptedSignatureData) {
			// Decrypt v1 signature using v2 key
			const driveKeyV2 = await deriveDriveKeyWithSigner({
				dataEncryptionKey,
				driveId,
				signer,
				driveSignatureType: 2 // Use v2 for decryption
			});

			try {
				walletSignature = await aesGcmDecrypt(
					encryptedSignatureData.cipherIV,
					driveKeyV2,
					encryptedSignatureData.encryptedData
				);
			} catch (decryptError) {
				console.error('Failed to decrypt v1 signature:', decryptError);
				throw new Error(
					'Failed to decrypt drive signature. This could mean: ' +
						'(1) Wrong password, (2) Wrong wallet, or (3) Corrupted signature data'
				);
			}
		} else {
			// v1 without encrypted signature requires raw JWK signing
			// Browser wallets cannot do this
			throw new Error(
				'DriveSignatureType v1 without encrypted signature requires JWK private key. ' +
					'Browser wallets only support v2 signatures. ' +
					'This is a very old drive format - please contact the drive owner to upgrade.'
			);
		}
	} else if (driveSignatureType === 2) {
		// v2 signature type - use DataItem signing
		// IMPORTANT: v2 uses DataItem signing with saltLength: 0
		// This matches the Node.js generateWalletSignatureV2() implementation
		if (isArDriveSigner(signer)) {
			// Get owner (public key) from signer
			const owner = await signer.getActivePublicKey();

			// Create DataItem structure matching the format expected by signDataItem
			const dataItem = {
				data: signInput,
				owner: owner,
				target: undefined,
				anchor: undefined,
				tags: [
					{
						name: 'Action',
						value: 'Drive-Signature-V2'
					}
				]
			};

			// Sign with saltLength: 0
			const signedDataItem = await signer.signDataItem(dataItem, { saltLength: 0 });

			// Extract signature (skip first 2 bytes, take next 512 bytes)
			walletSignature = new Uint8Array(signedDataItem.slice(2, 514));
		} else {
			// Fallback to standard Signer (for JWK-based signing using DataItem)
			const dataItem = createData(signInput, signer, {
				tags: [{ name: 'Action', value: 'Drive-Signature-V2' }]
			});
			await dataItem.sign(signer);
			walletSignature = new Uint8Array(dataItem.rawSignature);
		}
	} else {
		throw new Error(`Unknown signature type: ${driveSignatureType}`);
	}

	// Derive key using HKDF
	const info = new TextEncoder().encode(utf8.encode(dataEncryptionKey));
	return hkdfSha256(walletSignature, info, KEY_LEN);
}
