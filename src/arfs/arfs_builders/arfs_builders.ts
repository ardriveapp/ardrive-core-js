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
	CustomMetaDataTagInterface,
	isCustomMetaDataTagInterface,
	EntityMetaDataTransactionData
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
	protected readonly entityId: AnyEntityID;
	protected readonly gatewayApi: GatewayAPI;
	protected readonly owner?: ArweaveAddress;

	customMetaData: CustomMetaDataTagInterface = {};

	constructor({ entityId, gatewayApi, owner }: ArFSMetadataEntityBuilderParams) {
		this.entityId = entityId;
		this.gatewayApi = gatewayApi;
		this.owner = owner;
	}

	abstract getGqlQueryParameters(): GQLTagInterface[];
	protected abstract buildEntity(): Promise<T>;

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
				default:
					unparsedTags.push(tag);
					break;
			}
		});

		return unparsedTags;
	}

	async build(node?: GQLNodeInterface): Promise<T> {
		const extraTags = await this.parseFromArweaveNode(node, this.owner);
		if (extraTags.length > 0) {
			for (const { name, value } of extraTags) {
				this.addToCustomMetaData({ [name]: value });
			}
		}

		return this.buildEntity();
	}

	protected addToCustomMetaData(customMetaData: Record<string, unknown>): void {
		if (isCustomMetaDataTagInterface(customMetaData)) {
			for (const key of Object.keys(customMetaData)) {
				let keyValue: string | string[];

				const prevValue = this.customMetaData[key];
				const newValue = customMetaData[key];

				if (prevValue) {
					keyValue = Array.isArray(prevValue) ? prevValue : [prevValue];

					if (Array.isArray(newValue)) {
						for (const val of newValue) {
							keyValue.push(val);
						}
					} else {
						keyValue.push(newValue);
					}
				} else {
					keyValue = newValue;
				}

				this.customMetaData[key] = keyValue;
			}
		}
	}

	getDataForTxID(txId: TransactionID): Promise<Buffer> {
		return this.gatewayApi.getTxData(txId);
	}

	protected abstract protectedDataJsonKeys: string[];

	protected parseCustomMetaDataFromDataJson(dataJson: EntityMetaDataTransactionData): void {
		const dataJsonEntries = Object.entries(dataJson);

		if (dataJsonEntries.length > this.protectedDataJsonKeys.length) {
			const customMetaData: Record<string, string | string[]> = {};

			for (const [key, val] of dataJsonEntries) {
				if (!this.protectedDataJsonKeys.includes(key)) {
					Object.assign(customMetaData, { [key]: val });
				}
			}

			this.addToCustomMetaData(customMetaData);
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
