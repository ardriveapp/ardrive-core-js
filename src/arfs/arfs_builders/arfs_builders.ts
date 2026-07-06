import { ArFSEntity, ArFSFileOrFolderEntity } from '../arfs_entities';
import { buildQuery } from '../../utils/query';
import {
	ArweaveAddress,
	DriveID,
	AnyEntityID,
	FolderID,
	TransactionID,
	TxID,
	UnixTime,
	EID,
	ContentType,
	EntityType,
	GQLNodeInterface,
	GQLTagInterface,
	CustomMetaDataGqlTags,
	isCustomMetaDataJsonFields,
	CustomMetaData,
	CustomMetaDataJsonFields,
	isCustomMetaDataGqlTags,
	FeeMultiple,
	DriveSignatureType,
	DriveKey
} from '../../types';
import { GatewayAPI } from '../../utils/gateway_api';

/**
 * Tolerantly parses an entity's on-chain `Unix-Time` tag.
 *
 * CORE-5: A real owner's public drive failed to list entirely, throwing
 * "Unix time must be a positive integer!" during `listPublicFolder` because a
 * single entity carried a malformed `Unix-Time` tag (e.g. negative, non-integer
 * or non-numeric). The `UnixTime` constructor rejects such values, and the
 * listing path (getAllFoldersOfPublicDrive / getPublicFilesWithParentFolderIds)
 * only skips `SyntaxError`, so the plain Error was re-thrown and aborted the
 * ENTIRE drive reconstruction — one bad entity killed the whole listing.
 *
 * ardrive-web tolerates this; core-js must too. Rather than dropping the entity
 * (which for a folder would orphan its children in the hierarchy), we clamp an
 * invalid timestamp to the Unix epoch (0) so the entity still lists. The
 * tolerance is scoped to entity parsing only — the `UnixTime` invariant stays
 * strict everywhere else (tx/cost timestamps), so we simply fall back when the
 * strict constructor rejects the value instead of duplicating its rules.
 */
function parseEntityUnixTime(value: string): UnixTime {
	try {
		return new UnixTime(+value);
	} catch {
		console.error(
			`Invalid Unix-Time tag "${value}" on entity metadata; defaulting to epoch (0) so the drive still lists. [CORE-5]`
		);
		return new UnixTime(0);
	}
}

export interface ArFSMetadataEntityBuilderParams {
	entityId: AnyEntityID;
	gatewayApi: GatewayAPI;
	owner?: ArweaveAddress;
}
export type ArFSPublicMetadataEntityBuilderParams = ArFSMetadataEntityBuilderParams;
export interface ArFSPrivateMetadataEntityBuilderParams extends ArFSMetadataEntityBuilderParams {
	key: DriveKey;
	driveSignatureType: DriveSignatureType;
}

export type ArFSMetadataEntityBuilderFactoryFunction<
	T extends ArFSEntity,
	B extends ArFSMetadataEntityBuilder<T>,
	P extends ArFSMetadataEntityBuilderParams
> = (params: P) => B;

export abstract class ArFSMetadataEntityBuilder<T extends ArFSEntity> {
	appName?: string;
	appVersion?: string;
	arFS?: string;
	contentType?: ContentType;
	driveId?: DriveID;
	entityType?: EntityType;
	name?: string;
	txId?: TransactionID;
	unixTime?: UnixTime;
	blockHeight?: number;
	boost?: FeeMultiple;
	protected readonly entityId: AnyEntityID;
	protected readonly gatewayApi: GatewayAPI;
	protected readonly owner?: ArweaveAddress;

	customMetaData: CustomMetaData = {};

	constructor({ entityId, gatewayApi, owner }: ArFSMetadataEntityBuilderParams) {
		this.entityId = entityId;
		this.gatewayApi = gatewayApi;
		this.owner = owner;
	}

	abstract getGqlQueryParameters(): GQLTagInterface[];
	protected abstract buildEntity(): Promise<T>;

	public getDataForTxID(txId: TransactionID): Promise<Buffer> {
		return this.gatewayApi.getTxData(txId);
	}

