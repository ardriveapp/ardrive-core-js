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
exports.verifyAndIndexStream = void 0;
const stream_1 = require("stream");
const utils_1 = require("../src/utils");
const base64url_1 = __importDefault(require("base64url"));
const src_1 = require("../src");
const constants_1 = require("../src/constants");
const parser_1 = require("../src/parser");
const crypto = __importStar(require("crypto"));
const utils_2 = require("arweave/web/lib/utils");
const deepHash_1 = require("../src/deepHash");
const signing_1 = require("../src/signing");
async function verifyAndIndexStream(stream) {
    const reader = getReader(stream);
    let bytes = (await reader.next()).value;
    bytes = await hasEnough(reader, bytes, 32);
    const itemCount = (0, utils_1.byteArrayToLong)(bytes.subarray(0, 32));
    bytes = bytes.subarray(32);
    const headersLength = 64 * itemCount;
    bytes = await hasEnough(reader, bytes, headersLength);
    const headers = new Array(itemCount);
    for (let i = 0; i < headersLength; i += 64) {
        headers[i / 64] = [
            (0, utils_1.byteArrayToLong)(bytes.subarray(i, i + 32)),
            (0, base64url_1.default)(Buffer.from(bytes.subarray(i + 32, i + 64))),
        ];
    }
    bytes = bytes.subarray(headersLength);
    let offsetSum = 32 + headersLength;
    const items = new Array(Math.min(itemCount, 1000));
    let count = 0;
    for (const [length, id] of headers) {
        bytes = await hasEnough(reader, bytes, src_1.MIN_BINARY_SIZE);
        // Get sig type
        bytes = await hasEnough(reader, bytes, 2);
        const signatureType = (0, utils_1.byteArrayToLong)(bytes.subarray(0, 2));
        bytes = bytes.subarray(2);
        // Get sig
        const sigLength = constants_1.SIG_CONFIG[signatureType].sigLength;
        bytes = await hasEnough(reader, bytes, sigLength);
        const signature = bytes.subarray(0, sigLength);
        bytes = bytes.subarray(sigLength);
        // Get owner
        const pubLength = constants_1.SIG_CONFIG[signatureType].pubLength;
        bytes = await hasEnough(reader, bytes, pubLength);
        const owner = bytes.subarray(0, pubLength);
        bytes = bytes.subarray(pubLength);
        // Get target
        bytes = await hasEnough(reader, bytes, 1);
        const targetPresent = bytes[0] === 1;
        if (targetPresent)
            bytes = await hasEnough(reader, bytes, 33);
        const target = targetPresent
            ? bytes.subarray(1, 33)
            : Buffer.allocUnsafe(0);
        bytes = bytes.subarray(targetPresent ? 33 : 1);
        // Get anchor
        bytes = await hasEnough(reader, bytes, 1);
        const anchorPresent = bytes[0] === 1;
        if (anchorPresent)
            bytes = await hasEnough(reader, bytes, 33);
        const anchor = anchorPresent
            ? bytes.subarray(1, 33)
            : Buffer.allocUnsafe(0);
        bytes = bytes.subarray(anchorPresent ? 33 : 1);
        // Get tags
        bytes = await hasEnough(reader, bytes, 8);
        const tagsLength = (0, utils_1.byteArrayToLong)(bytes.subarray(0, 8));
        bytes = bytes.subarray(8);
        bytes = await hasEnough(reader, bytes, 8);
        const tagsBytesLength = (0, utils_1.byteArrayToLong)(bytes.subarray(0, 8));
        bytes = bytes.subarray(8);
        bytes = await hasEnough(reader, bytes, tagsBytesLength);
        const tagsBytes = bytes.subarray(0, tagsBytesLength);
        const tags = tagsLength !== 0 && tagsBytesLength !== 0
            ? parser_1.tagsParser.fromBuffer(Buffer.from(tagsBytes))
            : [];
        if (tags.length !== tagsLength)
            throw new Error("Tags lengths don't match");
        bytes = bytes.subarray(tagsBytesLength);
        const transform = new stream_1.Transform();
        transform._transform = function (chunk, _, done) {
            this.push(chunk);
            done();
        };
        // Verify signature
        const signatureData = (0, deepHash_1.deepHash)([
            (0, utils_2.stringToBuffer)("dataitem"),
            (0, utils_2.stringToBuffer)("1"),
            (0, utils_2.stringToBuffer)(signatureType.toString()),
            owner,
            target,
            anchor,
            tagsBytes,
            transform,
        ]);
        // Get offset of data start and length of data
        const dataOffset = 2 +
            sigLength +
            pubLength +
            (targetPresent ? 33 : 1) +
            (anchorPresent ? 33 : 1) +
            16 +
            tagsBytesLength;
        const dataSize = length - dataOffset;
        if (bytes.byteLength > dataSize) {
            transform.write(bytes.subarray(0, dataSize));
            bytes = bytes.subarray(dataSize);
        }
        else {
            let skipped = bytes.byteLength;
            transform.write(bytes);
            while (dataSize > skipped) {
                bytes = (await reader.next()).value;
                if (!bytes) {
                    throw new Error(`Not enough data bytes  expected: ${dataSize} received: ${skipped}`);
                }
                skipped += bytes.byteLength;
                if (skipped > dataSize)
                    transform.write(bytes.subarray(0, bytes.byteLength - (skipped - dataSize)));
                else
                    transform.write(bytes);
            }
            bytes = bytes.subarray(bytes.byteLength - (skipped - dataSize));
        }
        transform.end();
        // Check id
        if (id !== (0, base64url_1.default)(crypto.createHash("sha256").update(signature).digest()))
            throw new Error("ID doesn't match signature");
        const Signer = signing_1.indexToType[signatureType];
        if (!(await Signer.verify(owner, (await signatureData), signature)))
            throw new Error("Invalid signature");
        items[count] = {
            id,
            signature: (0, base64url_1.default)(Buffer.from(signature)),
            target: (0, base64url_1.default)(Buffer.from(target)),
            anchor: (0, base64url_1.default)(Buffer.from(anchor)),
            owner: (0, base64url_1.default)(Buffer.from(owner)),
            tags,
            dataOffset: offsetSum + dataOffset,
            dataSize,
        };
        offsetSum += dataOffset + dataSize;
        count++;
    }
    return items;
}
exports.verifyAndIndexStream = verifyAndIndexStream;
async function hasEnough(reader, buffer, length) {
    if (buffer.byteLength >= length)
        return buffer;
    let next = (await reader.next()).value;
    while (next) {
        buffer = Buffer.concat([buffer, next]);
        if (buffer.byteLength >= length)
            return buffer;
        next = (await reader.next()).value;
    }
    throw new Error("Bundle stream not valid");
}
async function* getReader(s) {
    for await (const chunk of s) {
        yield chunk;
    }
}
//# sourceMappingURL=index.js.map