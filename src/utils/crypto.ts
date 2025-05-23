import * as crypto from 'crypto';
import * as fs from 'fs';
import { parse } from 'uuid';
import { ArFSEncryptedData } from '../types/base_Types';

import hkdf from 'futoin-hkdf';
import utf8 from 'utf8';
import jwkToPem, { JWK } from 'jwk-to-pem';
import { authTagLength } from './constants';
import { EntityKey, FileKey, DriveSignatureType, DriveKey } from '../types';
import { ArweaveSigner, JWKInterface, createData, getCryptoDriver } from '@dha-team/arbundles';

const keyByteLength = 32;
const algo = 'aes-256-gcm'; // crypto library does not accept this in uppercase. So gotta keep using aes-256-gcm
const keyHash = 'SHA-256';

// Gets an unsalted SHA256 signature from an Arweave wallet's private PEM file
export async function generateWalletSignatureV1(jwk: JWK, data: Uint8Array): Promise<Uint8Array> {
	const sign = crypto.createSign('sha256');
	sign.update(data);
	const pem: string = jwkToPem(jwk, { private: true });
	const signature = sign.sign({
		key: pem,
		padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
		saltLength: 0 // We do not need to salt the signature since we combine with a random UUID
	});
	return signature;
}

// Gets an unsalted SHA256 signature from an Arweave wallet's private PEM file using data item (equivalent to Wander's signDataItem())
export async function generateWalletSignatureV2(jwk: JWKInterface, data: Uint8Array): Promise<Uint8Array> {
	const signer = new ArweaveSigner(jwk);
	// Override sign to use 0 saltLength
	signer.sign = function (message) {
		return getCryptoDriver().sign(jwk, message, {
			saltLength: 0
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any;
	};
	const dataItem = createData(data, signer, {
		tags: [
			{
				name: 'Action',
				value: 'Drive-Signature-V2'
			}
		]
	});
	await dataItem.sign(signer);
	return new Uint8Array(dataItem.rawSignature);
}

// Derive a key from the user's Drive ID, JWK and Data Encryption Password (also their login password)
// Defaults to DriveSignatureType.v1 for backwards compatibility.
// ArFS v0.15 introduced stored encrypted v1 signatures which can be passed in here for decryption using a
// v2 Drive key. Private Drives may also be created using v2 signatures. The drive's signature type is stored
// as "Signature"
export async function deriveDriveKey(
	dataEncryptionKey: crypto.BinaryLike,
	driveId: string,
	walletPrivateKey: string,
	signatureType: DriveSignatureType = DriveSignatureType.v1,
	encryptedSignatureData?: {
		cipherIV: string;
		encryptedData: Buffer;
	}
): Promise<DriveKey> {
	const driveIdBytes: Buffer = Buffer.from(parse(driveId) as Uint8Array); // The UUID of the driveId is the SALT used for the drive key
	const driveBuffer: Buffer = Buffer.from(utf8.encode('drive'));
	const signingKey: Buffer = Buffer.concat([driveBuffer, driveIdBytes]);

	let walletSignature: Uint8Array;

	if (signatureType === DriveSignatureType.v1) {
		if (encryptedSignatureData) {
			// create v2 drive key and use to decrypt encrypted v1 signature
			const driveKeyV2 = await deriveDriveKey(
				dataEncryptionKey,
				driveId,
				walletPrivateKey,
				DriveSignatureType.v2
			);
			walletSignature = await driveDecrypt(
				encryptedSignatureData.cipherIV,
				driveKeyV2,
				encryptedSignatureData.encryptedData
			);
		} else {
			walletSignature = await generateWalletSignatureV1(JSON.parse(walletPrivateKey), signingKey);
		}
	} else if (signatureType === DriveSignatureType.v2) {
		// v2 signature uses equivalent to Wander's signDataItem()
		walletSignature = await generateWalletSignatureV2(JSON.parse(walletPrivateKey), signingKey);
	} else {
		throw new Error(`Unknown signature type: ${signatureType}`);
	}

	const info: string = utf8.encode(dataEncryptionKey as string);
	const driveKey: Buffer = hkdf(Buffer.from(walletSignature), keyByteLength, { info, hash: keyHash });
	return new DriveKey(driveKey, signatureType);
}

// Derive a key from the user's Drive Key and the File Id
export async function deriveFileKey(fileId: string, driveKey: DriveKey): Promise<FileKey> {
	const info: Buffer = Buffer.from(parse(fileId) as Uint8Array);
	const fileKey: Buffer = hkdf(driveKey.keyData, keyByteLength, { info, hash: keyHash });
	return new EntityKey(fileKey);
}

// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
export async function driveEncrypt(driveKey: DriveKey, data: Buffer): Promise<ArFSEncryptedData> {
	const iv: Buffer = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algo, driveKey.keyData, iv, { authTagLength });
	const encryptedDriveBuffer: Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
	const encryptedDrive: ArFSEncryptedData = {
		cipher: 'AES256-GCM',
		cipherIV: iv.toString('base64'),
		data: encryptedDriveBuffer
	};
	return encryptedDrive;
}

// New ArFS File encryption function using a buffer and using ArDrive KDF with AES-256-GCM
export async function fileEncrypt(fileKey: FileKey, data: Buffer): Promise<ArFSEncryptedData> {
	const iv: Buffer = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algo, fileKey.keyData, iv, { authTagLength });
	const encryptedBuffer: Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
	const encryptedFile: ArFSEncryptedData = {
		cipher: 'AES256-GCM',
		cipherIV: iv.toString('base64'),
		data: encryptedBuffer
	};
	return encryptedFile;
}

