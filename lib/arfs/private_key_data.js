"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateKeyData = void 0;
const crypto_1 = require("../utils/crypto");
const common_1 = require("../utils/common");
/**
 * A utility class that uses optional private key data to safely decrypt metadata
 * transaction data (the data JSON). Upon a successful decryption, the class
 * will cache the verified driveId and driveKey as a pair for future use.
 */
class PrivateKeyData {
    constructor({ password, driveKeys, wallet }) {
        // Drive IDs are paired with their Drive Keys upon successful decryption
        // TODO: Migrate this to ArFS Cache so it can persist between commands
        this.driveKeyCache = {};
        if (password && !wallet) {
            throw new Error('Password supplied without a wallet. Did you forget to include your wallet?');
        }
        if (password && driveKeys) {
            throw new Error("Password and drive keys can't be used together. Please provide one or the other.");
        }
        this.unverifiedDriveKeys = driveKeys !== null && driveKeys !== void 0 ? driveKeys : [];
        this.password = password;
        this.wallet = wallet;
    }
    /** Safely decrypts a private data buffer into a decrypted transaction data */
    safelyDecryptToJson(cipherIV, driveId, dataBuffer, placeholder) {
        var e_1, _a;
        return __awaiter(this, void 0, void 0, function* () {
            // Check for a cached key that is matching provided driveId first
            const cachedDriveKey = this.driveKeyForDriveId(driveId);
            if (cachedDriveKey) {
                return this.decryptToJson(cipherIV, dataBuffer, cachedDriveKey);
            }
            try {
                // Next, try any unverified drive keys provided by the user
                for (var _b = __asyncValues(this.unverifiedDriveKeys), _c; _c = yield _b.next(), !_c.done;) {
                    const driveKey = _c.value;
                    try {
                        const decryptedDriveJSON = yield this.decryptToJson(cipherIV, dataBuffer, driveKey);
                        // Correct key, add this pair to the cache
                        this.driveKeyCache[`${driveId}`] = driveKey;
                        this.unverifiedDriveKeys = this.unverifiedDriveKeys.filter((k) => k !== driveKey);
                        return decryptedDriveJSON;
                    }
                    catch (_d) {
                        // Wrong key, continue
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            // Finally, if we have a password and a wallet, we can derive a drive key and try it
            if (this.password && this.wallet) {
                const derivedDriveKey = yield crypto_1.deriveDriveKey(this.password, `${driveId}`, JSON.stringify(this.wallet.getPrivateKey()));
                try {
                    const decryptedDriveJSON = yield this.decryptToJson(cipherIV, dataBuffer, derivedDriveKey);
                    // Correct key, add this pair to the cache
                    this.driveKeyCache[`${driveId}`] = derivedDriveKey;
                    return decryptedDriveJSON;
                }
                catch (error) {
                    // Wrong key, continue
                }
            }
            // Decryption is not possible, return placeholder data
            return placeholder;
        });
    }
    /**
     * Decrypts a private data buffer into a decrypted transaction data
     *
     * @throws when the provided driveKey or cipher fails to decrypt the transaction data
     */
    decryptToJson(cipherIV, encryptedDataBuffer, driveKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const decryptedDriveBuffer = yield crypto_1.driveDecrypt(cipherIV, driveKey, encryptedDataBuffer);
            const decryptedDriveString = yield common_1.Utf8ArrayToStr(decryptedDriveBuffer);
            return JSON.parse(decryptedDriveString);
        });
    }
    /** Synchronously returns a driveKey from the cache by its driveId */
    driveKeyForDriveId(driveId) {
        var _a;
        return (_a = this.driveKeyCache[`${driveId}`]) !== null && _a !== void 0 ? _a : false;
    }
}
exports.PrivateKeyData = PrivateKeyData;
