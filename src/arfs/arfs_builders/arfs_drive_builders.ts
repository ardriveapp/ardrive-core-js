import { driveDecrypt } from '../../utils/crypto';
import { PrivateKeyData } from '../private_key_data';
import {
	CipherIV,
	DriveKey,
	FolderID,
	EID,
	EntityID,
	DriveAuthMode,
	DrivePrivacy,
	GQLNodeInterface,
	GQLTagInterface,
	EntityMetaDataTransactionData
} from '../../types';
import { Utf8ArrayToStr } from '../../utils/common';
import { ENCRYPTED_DATA_PLACEHOLDER, fakeEntityId } from '../../utils/constants';
import { ArFSPublicDrive, ArFSPrivateDrive, ArFSDriveEntity } from '../arfs_entities';
import {
	ArFSMetadataEntityBuilder,
	ArFSMetadataEntityBuilderParams,
	ArFSPrivateMetadataEntityBuilderParams
} from './arfs_builders';
import { ArFSPrivateDriveKeyless, ArweaveAddress } from '../../exports';
import { GatewayAPI } from '../../utils/gateway_api';

export interface DriveMetaDataTransactionData extends EntityMetaDataTransactionData {
	name: string;
	rootFolderId: string;
}

abstract class ArFSDriveBuilder<T extends ArFSDriveEntity> extends ArFSMetadataEntityBuilder<T> {
	protected readonly protectedDataJsonKeys = ['name', 'rootFolderId'];
}

export class ArFSPublicDriveBuilder extends ArFSDriveBuilder<ArFSPublicDrive> {
	drivePrivacy?: DrivePrivacy;
	rootFolderId?: FolderID;

	static fromArweaveNode(node: GQLNodeInterface, gatewayApi: GatewayAPI): ArFSPublicDriveBuilder {
		const { tags } = node;
		const driveId = tags.find((tag) => tag.name === 'Drive-Id')?.value;
		if (!driveId) {
			throw new Error('Drive-ID tag missing!');
		}
		const driveBuilder = new ArFSPublicDriveBuilder({ entityId: EID(driveId), gatewayApi });
		return driveBuilder;
	}

	getGqlQueryParameters(): GQLTagInterface[] {
		return [
			{ name: 'Drive-Id', value: `${this.entityId}` },
			{ name: 'Entity-Type', value: 'drive' },
			{ name: 'Drive-Privacy', value: 'public' }
		];
	}

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node, owner);
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'Drive-Privacy':
					this.drivePrivacy = value as DrivePrivacy;
					break;
				default:
					unparsedTags.push(tag);
					break;
			}
		});
		return unparsedTags;
	}

	protected async buildEntity(): Promise<ArFSPublicDrive> {
		if (
			this.appName?.length &&
			this.appVersion?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.driveId.equals(this.entityId) &&
			this.drivePrivacy?.length
		) {
			const txData = await this.getDataForTxID(this.txId);
			const dataString = await Utf8ArrayToStr(txData);
			const dataJSON = await JSON.parse(dataString);

			// Get the drive name and root folder id
			this.name = dataJSON.name;
			this.rootFolderId = dataJSON.rootFolderId;
			if (!this.name || !this.rootFolderId) {
				throw new Error('Invalid drive state');
			}

			this.parseCustomMetaDataFromDataJson(dataJSON);

			return new ArFSPublicDrive(
				this.appName,
				this.appVersion,
				this.arFS,
				this.contentType,
				this.driveId,
				this.entityType,
				this.name,
				this.txId,
				this.unixTime,
				this.drivePrivacy,
				this.rootFolderId,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
		}

		throw new Error('Invalid drive state');
	}
}

export class ArFSPrivateDriveBuilder extends ArFSDriveBuilder<ArFSPrivateDrive> {
	drivePrivacy?: DrivePrivacy;
	rootFolderId?: FolderID;
	driveAuthMode?: DriveAuthMode;
	cipher?: string;
	cipherIV?: CipherIV;
	private readonly driveKey: DriveKey;

