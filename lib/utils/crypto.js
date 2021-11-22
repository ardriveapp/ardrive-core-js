"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptText = exports.encryptText = exports.checksumFile = exports.fileDecrypt = exports.driveDecrypt = exports.getFileAndEncrypt = exports.fileEncrypt = exports.driveEncrypt = exports.deriveFileKey = exports.deriveDriveKey = exports.getArweaveWalletSigningKey = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const uuid_1 = require("uuid");
const futoin_hkdf_1 = __importDefault(require("futoin-hkdf"));
const utf8_1 = __importDefault(require("utf8"));
const jwk_to_pem_1 = __importDefault(require("jwk-to-pem"));
const authTagLength = 16;
const keyByteLength = 32;
const algo = 'aes-256-gcm'; // crypto library does not accept this in uppercase. So gotta keep using aes-256-gcm
const keyHash = 'SHA-256';
// Gets an unsalted SHA256 signature from an Arweave wallet's private PEM file
function getArweaveWalletSigningKey(jwk, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const sign = crypto.createSign('sha256');
        sign.update(data);
        const pem = jwk_to_pem_1.default(jwk, { private: true });
        const signature = sign.sign({
            key: pem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 0 // We do not need to salt the signature since we combine with a random UUID
        });
        return signature;
    });
}
exports.getArweaveWalletSigningKey = getArweaveWalletSigningKey;
// Derive a key from the user's ArDrive ID, JWK and Data Encryption Password (also their login password)
function deriveDriveKey(dataEncryptionKey, driveId, walletPrivateKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const driveIdBytes = Buffer.from(uuid_1.parse(driveId)); // The UUID of the driveId is the SALT used for the drive key
        const driveBuffer = Buffer.from(utf8_1.default.encode('drive'));
        const signingKey = Buffer.concat([driveBuffer, driveIdBytes]);
        const walletSignature = yield getArweaveWalletSigningKey(JSON.parse(walletPrivateKey), signingKey);
        const info = utf8_1.default.encode(dataEncryptionKey);
        const driveKey = futoin_hkdf_1.default(Buffer.from(walletSignature), keyByteLength, { info, hash: keyHash });
        return driveKey;
    });
}
exports.deriveDriveKey = deriveDriveKey;
// Derive a key from the user's Drive Key and the File Id
function deriveFileKey(fileId, driveKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const info = Buffer.from(uuid_1.parse(fileId));
        const fileKey = futoin_hkdf_1.default(driveKey, keyByteLength, { info, hash: keyHash });
        return fileKey;
    });
}
exports.deriveFileKey = deriveFileKey;
// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
function driveEncrypt(driveKey, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(algo, driveKey, iv, { authTagLength });
        const encryptedDriveBuffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
        const encryptedDrive = {
            cipher: 'AES256-GCM',
            cipherIV: iv.toString('base64'),
            data: encryptedDriveBuffer
        };
        return encryptedDrive;
    });
}
exports.driveEncrypt = driveEncrypt;
// New ArFS File encryption function using a buffer and using ArDrive KDF with AES-256-GCM
function fileEncrypt(fileKey, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(algo, fileKey, iv, { authTagLength });
        const encryptedBuffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
        const encryptedFile = {
            cipher: 'AES256-GCM',
            cipherIV: iv.toString('base64'),
            data: encryptedBuffer
        };
        return encryptedFile;
    });
}
exports.fileEncrypt = fileEncrypt;
// New ArFS File encryption function using a file path to get a file buffer and encrypt and using ArDrive KDF with AES-256-GCM
function getFileAndEncrypt(fileKey, filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = fs.readFileSync(filePath);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(algo, fileKey, iv, { authTagLength });
        const encryptedBuffer = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
        const encryptedFile = {
            cipher: 'AES256-GCM',
            cipherIV: iv.toString('base64'),
            data: encryptedBuffer
        };
        return encryptedFile;
    });
}
exports.getFileAndEncrypt = getFileAndEncrypt;
// New ArFS Drive decryption function, using ArDrive KDF and AES-256-GCM
function driveDecrypt(cipherIV, driveKey, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const authTag = data.slice(data.byteLength - authTagLength, data.byteLength);
        const encryptedDataSlice = data.slice(0, data.byteLength - authTagLength);
        const iv = Buffer.from(cipherIV, 'base64');
        const decipher = crypto.createDecipheriv(algo, driveKey, iv, { authTagLength });
        decipher.setAuthTag(authTag);
        const decryptedDrive = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);
        return decryptedDrive;
    });
}
exports.driveDecrypt = driveDecrypt;
// New ArFS File decryption function, using ArDrive KDF and AES-256-GCM
function fileDecrypt(cipherIV, fileKey, data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const authTag = data.slice(data.byteLength - authTagLength, data.byteLength);
            const encryptedDataSlice = data.slice(0, data.byteLength - authTagLength);
            const iv = Buffer.from(cipherIV, 'base64');
            const decipher = crypto.createDecipheriv(algo, fileKey, iv, { authTagLength });
            decipher.setAuthTag(authTag);
            const decryptedFile = Buffer.concat([decipher.update(encryptedDataSlice), decipher.final()]);
            return decryptedFile;
        }
        catch (err) {
            // console.log (err);
            console.log('Error decrypting file data');
            return Buffer.from('Error', 'ascii');
        }
    });
}
exports.fileDecrypt = fileDecrypt;
// gets hash of a file using SHA512
function checksumFile(path) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
exports.checksumFile = checksumFile;
// Used to encrypt data going into sqlitedb, like arweave private key
function encryptText(text, password) {
    return __awaiter(this, void 0, void 0, function* () {
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
        }
        catch (err) {
            console.log(err);
            return {
                iv: 'Error',
                encryptedText: 'Error'
            };
        }
    });
}
exports.encryptText = encryptText;
// Used to decrypt data going into sqlitedb, like arweave private key
function decryptText(text, password) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const iv = Buffer.from(text.iv.toString(), 'hex');
            const encryptedText = Buffer.from(text.encryptedText.toString(), 'hex');
            const cipherKey = getTextCipherKey(password);
            const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        }
        catch (err) {
            // console.log(err);
            return 'ERROR';
        }
    });
}
exports.decryptText = decryptText;
// Used to encrypt data stored in SQLite DB
function getTextCipherKey(password) {
    const hash = crypto.createHash('sha256');
    hash.update(password);
    const KEY = hash.digest();
    return KEY;
}
