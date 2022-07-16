/// <reference types="node" />
import Secp256k1 from "../keys/secp256k1";
export default class EthereumSigner extends Secp256k1 {
    get publicKey(): Buffer;
    constructor(key: string);
    sign(message: Uint8Array): Uint8Array;
    static verify(pk: string | Buffer, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}
