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
Object.defineProperty(exports, "__esModule", { value: true });
exports.b64UrlDecode = exports.b64UrlToBuffer = exports.bufferTob64 = exports.b64UrlEncode = exports.bufferTob64Url = void 0;
const B64js = __importStar(require("base64-js"));
function bufferTob64Url(buffer) {
    return b64UrlEncode(bufferTob64(buffer));
}
exports.bufferTob64Url = bufferTob64Url;
function b64UrlEncode(b64UrlString) {
    return b64UrlString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
exports.b64UrlEncode = b64UrlEncode;
function bufferTob64(buffer) {
    return B64js.fromByteArray(new Uint8Array(buffer));
}
exports.bufferTob64 = bufferTob64;
function b64UrlToBuffer(b64UrlString) {
    return new Uint8Array(B64js.toByteArray(b64UrlDecode(b64UrlString)));
}
exports.b64UrlToBuffer = b64UrlToBuffer;
function b64UrlDecode(b64UrlString) {
    b64UrlString = b64UrlString.replace(/-/g, '+').replace(/_/g, '/');
    let padding;
    b64UrlString.length % 4 == 0 ? (padding = 0) : (padding = 4 - (b64UrlString.length % 4));
    return b64UrlString.concat('='.repeat(padding));
}
exports.b64UrlDecode = b64UrlDecode;