	constructor({ entityId: driveId, key: driveKey, owner, gatewayApi }: ArFSPrivateMetadataEntityBuilderParams) {
		super({ entityId: driveId, owner, gatewayApi });
		this.driveKey = driveKey;
	}

	getGqlQueryParameters(): GQLTagInterface[] {
		return [
			{ name: 'Drive-Id', value: `${this.entityId}` },
			{ name: 'Entity-Type', value: 'drive' },
			{ name: 'Drive-Privacy', value: 'private' }
		];
	}

	static fromArweaveNode(
		node: GQLNodeInterface,
		gatewayApi: GatewayAPI,
		driveKey: DriveKey
	): ArFSPrivateDriveBuilder {
		const { tags } = node;
		const driveId = tags.find((tag) => tag.name === 'Drive-Id')?.value;
		if (!driveId) {
			throw new Error('Drive-ID tag missing!');
		}
		const fileBuilder = new ArFSPrivateDriveBuilder({ entityId: EID(driveId), key: driveKey, gatewayApi });
		return fileBuilder;
	}

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node, owner);
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'Cipher':
					this.cipher = value;
					break;
				case 'Cipher-IV':
					this.cipherIV = value;
					break;
				case 'Drive-Auth-Mode':
					this.driveAuthMode = value as DriveAuthMode;
					break;
				case 'Drive-Privacy':
					this.drivePrivacy = value as DrivePrivacy;
					break;
				default:
					unparsedTags.push(tag);
					break;
			}
		});
		return unparsedTags;
	}

	protected async buildEntity(): Promise<ArFSPrivateDrive> {
		if (
			this.appName?.length &&
			this.appVersion?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.drivePrivacy?.length &&
			this.driveAuthMode?.length &&
			this.cipher?.length &&
			this.cipherIV?.length
		) {
			const txData = await this.getDataForTxID(this.txId);
			const dataBuffer = Buffer.from(txData);
			const decryptedDriveBuffer: Buffer = await driveDecrypt(this.cipherIV, this.driveKey, dataBuffer);
			const decryptedDriveString: string = await Utf8ArrayToStr(decryptedDriveBuffer);
			const decryptedDriveJSON: DriveMetaDataTransactionData = await JSON.parse(decryptedDriveString);

			this.name = decryptedDriveJSON.name;
			this.rootFolderId = EID(decryptedDriveJSON.rootFolderId);

			this.parseCustomMetaDataFromDataJson(decryptedDriveJSON);

			return new ArFSPrivateDrive(
				this.appName,
				this.appVersion,
				this.arFS,
				this.contentType,
				this.driveId,
				this.entityType,
				this.name,
				this.txId,
				this.unixTime,
				this.drivePrivacy,
				this.rootFolderId,
				this.driveAuthMode,
				this.cipher,
				this.cipherIV,
				this.driveKey,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
		}

		throw new Error('Invalid drive state');
	}
}

// A utility type to assist with fail-safe decryption of private entities
export class EncryptedEntityID extends EntityID {
	constructor() {
		super(`${fakeEntityId}`); // Unused after next line
		this.entityId = ENCRYPTED_DATA_PLACEHOLDER;
	}
}

export interface SafeArFSPrivateMetadataEntityBuilderParams extends ArFSMetadataEntityBuilderParams {
	privateKeyData: PrivateKeyData;
}

export class SafeArFSDriveBuilder extends ArFSDriveBuilder<ArFSDriveEntity> {
	drivePrivacy?: DrivePrivacy;
	rootFolderId?: FolderID;
	driveAuthMode?: DriveAuthMode;
	cipher?: string;
	cipherIV?: CipherIV;

	private readonly privateKeyData: PrivateKeyData;

	constructor({ entityId: driveId, privateKeyData, gatewayApi }: SafeArFSPrivateMetadataEntityBuilderParams) {
		super({ entityId: driveId, gatewayApi });
		this.privateKeyData = privateKeyData;
	}

	getGqlQueryParameters(): GQLTagInterface[] {
		return [
			{ name: 'Drive-Id', value: `${this.entityId}` },
			{ name: 'Entity-Type', value: 'drive' }
		];
	}

