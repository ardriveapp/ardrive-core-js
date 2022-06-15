import { FeeMultiple, GQLTagInterface } from '../../exports';
import { ArFSEntityMetaDataPrototype, ArFSFileDataPrototype } from '../tx/arfs_prototypes';
import { TagAssertions } from './tag_assertions';
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

	public assembleArFSMetaDataTags(
		arFSPrototype: ArFSEntityMetaDataPrototype,
		feeMultiple?: FeeMultiple
	): GQLTagInterface[] {
		const tags = arFSPrototype.gqlTags;

		this.arFSTagSettings.baseArFSTags.forEach((t) => tags.push(t));

		if (arFSPrototype.entityType === 'file') {
			// Add any custom tags to a File MetaData Tx's GQL Tags
			this.maybeCustomTags((t) => arFSPrototype.assertProtectedTags(t)).forEach((t) => tags.push(t));
		}

		return this.assembleTags(tags, feeMultiple);
	}

	private assembleTags(tags: GQLTagInterface[], feeMultiple?: FeeMultiple, shouldAddTipTag = false) {
		this.maybeBoostTags(feeMultiple).forEach((t) => tags.push(t));
		this.maybeTipTags(shouldAddTipTag).forEach((t) => tags.push(t));

		new TagAssertions().assertTagLimits(tags);

		return tags;
	}

	private maybeBoostTags(feeMultiple?: FeeMultiple): GQLTagInterface[] {
		return feeMultiple && +feeMultiple > 1 ? this.arFSTagSettings.getBoostTags(feeMultiple) : [];
	}

	private maybeTipTags(addTipTag: boolean): GQLTagInterface[] {
		return addTipTag ? this.arFSTagSettings.getTipTags() : [];
	}

	private maybeCustomTags(assertProtectedTags: (tags: GQLTagInterface[]) => void): GQLTagInterface[] {
		const customMetaData = this.arFSTagSettings.maybeCustomFileMetaDataGqlTags();
		if (!customMetaData) {
			return [];
		}

		const tagsAsArray = Object.entries(customMetaData);

		const tags: GQLTagInterface[] = [];
		for (const [name, values] of tagsAsArray) {
			if (typeof values === 'string') {
				tags.push({ name, value: values });
			} else {
				for (const value of values) {
					// Push each unique value as its own tag
					tags.push({ name, value });
				}
			}
		}

		if (tags.length > 0) {
			assertProtectedTags(tags);
			return tags;
		}

		return [];
	}
}
