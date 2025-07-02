import { JWKInterface } from 'arweave/node/lib/wallet';
import * as crypto from 'crypto';
import jwkToPem, { JWK } from 'jwk-to-pem';
import { PublicKey, ArweaveAddress, ADDR } from './types';
import { b64UrlToBuffer, bufferTob64Url } from './utils/wallet_utils';
import { Wallet } from './wallet';
import { ArweaveSigner } from '@dha-team/arbundles';
import Transaction from 'arweave/node/lib/transaction';

export class JWKWallet implements Wallet {
	constructor(private readonly jwk: JWKInterface) {}

	getPublicKey(): Promise<PublicKey> {
		return Promise.resolve(this.jwk.n);
	}

	getPrivateKey(): JWKInterface {
		return this.jwk;
	}

	async getAddress(): Promise<ArweaveAddress> {
		const result = crypto
			.createHash('sha256')
			.update(b64UrlToBuffer(await this.getPublicKey()))
			.digest();
		return Promise.resolve(ADDR(bufferTob64Url(result)));
	}

	// Use cases: generating drive keys, file keys, etc.
        sign(data: Uint8Array): Promise<Uint8Array> {
                const sign = crypto.createSign('sha256');
                sign.update(data);
                const pem: string = jwkToPem(this.jwk as JWK, { private: true });
                const signature = sign.sign({
                        key: pem,
                        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                        saltLength: 0 // We do not need to salt the signature since we combine with a random UUID
                });
                return Promise.resolve(signature);
        }

        async signTransaction(tx: Transaction): Promise<void> {
                tx.setOwner(this.jwk.n);
                const data = await tx.getSignatureData();
                const signature = await this.sign(data);
                const id = crypto.createHash('sha256').update(signature).digest();
                tx.setSignature({
                        id: bufferTob64Url(id),
                        owner: this.jwk.n,
                        signature: bufferTob64Url(signature)
                });
        }

        getSigner(): ArweaveSigner {
                return new ArweaveSigner(this.jwk);
        }
}
