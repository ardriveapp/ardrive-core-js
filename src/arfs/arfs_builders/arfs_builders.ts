import { ArFSEntity, ArFSFileOrFolderEntity } from '../arfs_entities';
import { buildQuery } from '../../utils/query';
import {
	ArweaveAddress,
	DriveID,
	AnyEntityID,
	EntityKey,
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
	FeeMultiple
} from '../../types';
import { GatewayAPI } from '../../utils/gateway_api';

export interface ArFSMetadataEntityBuilderParams {
	entityId: AnyEntityID;
	gatewayApi: GatewayAPI;
	owner?: ArweaveAddress;
}
export type ArFSPublicMetadataEntityBuilderParams = ArFSMetadataEntityBuilderParams;
export interface ArFSPrivateMetadataEntityBuilderParams extends ArFSMetadataEntityBuilderParams {
	key: EntityKey;
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
					this.unixTime = new UnixTime(+value);
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

	protected async parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node);
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
