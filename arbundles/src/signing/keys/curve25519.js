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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const base64url_1 = __importDefault(require("base64url"));
const ed25519 = __importStar(require("@noble/ed25519"));
const constants_1 = require("../../constants");
class Curve25519 {
    constructor(_key, pk) {
        this._key = _key;
        this.pk = pk;
        this.ownerLength = constants_1.SIG_CONFIG[2].pubLength;
        this.signatureLength = constants_1.SIG_CONFIG[2].sigLength;
        this.signatureType = 2;
    }
    get publicKey() {
        return this._publicKey;
    }
    get key() {
        return new Uint8Array(0);
    }
    sign(message) {
        return ed25519.sign(Buffer.from(message), Buffer.from(this.key));
    }
    static async verify(pk, message, signature) {
        let p = pk;
        if (typeof pk === "string")
            p = base64url_1.default.toBuffer(pk);
        return ed25519.verify(Buffer.from(signature), Buffer.from(message), Buffer.from(p));
    }
}
exports.default = Curve25519;
//# sourceMappingURL=curve25519.js.map