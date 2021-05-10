import * as crypto from 'crypto';
import * as fs from 'fs';
import { parse } from 'uuid';
import { ArFSEncryptedData } from './types/base_Types';

import hkdf from 'futoin-hkdf';
import utf8 from 'utf8';
import jwkToPem, { JWK } from 'jwk-to-pem';

const authTagLength = 16;
const keyByteLength = 32;
const algo = 'aes-256-gcm'; // crypto library does not accept this in uppercase. So gotta keep using aes-256-gcm
const keyHash = 'SHA-256';

// Gets an unsalted SHA256 signature from an Arweave wallet's private PEM file
export async function getArweaveWalletSigningKey(jwk: JWK, data: Uint8Array): Promise<Uint8Array> {
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

// Derive a key from the user's ArDrive ID, JWK and Data Encryption Password (also their login password)
export async function deriveDriveKey(
	dataEncryptionKey: crypto.BinaryLike,
	driveId: string,
	walletPrivateKey: string
): Promise<Buffer> {
	const driveIdBytes: Buffer = Buffer.from(parse(driveId) as Uint8Array); // The UUID of the driveId is the SALT used for the drive key
	const driveBuffer: Buffer = Buffer.from(utf8.encode('drive'));
	const signingKey: Buffer = Buffer.concat([driveBuffer, driveIdBytes]);
	const walletSignature: Uint8Array = await getArweaveWalletSigningKey(JSON.parse(walletPrivateKey), signingKey);
	const info: string = utf8.encode(dataEncryptionKey as string);
	const driveKey: Buffer = hkdf(Buffer.from(walletSignature), keyByteLength, { info, hash: keyHash });
	return driveKey;
}

// Derive a key from the user's Drive Key and the File Id
export async function deriveFileKey(fileId: string, driveKey: Buffer): Promise<Buffer> {
	const info: Buffer = Buffer.from(parse(fileId) as Uint8Array);
	const fileKey: Buffer = hkdf(driveKey, keyByteLength, { info, hash: keyHash });
	return fileKey;
}

// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
export async function driveEncrypt(driveKey: Buffer, data: Buffer): Promise<ArFSEncryptedData> {
	const iv: Buffer = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algo, driveKey, iv, { authTagLength });
	const encryptedDriveBuffer: Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
	const encryptedDrive: ArFSEncryptedData = {
		cipher: 'AES256-GCM',
		cipherIV: iv.toString('base64'),
		data: encryptedDriveBuffer
	};
	return encryptedDrive;
}

// New ArFS File encryption function using a buffer and using ArDrive KDF with AES-256-GCM
export async function fileEncrypt(fileKey: Buffer, data: Buffer): Promise<ArFSEncryptedData> {
	const iv: Buffer = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algo, fileKey, iv, { authTagLength });
	const encryptedBuffer: Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
	const encryptedFile: ArFSEncryptedData = {
		cipher: 'AES256-GCM',
		cipherIV: iv.toString('base64'),
		data: encryptedBuffer
	};
	return encryptedFile;
}

// New ArFS File encryption function using a file path to get a file buffer and encrypt and using ArDrive KDF with AES-256-GCM
export async function getFileAndEncrypt(fileKey: Buffer, filePath: string): Promise<ArFSEncryptedData> {
	const data = fs.readFileSync(filePath);
	const iv: Buffer = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algo, fileKey, iv, { authTagLength });
	const encryptedBuffer: Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
	const encryptedFile: ArFSEncryptedData = {
		cipher: 'AES256-GCM',
		cipherIV: iv.toString('base64'),
		data: encryptedBuffer
	};
	return encryptedFile;
}

// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
export async function driveDecrypt(cipherIV: string, driveKey: Buffer, data: Buffer): Promise<Buffer> {
	const authTag: Buffer = data.slice(data.byteLength - authTagLength, data.byteLength);
	const encryptedDataSlice: Buffer = data.slice(0, data.byteLength - authTagLength);
	const iv: Buffer = Buffer.from(cipherIV, 'base64');
	const decipher = crypto.createDecipheriv(algo, driveKey, iv, { authTagLength });
	decipher.setAuthTag(authTag);
	const decryptedDrive: Buffer = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);
	return decryptedDrive;
}

// New ArFS File decryption function, using ArDrive KDF and AES-256-GCM
export async function fileDecrypt(cipherIV: string, fileKey: Buffer, data: Buffer): Promise<Buffer> {
	try {
		const authTag: Buffer = data.slice(data.byteLength - authTagLength, data.byteLength);
		const encryptedDataSlice: Buffer = data.slice(0, data.byteLength - authTagLength);
		const iv: Buffer = Buffer.from(cipherIV, 'base64');
		const decipher = crypto.createDecipheriv(algo, fileKey, iv, { authTagLength });
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
