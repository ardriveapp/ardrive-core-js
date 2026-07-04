import { ArFSFileOrFolderBuilder } from './arfs_builders';
import {
	ArweaveAddress,
	CipherIV,
	FolderID,
	EID,
	EntityID,
	GQLNodeInterface,
	GQLTagInterface,
	DriveKey
} from '../../types';
import { fileDecrypt } from '../../utils/crypto';
import { BufferToString } from '../../utils/common_browser';

import { ArFSPublicFolder, ArFSPrivateFolder } from '../arfs_entities';
import { fakeEntityId } from '../../utils/constants';
import { GatewayAPI } from '../../utils/gateway_api';

export const ROOT_FOLDER_ID_PLACEHOLDER = 'root folder';

// A utility type to provide a FolderID placeholder for root folders (which never have a parentFolderId)
export class RootFolderID extends EntityID {
	constructor() {
		super(`${fakeEntityId}`); // Unused after next line
		this.entityId = ROOT_FOLDER_ID_PLACEHOLDER;
	}
}

export abstract class ArFSFolderBuilder<T extends ArFSPublicFolder | ArFSPrivateFolder> extends ArFSFileOrFolderBuilder<
	'folder',
	T
> {
	isHidden?: boolean;

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const tags = await super.parseFromArweaveNode(node, owner);
		return tags.filter((tag) => tag.name !== 'Folder-Id');
	}

	getGqlQueryParameters(): GQLTagInterface[] {
		return [
			{ name: 'Folder-Id', value: `${this.entityId}` },
			{ name: 'Entity-Type', value: 'folder' }
		];
	}

	protected readonly protectedDataJsonKeys = ['name', 'isHidden'];
}

export class ArFSPublicFolderBuilder extends ArFSFolderBuilder<ArFSPublicFolder> {
	static fromArweaveNode(node: GQLNodeInterface, gatewayApi: GatewayAPI): ArFSPublicFolderBuilder {
		const { tags } = node;
		const folderId = tags.find((tag) => tag.name === 'Folder-Id')?.value;
		if (!folderId) {
			throw new Error('Folder-ID tag missing!');
		}
		const folderBuilder = new ArFSPublicFolderBuilder({ entityId: EID(folderId), gatewayApi });
		return folderBuilder;
	}

	protected async buildEntity(): Promise<ArFSPublicFolder> {
		if (!this.parentFolderId) {
			// Root folders do not have a Parent-Folder-Id tag
			this.parentFolderId = new RootFolderID();
		}

		if (
			this.appName?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.parentFolderId &&
			this.entityId &&
			this.entityType === 'folder'
		) {
			const txData = await this.getDataForTxID(this.txId);
			const dataString = BufferToString(txData);
			const dataJSON = await JSON.parse(dataString);

			// Get the folder name
			this.name = dataJSON.name;
			if (!this.name) {
				throw new Error('Invalid public folder state: name not found!');
			}
			this.isHidden = typeof dataJSON.isHidden === 'boolean' ? dataJSON.isHidden : undefined;
			this.parseCustomMetaDataFromDataJson(dataJSON);

			const publicFolder = new ArFSPublicFolder(
				this.appName,
				this.appVersion ?? '',
				this.arFS,
				this.contentType,
				this.driveId,
				this.name,
				this.txId,
				this.unixTime,
				this.parentFolderId,
				this.entityId,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
			publicFolder.isHidden = this.isHidden;
			return Promise.resolve(publicFolder);
		}
		throw new Error('Invalid public folder state');
	}
}

export class ArFSPrivateFolderBuilder extends ArFSFolderBuilder<ArFSPrivateFolder> {
	cipher?: string;
	cipherIV?: CipherIV;

	constructor(
		readonly folderId: FolderID,
		readonly gatewayApi: GatewayAPI,
		protected readonly driveKey: DriveKey,
		readonly owner?: ArweaveAddress
	) {
		super({ entityId: folderId, owner, gatewayApi });
	}

	static fromArweaveNode(
		node: GQLNodeInterface,
		gatewayApi: GatewayAPI,
		driveKey: DriveKey
	): ArFSPrivateFolderBuilder {
		const { tags } = node;
		const folderId = tags.find((tag) => tag.name === 'Folder-Id')?.value;
		if (!folderId) {
			throw new Error('Folder-ID tag missing!');
		}
		const folderBuilder = new ArFSPrivateFolderBuilder(EID(folderId), gatewayApi, driveKey);
		return folderBuilder;
	}

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node, owner);
		tags.forEach((tag: GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'Cipher-IV':
					this.cipherIV = value;
					break;
				case 'Cipher':
					this.cipher = value;
					break;
				default:
					unparsedTags.push(tag);
					break;
			}
		});
		return unparsedTags;
	}

	protected async buildEntity(): Promise<ArFSPrivateFolder> {
		if (!this.parentFolderId) {
			// Root folders do not have a Parent-Folder-Id tag
			this.parentFolderId = new RootFolderID();
		}

		if (
			this.appName?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.parentFolderId &&
			this.entityId &&
			this.cipher?.length &&
			this.cipherIV?.length &&
			this.entityType === 'folder'
		) {
			const txData = await this.getDataForTxID(this.txId);
			const dataBuffer = Buffer.from(txData);

			const decryptedFolderBuffer: Buffer = await fileDecrypt(this.cipherIV, this.driveKey, dataBuffer);
			const decryptedFolderString: string = BufferToString(decryptedFolderBuffer);
			const decryptedFolderJSON = await JSON.parse(decryptedFolderString);

			// Get the folder name
			this.name = decryptedFolderJSON.name;
			if (!this.name) {
				throw new Error('Invalid private folder state: name not found!');
			}
			this.isHidden =
				typeof decryptedFolderJSON.isHidden === 'boolean' ? decryptedFolderJSON.isHidden : undefined;

			this.parseCustomMetaDataFromDataJson(decryptedFolderJSON);

			const privateFolder = new ArFSPrivateFolder(
				this.appName,
				this.appVersion ?? '',
				this.arFS,
				this.contentType,
				this.driveId,
				this.name,
				this.txId,
				this.unixTime,
				this.parentFolderId,
				this.entityId,
				this.cipher,
				this.cipherIV,
				this.driveKey,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
			privateFolder.isHidden = this.isHidden;
			return privateFolder;
		}
		throw new Error('Invalid private folder state');
	}
}
