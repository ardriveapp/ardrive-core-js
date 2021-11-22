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
exports.JWKWallet = void 0;
const crypto = __importStar(require("crypto"));
const jwk_to_pem_1 = __importDefault(require("jwk-to-pem"));
const types_1 = require("./types");
const wallet_utils_1 = require("./utils/wallet_utils");
class JWKWallet {
    constructor(jwk) {
        this.jwk = jwk;
    }
    getPublicKey() {
        return Promise.resolve(this.jwk.n);
    }
    getPrivateKey() {
        return this.jwk;
    }
    getAddress() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = crypto
                .createHash('sha256')
                .update(wallet_utils_1.b64UrlToBuffer(yield this.getPublicKey()))
                .digest();
            return Promise.resolve(types_1.ADDR(wallet_utils_1.bufferTob64Url(result)));
        });
    }
    // Use cases: generating drive keys, file keys, etc.
    sign(data) {
        const sign = crypto.createSign('sha256');
        sign.update(data);
        const pem = jwk_to_pem_1.default(this.jwk, { private: true });
        const signature = sign.sign({
            key: pem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 0 // We do not need to salt the signature since we combine with a random UUID
        });
        return Promise.resolve(signature);
    }
}
exports.JWKWallet = JWKWallet;