// New ArFS File encryption function using a file path to get a file buffer and encrypt and using ArDrive KDF with AES-256-GCM
export async function getFileAndEncrypt(fileKey: FileKey, filePath: string): Promise<ArFSEncryptedData> {
	const data = fs.readFileSync(filePath);
	const iv: Buffer = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algo, fileKey.keyData, iv, { authTagLength });
	const encryptedBuffer: Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
	const encryptedFile: ArFSEncryptedData = {
		cipher: 'AES256-GCM',
		cipherIV: iv.toString('base64'),
		data: encryptedBuffer
	};
	return encryptedFile;
}

// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
export async function driveDecrypt(cipherIV: string, driveKey: DriveKey, data: Buffer): Promise<Buffer> {
	const authTag: Buffer = data.slice(data.byteLength - authTagLength, data.byteLength);
	const encryptedDataSlice: Buffer = data.slice(0, data.byteLength - authTagLength);
	const iv: Buffer = Buffer.from(cipherIV, 'base64');
	const decipher = crypto.createDecipheriv(algo, driveKey.keyData, iv, { authTagLength });
	decipher.setAuthTag(authTag);
	const decryptedDrive: Buffer = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);
	return decryptedDrive;
}

// New ArFS File decryption function, using ArDrive KDF and AES-256-GCM
export async function fileDecrypt(cipherIV: string, fileKey: FileKey, data: Buffer): Promise<Buffer> {
	try {
		const authTag: Buffer = data.slice(data.byteLength - authTagLength, data.byteLength);
		const encryptedDataSlice: Buffer = data.slice(0, data.byteLength - authTagLength);
		const iv: Buffer = Buffer.from(cipherIV, 'base64');
		const decipher = crypto.createDecipheriv(algo, fileKey.keyData, iv, { authTagLength });
		decipher.setAuthTag(authTag);
		const decryptedFile: Buffer = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);
		return decryptedFile;
	} catch (err) {
		// console.log (err);
		console.log('Error decrypting file data');
		return Buffer.from('Error', 'ascii');
	}
}

// gets hash of a file using SHA512
export async function checksumFile(path: string): Promise<string> {
	const hash = crypto.createHash('sha512');
	const file = fs.createReadStream(path, { encoding: 'base64' });
	return new Promise((resolve, reject) => {
		file.on('error', (err) => {
			file.close();
			reject(err);
		});
		file.on('data', function (chunk) {
			hash.update(chunk);
		});
		file.on('close', () => {
			resolve(hash.digest('hex'));
		});
	});
}

// Used to encrypt data going into sqlitedb, like arweave private key
export async function encryptText(
	text: crypto.BinaryLike,
	password: string
): Promise<{ iv: string; encryptedText: string }> {
	try {
		const initVect = crypto.randomBytes(16);
		const CIPHER_KEY = getTextCipherKey(password);
		const cipher = crypto.createCipheriv('aes-256-cbc', CIPHER_KEY, initVect);
		let encryptedText = cipher.update(text.toString());
		encryptedText = Buffer.concat([encryptedText, cipher.final()]);
		return {
			iv: initVect.toString('hex'),
			encryptedText: encryptedText.toString('hex')
		};
	} catch (err) {
		console.log(err);
		return {
			iv: 'Error',
			encryptedText: 'Error'
		};
	}
}

// Used to decrypt data going into sqlitedb, like arweave private key
export async function decryptText(
	text: {
		iv: { toString: () => string };
		encryptedText: { toString: () => string };
	},
	password: string
): Promise<string> {
	try {
		const iv = Buffer.from(text.iv.toString(), 'hex');
		const encryptedText = Buffer.from(text.encryptedText.toString(), 'hex');
		const cipherKey = getTextCipherKey(password);
		const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
		let decrypted = decipher.update(encryptedText);
		decrypted = Buffer.concat([decrypted, decipher.final()]);
		return decrypted.toString();
	} catch (err) {
		// console.log(err);
		return 'ERROR';
	}
}

// Used to encrypt data stored in SQLite DB
function getTextCipherKey(password: crypto.BinaryLike): Buffer {
	const hash = crypto.createHash('sha256');
	hash.update(password);
	const KEY = hash.digest();
	return KEY;
}
