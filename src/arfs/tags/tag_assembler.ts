import { FeeMultiple, GQLTagInterface } from '../../types';
import { ArFSEntityMetaDataPrototype, ArFSFileDataPrototype, ArFSObjectMetadataPrototype } from '../tx/arfs_prototypes';
import assertTagLimits from './tag_assertions';
import { ArFSTagSettings } from '../arfs_tag_settings';

interface WithPrototype<T extends ArFSObjectMetadataPrototype> {
	arFSPrototype: T;
}
interface WithFeeMultiple {
	feeMultiple?: FeeMultiple;
}
interface WithTipBoolean {
	shouldAddTipTag?: boolean;
}

type AssembleBundleTagsParams = WithFeeMultiple & WithTipBoolean;
type AssembleFileDataTagsParams = WithPrototype<ArFSFileDataPrototype> & WithFeeMultiple & WithTipBoolean;
type AssembleMetaDataTagsParams = WithPrototype<ArFSEntityMetaDataPrototype> & WithFeeMultiple;

export class ArFSTagAssembler {
	constructor(private readonly arFSTagSettings: ArFSTagSettings) {}

	public assembleBundleTags({ feeMultiple, shouldAddTipTag }: AssembleBundleTagsParams): GQLTagInterface[] {
		return this.assembleTags(this.arFSTagSettings.baseBundleTags, feeMultiple, shouldAddTipTag);
	}

	public assembleArFSFileDataTags({
		arFSPrototype,
		feeMultiple,
		shouldAddTipTag = false
	}: AssembleFileDataTagsParams): GQLTagInterface[] {
		const tags = arFSPrototype.gqlTags;
		this.arFSTagSettings.baseAppTags.forEach((t) => tags.push(t));

		return this.assembleTags(tags, feeMultiple, shouldAddTipTag);
	}

	public assembleArFSMetaDataGqlTags({ arFSPrototype, feeMultiple }: AssembleMetaDataTagsParams): GQLTagInterface[] {
		const tags = arFSPrototype.gqlTags;

		this.arFSTagSettings.baseArFSTags.forEach((t) => tags.push(t));

		return this.assembleTags(tags, feeMultiple);
	}

	private assembleTags(tags: GQLTagInterface[], feeMultiple?: FeeMultiple, shouldAddTipTag = false) {
		this.getBoostTags(feeMultiple).forEach((t) => tags.push(t));
		this.getTipTags(shouldAddTipTag).forEach((t) => tags.push(t));

		assertTagLimits(tags);

		return tags;
	}

	private getBoostTags(feeMultiple?: FeeMultiple): GQLTagInterface[] {
		return feeMultiple && +feeMultiple > 1 ? this.arFSTagSettings.getBoostTags(feeMultiple) : [];
	}

	private getTipTags(addTipTag: boolean): GQLTagInterface[] {
		return addTipTag ? this.arFSTagSettings.getTipTags() : [];
	}
}
