import Arweave from 'arweave';
import { CreateTransactionInterface } from 'arweave/node/common';
import { JWKWallet } from './jwk_wallet';
import {
	TransactionID,
	Winston,
	NetworkReward,
	SeedPhrase,
	ArweaveAddress,
	W,
	AR,
	RewardSettings,
	GQLTagInterface,
	TxID
} from './types';
import { Wallet } from './wallet';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from './utils/constants';
import assertTagLimits from './arfs/tags/tag_assertions';
import { generateKeyPair, getKeyPairFromMnemonic } from 'human-crypto-keys';
import * as nodeCrypto from 'crypto';
import { JWKInterface } from 'arweave/node/lib/wallet';

export type ARTransferResult = {
	txID: TransactionID;
	winston: Winston;
	reward: NetworkReward;
};

export class WalletDAO {
	constructor(
		private readonly arweave: Arweave,
		private readonly appName = DEFAULT_APP_NAME,
		private readonly appVersion = DEFAULT_APP_VERSION
	) {}

	async generateSeedPhrase(): Promise<SeedPhrase> {
		const keys = await generateKeyPair({ id: 'rsa', modulusLength: 4096 }, { privateKeyFormat: 'pkcs8-pem' });
		return new SeedPhrase(keys.mnemonic);
	}

	async generateJWKWallet2(seedPhrase: SeedPhrase): Promise<JWKWallet> {
		const { privateKey } = await getKeyPairFromMnemonic(
			seedPhrase.toString(),
			{
				id: 'rsa',
				modulusLength: 4096
			},
			{ privateKeyFormat: 'pkcs8-pem' }
		);

		const pem = nodeCrypto.createPrivateKey({ key: privateKey, format: 'pem' });
		const jwk = pem.export({ format: 'jwk' });

		return Promise.resolve(new JWKWallet(jwk as JWKInterface));
	}

	async generateJWKWallet(seedPhrase: SeedPhrase): Promise<JWKWallet> {
		const { privateKey } = await getKeyPairFromMnemonic(
			seedPhrase.toString(),
			{
				id: 'rsa',
				modulusLength: 4096
			},
			{ privateKeyFormat: 'pkcs8-der' }
		);

		const key = await nodeCrypto.subtle.importKey(
			'pkcs8',
			privateKey as never,
			{ name: 'RSA-PSS', hash: 'SHA-256' },
			true,
			['sign']
		);
		const jwk = await nodeCrypto.subtle.exportKey('jwk', key);

		return new JWKWallet({
			kty: jwk.kty!,
			e: jwk.e!,
			n: jwk.n!,
			d: jwk.d,
			p: jwk.p,
			q: jwk.q,
			dp: jwk.dp,
			dq: jwk.dq,
			qi: jwk.qi
		});
	}

	async getWalletWinstonBalance(wallet: Wallet): Promise<Winston> {
		return this.getAddressWinstonBalance(await wallet.getAddress());
	}

	async getAddressWinstonBalance(address: ArweaveAddress): Promise<Winston> {
		return Promise.resolve(W(+(await this.arweave.wallets.getBalance(address.toString()))));
	}

	async walletHasBalance(wallet: Wallet, winstonPrice: Winston): Promise<boolean> {
		const walletBalance = await this.getWalletWinstonBalance(wallet);
		return walletBalance.isGreaterThan(winstonPrice);
	}

	async sendARToAddress(
		arAmount: AR,
		fromWallet: Wallet,
		toAddress: ArweaveAddress,
		rewardSettings: RewardSettings = {},
		dryRun = false,
		[
			{ value: appName = this.appName },
			{ value: appVersion = this.appVersion },
			{ value: txType = 'transfer' },
			...otherTags
		]: GQLTagInterface[],
		assertBalance = false
	): Promise<ARTransferResult> {
		// TODO: Figure out how this works for other wallet types
		const jwkWallet = fromWallet as JWKWallet;
		const winston: Winston = arAmount.toWinston();

		// Create transaction
		const txAttributes: Partial<CreateTransactionInterface> = {
			target: toAddress.toString(),
			quantity: winston.toString()
		};

		// If we provided our own reward settings, use them now
		if (rewardSettings.reward) {
			txAttributes.reward = rewardSettings.reward.toString();
		}

		// TODO: Use a mock arweave server instead
		if (process.env.NODE_ENV === 'test') {
			txAttributes.last_tx = 'STUB';
		}
		const transaction = await this.arweave.createTransaction(txAttributes, jwkWallet.getPrivateKey());
		if (rewardSettings.feeMultiple?.wouldBoostReward()) {
			transaction.reward = rewardSettings.feeMultiple.boostReward(transaction.reward);
		}

		if (assertBalance) {
			const fromAddress = await fromWallet.getAddress();
			const balanceInWinston = await this.getAddressWinstonBalance(fromAddress);
			const total = W(transaction.reward).plus(W(transaction.quantity));
			if (total.isGreaterThan(balanceInWinston)) {
				throw new Error(
					[
						`Insufficient funds for this transaction`,
						`quantity: ${transaction.quantity}`,
						`minerReward: ${transaction.reward}`,
						`balance: ${balanceInWinston}`,
						`total: ${total}`,
						`difference: ${Winston.difference(total, balanceInWinston)}`
					].join('\n\t')
				);
			}
		}

		// Tag file with data upload Tipping metadata
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Type', txType);
		if (rewardSettings.feeMultiple?.wouldBoostReward()) {
			transaction.addTag('Boost', rewardSettings.feeMultiple.toString());
		}
		otherTags?.forEach((tag) => {
			transaction.addTag(tag.name, tag.value);
		});

		assertTagLimits(transaction.tags);

		// Sign file
		await this.arweave.transactions.sign(transaction, jwkWallet.getPrivateKey());

		// Submit the transaction
		const response = await (async () => {
			if (dryRun) {
				return { status: 200, statusText: 'OK', data: '' };
			} else {
				return this.arweave.transactions.post(transaction);
			}
		})();
		if (response.status === 200 || response.status === 202) {
			return Promise.resolve({
				txID: TxID(transaction.id),
				winston,
				reward: W(transaction.reward)
			});
		} else {
			throw new Error(`Transaction failed. Response: ${response}`);
		}
	}
}
