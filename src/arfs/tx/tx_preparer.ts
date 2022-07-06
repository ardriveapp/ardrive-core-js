import { bundleAndSignData, createData, DataItem } from 'arbundles';
import { ArweaveSigner } from 'arbundles/src/signing';
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import { GQLTagInterface } from '../../exports';
import { JWKWallet } from '../../jwk_wallet';
import { ArFSTagAssembler } from '../tags/tag_assembler';
import { ArFSObjectTransactionData } from './arfs_tx_data_types';

import { TxAttributesToAssemble } from './tx_attributes';
import {
	TxPreparerParams,
	ArFSPrepareFileDataItemParams,
	ArFSPrepareMetaDataItemParams,
	ArFSPrepareObjectBundleParams,
	ArFSPrepareFileDataTxParams,
	ArFSPrepareMetaDataTxParams,
	PrepareTxParams
} from './tx_preparer_types';

export class TxPreparer {
	private readonly arweave: Arweave;
	private readonly wallet: JWKWallet;
	private readonly signer: ArweaveSigner;
	private readonly tagAssembler: ArFSTagAssembler;

	public constructor({ arweave, wallet, arFSTagAssembler }: TxPreparerParams) {
		this.arweave = arweave;
		this.wallet = wallet;
		this.tagAssembler = arFSTagAssembler;
		this.signer = new ArweaveSigner(this.wallet.getPrivateKey());
	}

	public async prepareFileDataDataItem({ objectMetaData }: ArFSPrepareFileDataItemParams): Promise<DataItem> {
		const tags = this.tagAssembler.assembleArFSFileDataTags(objectMetaData);

		return this.prepareAndSignDataItem(objectMetaData.objectData, tags);
	}

	public async prepareMetaDataDataItem({ objectMetaData }: ArFSPrepareMetaDataItemParams): Promise<DataItem> {
		const tags = this.tagAssembler.assembleArFSMetaDataGqlTags(objectMetaData);

		return this.prepareAndSignDataItem(objectMetaData.objectData, tags);
	}

	private async prepareAndSignDataItem(
		objectData: ArFSObjectTransactionData,
		tags: GQLTagInterface[]
	): Promise<DataItem> {
		const signer = this.signer;

		const dataItem = createData(objectData.asTransactionData(), signer, { tags });
		await dataItem.sign(signer);

		return dataItem;
	}

	public async prepareBundleTx({
		dataItems,
		communityTipSettings,
		rewardSettings
	}: ArFSPrepareObjectBundleParams): Promise<Transaction> {
		const bundle = await bundleAndSignData(dataItems, this.signer);

		// Release dataItems from memory
		dataItems = [];

		// Verify the bundle and dataItems
		if (!(await bundle.verify())) {
			throw new Error('Bundle format could not be verified!');
		}

		const tags = this.tagAssembler.assembleBundleTags(rewardSettings.feeMultiple, !!communityTipSettings);

		return this.prepareTx({
			data: bundle.getRaw(),
			rewardSettings,
			communityTipSettings,
			tags
		});
	}

	public async prepareFileDataTx({
		objectMetaData,
		rewardSettings,
		communityTipSettings
	}: ArFSPrepareFileDataTxParams): Promise<Transaction> {
		const tags = this.tagAssembler.assembleArFSFileDataTags(
			objectMetaData,
			rewardSettings.feeMultiple,
			!!communityTipSettings
		);

		return this.prepareTx({
			data: objectMetaData.objectData.asTransactionData(),
			rewardSettings,
			communityTipSettings,
			tags
		});
	}

	public async prepareMetaDataTx({
		objectMetaData,
		rewardSettings
	}: ArFSPrepareMetaDataTxParams): Promise<Transaction> {
		const tags = this.tagAssembler.assembleArFSMetaDataGqlTags(objectMetaData, rewardSettings.feeMultiple);

		return this.prepareTx({ data: objectMetaData.objectData.asTransactionData(), tags, rewardSettings });
	}

	private prepareTx({ data, tags, rewardSettings, communityTipSettings }: PrepareTxParams): Promise<Transaction> {
		const txAttributes = new TxAttributesToAssemble({
			data
		});

		txAttributes.addRewardSettings(rewardSettings);
		txAttributes.addCommunityTipSettings(communityTipSettings);

		return this.createAndSignTx(txAttributes, tags);
	}

	private async createAndSignTx(txAttributes: TxAttributesToAssemble, tags: GQLTagInterface[]): Promise<Transaction> {
		const transaction = await this.arweave.createTransaction(txAttributes.assemble(), this.wallet.getPrivateKey());

		for (const tag of tags) {
			transaction.addTag(tag.name, tag.value);
		}

		await this.arweave.transactions.sign(transaction, this.wallet.getPrivateKey());

		return transaction;
	}
}
