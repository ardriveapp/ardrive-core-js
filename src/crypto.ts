import * as crypto from 'crypto';
import * as fs from 'fs';
import AppendInitVect from './appendInitVect';
import { parse } from 'uuid';
// import * as constants from 'constants'
import { getWalletSigningKey } from './arweave';
import { ArFSEncryptedData } from './types';
const hkdf = require('futoin-hkdf');
const utf8 = require('utf8');
// const jwkToPem = require('jwk-to-pem')
const authTagLength = 16;
const keyByteLength = 32;
const algo = 'aes-256-gcm';
const gcmSize = 16;
const keyHash = 'SHA-256';

function getFileCipherKey(password: crypto.BinaryLike, jwk: { toString: () => crypto.BinaryLike }) {
  const hash = crypto.createHash('sha256');
  hash.update(password);
  hash.update(jwk.toString());
  const KEY = hash.digest();
  return KEY;
}

function getTextCipherKey(password: crypto.BinaryLike) {
  const hash = crypto.createHash('sha256');
  hash.update(password);
  const KEY = hash.digest();
  return KEY;
}

// Derive a key from the user's ArDrive ID, JWK and Data Encryption Password (also their login password)
export const deriveDriveKey = async (dataEncryptionKey: crypto.BinaryLike, driveId: string, walletPrivateKey: string) => {
  const driveIdBytes : Buffer = Buffer.from(parse(driveId));
  const driveBuffer : Buffer = Buffer.from(utf8.encode('drive'))
  const signingKey : Buffer = Buffer.concat([driveBuffer, driveIdBytes])
  const walletSignature : Uint8Array = await getWalletSigningKey(JSON.parse(walletPrivateKey), signingKey)
  const info : string = utf8.encode(dataEncryptionKey);
  const driveKey : Buffer = hkdf(walletSignature, keyByteLength, {info, keyHash});
  return driveKey;
}

// Derive a key from the user's Drive Key and the File Id
export const deriveFileKey = async (fileId: string, driveKey: Buffer) => {
  const fileIdBytes : Buffer = Buffer.from(parse(fileId));
  const fileKey : Buffer = hkdf(driveKey, keyByteLength, {fileIdBytes, keyHash});
  return fileKey;
}

// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
export const driveEncrypt = async (driveKey: Buffer, data: Buffer) : Promise<ArFSEncryptedData> => {
  const iv : Buffer = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algo, driveKey, iv, { authTagLength });
  const encryptedDriveBuffer : Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()])
  const encryptedDrive : ArFSEncryptedData = {
    cipher: algo,
    cipherIV: iv.toString('base64'),
    data: encryptedDriveBuffer,
  }
  return encryptedDrive;
}

// New ArFS File encryption function using a buffer and using ArDrive KDF with AES-256-GCM
// THIS MUST BE UPDATED TO SUPPORT STREAMS AND FILES LARGER THAN 1 GB
export const fileEncrypt = async (fileKey: Buffer, data: Buffer) : Promise<ArFSEncryptedData> => {
  const iv : Buffer = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algo, fileKey, iv, { authTagLength });
  const encryptedBuffer : Buffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()])
  const encryptedFile : ArFSEncryptedData = {
    cipher: algo,
    cipherIV: iv.toString('base64'),
    data: encryptedBuffer,
  }
  return encryptedFile; 
}

// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
export const driveDecrypt = async (cipherIV: string, driveKey: Buffer, data: Buffer) => {
  const authTag : Buffer = data.slice((data.byteLength - authTagLength), data.byteLength);
  const encryptedDataSlice : Buffer  = data.slice(0, (data.byteLength - authTagLength))
  const iv : Buffer = Buffer.from(cipherIV, 'base64');
  const decipher = crypto.createDecipheriv(algo, driveKey, iv, { authTagLength })
  decipher.setAuthTag(authTag);
  const decryptedDrive : Buffer = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);
  console.log ("Drive Info is: ", decryptedDrive.toString('ascii'));
  return decryptedDrive;
}

// New ArFS File decryption function, using ArDrive KDF and AES-256-GCM
// THIS MUST BE UPDATED TO SUPPORT STREAMS AND FILES LARGER THAN 1 GB
export const fileDecrypt = async (cipherIV: string, fileKey: Buffer, data: Buffer) => {
  const authTag : Buffer = data.slice((data.byteLength - gcmSize), data.byteLength);
  const encryptedDataSlice : Buffer  = data.slice(0, (data.byteLength - gcmSize));
  const iv : Buffer = Buffer.from(cipherIV, 'base64');
  const decipher = crypto.createDecipheriv(algo, fileKey, iv);
  decipher.setAuthTag(authTag);
  const decryptedFile : Buffer = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);

  /* console.log ("Data byte length is: ", data.byteLength)
  console.log ("Cipher IV is: ", iv)
  console.log ("Auth Tag is: ", authTag)
  console.log ("Data Slice is: ", encryptedDataSlice) */
  console.log (decryptedFile.toString('ascii'));

  return decryptedFile;
}

