import { EthereumSigner } from '@dha-team/arbundles';
import Transaction from 'arweave/node/lib/transaction';

import { PublicKey, ArweaveAddress, ADDR } from './types';
import { bufferTob64Url, ownerToAddress, toB64Url } from './utils/wallet_utils';
import { Wallet } from './wallet';
import { ec as EC } from 'elliptic';
import Arweave from 'arweave';
import { fromJWK, SECP256k1PublicKey } from 'arweave/node/lib/crypto/keys';
import { JWKInterface } from 'arweave/node/lib/wallet';

export class EthereumWallet implements Wallet {
	private readonly signer: EthereumSigner;
	private readonly jwk: JsonWebKey;

	constructor(privateKey: string) {
		this.signer = new EthereumSigner(privateKey);
		const ec = new EC('secp256k1');

		const key = ec.keyFromPrivate(privateKey, 'hex');
		const pubPoint = key.getPublic();

		// Get x, y, d in base64url format
		const x = bufferTob64Url(Uint8Array.from(pubPoint.getX().toArray('be', 32)));
		const y = bufferTob64Url(Uint8Array.from(pubPoint.getY().toArray('be', 32)));
		const d = bufferTob64Url(Uint8Array.from(key.getPrivate().toArray('be', 32)));

		// JWK structure
		const jwk = {
			kty: 'EC',
			crv: 'secp256k1',
			x,
			y,
			d
		};
		this.jwk = jwk;
	}

	getPrivateKey(): JWKInterface {
		return this.jwk as JWKInterface;
	}

	async getPublicKey(): Promise<PublicKey> {
		const pubKey = await (await fromJWK(this.jwk)).public();
		return bufferTob64Url(Buffer.from(await pubKey.identifier()));
	}

	async getAddress(): Promise<ArweaveAddress[]> {
		const ethNormalizedL1Address = ADDR(
			await Arweave.init({
				host: 'arweave.net',
				port: 443,
				protocol: 'https'
			}).wallets.jwkToAddress(await fromJWK(this.jwk))
		);

		const pubKeyFromSigner = toB64Url(this.signer.publicKey);
		const ethNormalizedL2Address = ownerToAddress(pubKeyFromSigner);

		return [ethNormalizedL1Address, ADDR(ethNormalizedL2Address)];
	}

	async sign(data: Uint8Array): Promise<Uint8Array> {
		return (await fromJWK(this.jwk)).sign({ payload: Buffer.from(data), isDigest: false });
	}

	async signTransaction(tx: Transaction): Promise<void> {
		return Arweave.init({
			host: 'arweave.net',
			port: 443,
			protocol: 'https'
		}).transactions.sign(tx, await fromJWK(this.jwk));
	}

	/** Returns ANS-104 Signer */
	getSigner(): EthereumSigner {
		return this.signer;
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function secp256k1OwnerFromTx(tx: any): Promise<string> {
	if (tx.signature === null) {
		throw new Error('secp256k1OwnerFromTx error: transaction has no signature, cannot recover owner');
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const transaction = new Transaction(tx);
	const signatureData = await transaction.getSignatureData();
	const publicKey = await SECP256k1PublicKey.recover({
		payload: signatureData,
		isDigest: false,
		signature: Buffer.from(tx.signature, 'base64url')
	});

	return Buffer.from(await publicKey.identifier()).toString('base64url');
}
