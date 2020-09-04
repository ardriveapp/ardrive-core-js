// Nodejs encryption with CTR
// With help from https://medium.com/@brandonstilson/lets-encrypt-files-with-node-85037bea8c0e
import * as crypto from 'crypto';
import * as fs from 'fs';
import AppendInitVect from './appendInitVect';

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

// gets hash of a file using SHA512, used for ArDriveID
export const checksumFile = async (path: string | number | Buffer | import('url').URL) => {
  const hash = crypto.createHash('sha512');
  const file = fs.readFileSync(path, { encoding: 'base64' });
  hash.update(file);
  const fileHash = hash.digest('hex');
  return fileHash;
};

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
    return 0;
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
