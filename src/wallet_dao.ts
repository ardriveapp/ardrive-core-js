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
import nodeCrypto from 'node:crypto';
import { JWKInterface } from 'arweave/node/lib/wallet';

export type ARTransferResult = {
	txID: TransactionID;
	winston: Winston;
	reward: NetworkReward;
};

const algorithm = { id: 'rsa', modulusLength: 4096 } as const;
const options = { privateKeyFormat: 'pkcs8-pem' } as const;

export class WalletDAO {
	constructor(
		private readonly arweave: Arweave,
		private readonly appName = DEFAULT_APP_NAME,
		private readonly appVersion = DEFAULT_APP_VERSION
	) {}

	async generateSeedPhrase(): Promise<SeedPhrase> {
		const keys = await generateKeyPair(algorithm, options);
		return new SeedPhrase(keys.mnemonic);
	}

	async generateJWKWallet(seedPhrase: SeedPhrase): Promise<JWKWallet> {
		const { privateKey } = await getKeyPairFromMnemonic(seedPhrase.toString(), algorithm, options);

		const pem = nodeCrypto.createPrivateKey({ key: privateKey, format: 'pem' });
		const jwk = pem.export({ format: 'jwk' });

		return Promise.resolve(new JWKWallet(jwk as JWKInterface));
	}

	async getWalletWinstonBalance(wallet: Wallet): Promise<Winston> {
		const address = await wallet.getAddress();

		// When a wallet has an array of addresses, the ETH L1 address is the first one and will be used for balance checks
		return this.getAddressWinstonBalance(Array.isArray(address) ? address[0] : address);
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
		const transaction = await this.arweave.createTransaction(txAttributes);
		if (rewardSettings.feeMultiple?.wouldBoostReward()) {
			transaction.reward = rewardSettings.feeMultiple.boostReward(transaction.reward);
		}

		if (assertBalance) {
			const fromAddress = await fromWallet.getAddress();
			const balanceInWinston = await this.getAddressWinstonBalance(
				Array.isArray(fromAddress) ? fromAddress[0] : fromAddress
			);
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
		await fromWallet.signTransaction(transaction);

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
			throw new Error(`Transaction failed. Response: ${JSON.stringify(response, null, 2)}`);
		}
	}
}
