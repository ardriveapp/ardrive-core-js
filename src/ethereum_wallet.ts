import { Wallet as EthersWallet } from 'ethers';
import * as crypto from 'crypto';
import { EthereumSigner } from '@dha-team/arbundles';
import Transaction from 'arweave/node/lib/transaction';

import { PublicKey, ArweaveAddress, ADDR } from './types';
import { b64UrlToBuffer, bufferTob64Url } from './utils/wallet_utils';
import { Wallet } from './wallet';

export class EthereumWallet implements Wallet {
        private readonly wallet: EthersWallet;
        private readonly signer: EthereumSigner;

        constructor(privateKey: string) {
                this.wallet = new EthersWallet(privateKey);
                this.signer = new EthereumSigner(this.wallet.privateKey);
        }

        async getPublicKey(): Promise<PublicKey> {
                return bufferTob64Url(this.signer.publicKey);
        }

        async getAddress(): Promise<ArweaveAddress> {
                const hash = crypto
                        .createHash('sha256')
                        .update(b64UrlToBuffer(await this.getPublicKey()))
                        .digest();
                return ADDR(bufferTob64Url(hash));
        }

        async sign(data: Uint8Array): Promise<Uint8Array> {
                const signature = await this.wallet.signMessage(data);
                return Buffer.from(signature.slice(2), 'hex');
        }

        async signTransaction(tx: Transaction): Promise<void> {
                tx.setOwner(await this.getPublicKey());
                const data = await tx.getSignatureData();
                const signature = await this.sign(data);
                const id = crypto.createHash('sha256').update(signature).digest();
                tx.setSignature({
                        id: bufferTob64Url(id),
                        owner: await this.getPublicKey(),
                        signature: bufferTob64Url(signature)
                });
        }

        getSigner(): EthereumSigner {
                return this.signer;
        }
}
