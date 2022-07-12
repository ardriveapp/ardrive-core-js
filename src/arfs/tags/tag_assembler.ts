import { FeeMultiple, GQLTagInterface } from '../../exports';
import { ArFSEntityMetaDataPrototype, ArFSFileDataPrototype } from '../tx/arfs_prototypes';
import assertTagLimits from './tag_assertions';
import { ArFSTagSettings } from '../arfs_tag_settings';

export class ArFSTagAssembler {
	constructor(private readonly arFSTagSettings: ArFSTagSettings) {}

	public assembleBundleTags(feeMultiple?: FeeMultiple, shouldAddTipTag = false): GQLTagInterface[] {
		return this.assembleTags(this.arFSTagSettings.baseBundleTags, feeMultiple, shouldAddTipTag);
	}

	public assembleArFSFileDataTags(
		arFSPrototype: ArFSFileDataPrototype,
		feeMultiple?: FeeMultiple,
		shouldAddTipTag = false
	): GQLTagInterface[] {
		const tags = arFSPrototype.gqlTags;
		this.arFSTagSettings.baseAppTags.forEach((t) => tags.push(t));

		return this.assembleTags(tags, feeMultiple, shouldAddTipTag);
	}

	public assembleArFSMetaDataGqlTags(
		arFSPrototype: ArFSEntityMetaDataPrototype,
		feeMultiple?: FeeMultiple
	): GQLTagInterface[] {
		const tags = arFSPrototype.gqlTags;

		this.arFSTagSettings.baseArFSTags.forEach((t) => tags.push(t));

		return this.assembleTags(tags, feeMultiple);
	}

	private assembleTags(tags: GQLTagInterface[], feeMultiple?: FeeMultiple, shouldAddTipTag = false) {
		this.maybeBoostTags(feeMultiple).forEach((t) => tags.push(t));
		this.maybeTipTags(shouldAddTipTag).forEach((t) => tags.push(t));

		assertTagLimits(tags);

		return tags;
	}

	private maybeBoostTags(feeMultiple?: FeeMultiple): GQLTagInterface[] {
		return feeMultiple && +feeMultiple > 1 ? this.arFSTagSettings.getBoostTags(feeMultiple) : [];
	}

	private maybeTipTags(addTipTag: boolean): GQLTagInterface[] {
		return addTipTag ? this.arFSTagSettings.getTipTags() : [];
	}
}
