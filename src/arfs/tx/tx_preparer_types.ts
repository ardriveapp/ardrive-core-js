import { DataItem } from '@dha-team/arbundles';
import Arweave from 'arweave';
import { CommunityTipSettings, RewardSettings, GQLTagInterface } from '../../exports';
import { Wallet } from '../../wallet';
import { ArFSTagAssembler } from '../tags/tag_assembler';
import { ArFSObjectMetadataPrototype, ArFSFileDataPrototype, ArFSEntityMetaDataPrototype } from './arfs_prototypes';

export type ArFSPrepareDataItemsParams<T = ArFSObjectMetadataPrototype> = {
	objectMetaData: T;
};

export type ArFSPrepareFileDataItemParams = ArFSPrepareDataItemsParams<ArFSFileDataPrototype>;
export type ArFSPrepareMetaDataItemParams = ArFSPrepareDataItemsParams<ArFSEntityMetaDataPrototype>;

export type ArFSPrepareObjectBundleParams = {
	dataItems: DataItem[];
} & withRewardSettings &
	withCommunityTipSettings;

export type ArFSPrepareFileDataTxParams = ArFSPrepareDataItemsParams<ArFSFileDataPrototype> &
	withRewardSettings &
	withCommunityTipSettings;

export type ArFSPrepareMetaDataTxParams = ArFSPrepareDataItemsParams<ArFSEntityMetaDataPrototype> & withRewardSettings;

type withCommunityTipSettings = {
	communityTipSettings?: CommunityTipSettings;
};
type withRewardSettings = {
	rewardSettings: RewardSettings;
};

export type PrepareTxParams<T = string | Buffer> = { data: T; tags: GQLTagInterface[] } & withCommunityTipSettings &
	withRewardSettings;

export interface TxPreparerParams {
	arweave: Arweave;
	wallet: Wallet;
	arFSTagAssembler: ArFSTagAssembler;
}