	/**
	 * Parses data for builder fields from either the provided GQL tags, or from a fresh request to Arweave for tag data
	 *
	 * @param node (optional) a pre-fetched GQL node containing the txID and tags that will be parsed out of the on-chain data
	 *
	 * @param owner (optional) filter all transactions out by owner's public arweave address
	 *
	 * @returns an array of unparsed tags
	 */
	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		if (!node) {
			const gqlQuery = buildQuery({ tags: this.getGqlQueryParameters(), owner });

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);

			const { edges } = transactions;

			if (!edges.length) {
				throw new Error(`Entity with ID ${this.entityId} not found!`);
			}

			node = edges[0].node;
		}
		this.txId = TxID(node.id);
		// Extract block height if available
		if (node.block) {
			this.blockHeight = node.block.height;
		}
		const { tags } = node;
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					this.appName = value;
					break;
				case 'App-Version':
					this.appVersion = value;
					break;
				case 'ArFS':
					this.arFS = value;
					break;
				case 'Content-Type':
					this.contentType = value as ContentType;
					break;
				case 'Drive-Id':
					this.driveId = EID(value);
					break;
				case 'Entity-Type':
					this.entityType = value as EntityType;
					break;
				case 'Unix-Time':
					// CORE-5: tolerate a malformed Unix-Time tag on one entity instead of
					// aborting the whole drive listing (clamps invalid values to epoch).
					this.unixTime = parseEntityUnixTime(value);
					break;
				case 'Boost':
					this.boost = new FeeMultiple(+value);
					break;
				default:
					unparsedTags.push(tag);
					break;
			}
		});

		return unparsedTags;
	}

	public async build(node?: GQLNodeInterface): Promise<T> {
		const extraTags = await this.parseFromArweaveNode(node, this.owner);
		this.parseCustomMetaDataFromGqlTags(extraTags);

		return this.buildEntity();
	}

	private parseCustomMetaDataFromGqlTags(gqlTags: GQLTagInterface[]): void {
		const customMetaDataGqlTags: CustomMetaDataGqlTags = {};

		for (const { name, value: newValue } of gqlTags) {
			const prevValue = customMetaDataGqlTags[name];

			// Accumulate any duplicated GQL tags into string[]
			const nextValue = prevValue
				? Array.isArray(prevValue)
					? [...prevValue, newValue]
					: [prevValue, newValue]
				: newValue;

			Object.assign(customMetaDataGqlTags, { [name]: nextValue });
		}

		if (!isCustomMetaDataGqlTags(customMetaDataGqlTags)) {
			console.error(
				`Parsed an invalid custom metadata shape from MetaData Tx GQL Tags: ${customMetaDataGqlTags}`
			);
			return;
		}

		if (Object.keys(customMetaDataGqlTags).length > 0) {
			this.customMetaData.metaDataGqlTags = customMetaDataGqlTags;
		}
	}

	protected abstract protectedDataJsonKeys: string[];

	protected parseCustomMetaDataFromDataJson(dataJson: CustomMetaDataJsonFields): void {
		if (!isCustomMetaDataJsonFields(dataJson)) {
			console.error(`Parsed an invalid custom metadata shape from MetaData Tx Data JSON: ${dataJson}`);
			return;
		}
		const dataJsonEntries = Object.entries(dataJson).filter(([key]) => !this.protectedDataJsonKeys.includes(key));
		const customMetaDataJson: CustomMetaDataJsonFields = {};

		for (const [key, val] of dataJsonEntries) {
			Object.assign(customMetaDataJson, { [key]: val });
		}

		if (Object.keys(customMetaDataJson).length > 0) {
			this.customMetaData.metaDataJson = customMetaDataJson;
		}
	}
}

export abstract class ArFSFileOrFolderBuilder<
	U extends 'file' | 'folder',
	T extends ArFSFileOrFolderEntity<U>
> extends ArFSMetadataEntityBuilder<T> {
	parentFolderId?: FolderID;

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node, owner);
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'Parent-Folder-Id':
					this.parentFolderId = EID(value);
					break;
				default:
					unparsedTags.push(tag);
					break;
			}
		});

		return unparsedTags;
	}
}