// gets hash of a file using SHA512, used for ArDriveID
export const checksumFile = async (path: string | number | Buffer | import('url').URL) => {
  const hash = crypto.createHash('sha512');
  const file = fs.readFileSync(path, { encoding: 'base64' });
  hash.update(file);
  const fileHash = hash.digest('hex');
  return fileHash;
};

// OLD
export const encryptFile = async (filePath: string, password: any, jwk: any) => {
  try {
    let writeStream;
    // Generate a secure, pseudo random initialization vector.
    const initVect = crypto.randomBytes(16);
    // Generate a cipher key from the password.
    const CIPHER_KEY = getFileCipherKey(password, jwk);
    const readStream = fs.createReadStream(filePath);
    const cipher = crypto.createCipheriv('aes256', CIPHER_KEY, initVect);
    const appendInitVect = new AppendInitVect(initVect);
    // Create a write stream with a different file extension.
    if (filePath.includes('.enc')) {
      writeStream = fs.createWriteStream(filePath);
    } else {
      writeStream = fs.createWriteStream(filePath.concat('.enc'));
    }
    readStream.pipe(cipher).pipe(appendInitVect).pipe(writeStream); // THIS SHIT IS CAUSING THE PROBLEM
    writeStream.on('finish', () => {
      // Do nothing
    });
    return 'Success!';
  } catch (err) {
    console.log(err);
    return 0;
  }
};

// OLD
export const decryptFile = async (encryptedFilePath: string, password: any, jwk: any) => {
  try {
    // console.log ("Decrypting %s", encryptedFilePath)
    // First, get the initialization vector from the file.
    // var encryptedFilePath = file_path.concat(".enc")
    // fs.renameSync(file_path, encryptedFilePath)
    const readInitVect = fs.createReadStream(encryptedFilePath, { end: 15 });

    let initVect: Buffer | string;
    readInitVect.on('data', async (chunk) => {
      initVect = chunk;
    });

    // Once we’ve got the initialization vector, we can decrypt the file.
    readInitVect.on('close', async () => {
      const cipherKey = getFileCipherKey(password, jwk);
      const readStream = fs.createReadStream(encryptedFilePath, {
        start: 16,
      });
      const decipher = crypto.createDecipheriv('aes256', cipherKey, initVect);
      const writeStream = fs.createWriteStream(encryptedFilePath.replace('.enc', ''));
      readStream.pipe(decipher).pipe(writeStream);
    });
  } catch (err) {
    console.log(err);
    return 0;
  }
  return 'Success!';
};

export const encryptText = async (text: crypto.BinaryLike, password: any) => {
  try {
    const initVect = crypto.randomBytes(16);
    const CIPHER_KEY = getTextCipherKey(password);
    const cipher = crypto.createCipheriv('aes256', CIPHER_KEY, initVect);
    let encryptedText = cipher.update(text);
    encryptedText = Buffer.concat([encryptedText, cipher.final()]);
    return {
      iv: initVect.toString('hex'),
      encryptedText: encryptedText.toString('hex'),
    };
  } catch (err) {
    console.log(err);
    return 0;
  }
};

export const decryptText = async (
  text: {
    iv: { toString: () => string };
    encryptedText: { toString: () => string };
  },
  password: any,
) => {
  try {
    const iv = Buffer.from(text.iv.toString(), 'hex');
    const encryptedText = Buffer.from(text.encryptedText.toString(), 'hex');
    const cipherKey = getTextCipherKey(password);
    const decipher = crypto.createDecipheriv('aes256', cipherKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.log(err);
    return "ERROR";
  }
};

export const encryptTag = async (text: crypto.BinaryLike, password: any, jwk: any) => {
  try {
    const initVect = crypto.randomBytes(16);
    const CIPHER_KEY = getFileCipherKey(password, jwk);
    const cipher = crypto.createCipheriv('aes256', CIPHER_KEY, initVect);
    let encryptedText = cipher.update(text);
    encryptedText = Buffer.concat([encryptedText, cipher.final()]);
    return {
      iv: initVect.toString('hex'),
      encryptedText: encryptedText.toString('hex'),
    };
  } catch (err) {
    console.log(err);
    return 0;
  }
};

export const decryptTag = async (
  text: {
    iv: { toString: () => string };
    encryptedText: { toString: () => string };
  },
  password: any,
  jwk: any,
) => {
  try {
    const iv = Buffer.from(text.iv.toString(), 'hex');
    const encryptedText = Buffer.from(text.encryptedText.toString(), 'hex');
    const cipherKey = getFileCipherKey(password, jwk);
    const decipher = crypto.createDecipheriv('aes256', cipherKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.log(err);
    return 0;
  }
};

export const decryptFileMetaData = async (
  fileIv: { toString: () => string },
  fileEncryptedText: { toString: () => string },
  password: any,
  jwk: any,
) => {
  try {
    const iv = Buffer.from(fileIv.toString(), 'hex');
    const encryptedText = Buffer.from(fileEncryptedText.toString(), 'hex');
    const cipherKey = getFileCipherKey(password, jwk);
    const decipher = crypto.createDecipheriv('aes256', cipherKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch (err) {
    console.log(err);
    return 0;
  }
};