	static fromArweaveNode(
		node: GQLNodeInterface,
		gatewayApi: GatewayAPI,
		privateKeyData: PrivateKeyData
	): SafeArFSDriveBuilder {
		const { tags } = node;
		const driveId = tags.find((tag) => tag.name === 'Drive-Id')?.value;
		if (!driveId) {
			throw new Error('Drive-ID tag missing!');
		}
		const driveBuilder = new SafeArFSDriveBuilder({
			entityId: EID(driveId),
			// TODO: Make all private builders optionally take driveKey and fail gracefully, populating fields with 'ENCRYPTED'
			privateKeyData,
			gatewayApi
		});
		return driveBuilder;
	}

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node, owner);
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'Cipher':
					this.cipher = value;
					break;
				case 'Cipher-IV':
					this.cipherIV = value;
					break;
				case 'Drive-Auth-Mode':
					this.driveAuthMode = value as DriveAuthMode;
					break;
				case 'Drive-Privacy':
					this.drivePrivacy = value as DrivePrivacy;
					break;
				default:
					unparsedTags.push(tag);
					break;
			}
		});
		return unparsedTags;
	}

	protected async buildEntity(): Promise<ArFSDriveEntity> {
		if (
			this.appName?.length &&
			this.appVersion?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.drivePrivacy?.length
		) {
			const isPrivate = this.drivePrivacy === 'private';

			const txData = await this.getDataForTxID(this.txId);
			const dataBuffer = Buffer.from(txData);

			// Data JSON will be false when a private drive cannot be decrypted
			const dataJSON: DriveMetaDataTransactionData = await (async () => {
				if (isPrivate) {
					// Type-check private properties
					if (this.cipher?.length && this.driveAuthMode?.length && this.cipherIV?.length) {
						const placeholderDriveData = {
							name: ENCRYPTED_DATA_PLACEHOLDER,
							rootFolderId: ENCRYPTED_DATA_PLACEHOLDER
						};
						return this.privateKeyData.safelyDecryptToJson<DriveMetaDataTransactionData>(
							this.cipherIV,
							this.entityId,
							dataBuffer,
							placeholderDriveData
						);
					}
					throw new Error('Invalid private drive state');
				}
				// Drive is public, no decryption needed
				const dataString = await Utf8ArrayToStr(txData);
				return JSON.parse(dataString) as DriveMetaDataTransactionData;
			})();

			this.name = dataJSON.name;
			this.rootFolderId = EID(dataJSON.rootFolderId);

			this.parseCustomMetaDataFromDataJson(dataJSON);

			if (isPrivate) {
				if (!this.driveAuthMode || !this.cipher || !this.cipherIV) {
					throw new Error(`Unexpectedly null privacy data for private drive with ID ${this.driveId}!`);
				}

				// // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				// const driveKey = this.privateKeyData.driveKeyForDriveId(this.driveId);
				// if (driveKey) {
				// 	return new ArFSPrivateDrive(
				// 		this.appName,
				// 		this.appVersion,
				// 		this.arFS,
				// 		this.contentType,
				// 		this.driveId,
				// 		this.entityType,
				// 		this.name,
				// 		this.txId,
				// 		this.unixTime,
				// 		this.drivePrivacy,
				// 		this.rootFolderId,
				// 		this.driveAuthMode,
				// 		this.cipher,
				// 		this.cipherIV,
				// 		driveKey
				// 	);
				// }

				return new ArFSPrivateDriveKeyless(
					this.appName,
					this.appVersion,
					this.arFS,
					this.contentType,
					this.driveId,
					this.entityType,
					this.name,
					this.txId,
					this.unixTime,
					this.drivePrivacy,
					this.rootFolderId,
					this.driveAuthMode,
					this.cipher,
					this.cipherIV,
					this.boost,
					this.customMetaData.metaDataGqlTags,
					this.customMetaData.metaDataJson
				);
			}
			return new ArFSPublicDrive(
				this.appName,
				this.appVersion,
				this.arFS,
				this.contentType,
				this.driveId,
				this.entityType,
				this.name,
				this.txId,
				this.unixTime,
				this.drivePrivacy,
				this.rootFolderId,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
		}
		throw new Error('Invalid drive state');
	}
}
