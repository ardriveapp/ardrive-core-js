import { deriveFileKey, fileDecrypt } from '../../utils/crypto';
import {
	ArweaveAddress,
	CipherIV,
	DriveKey,
	FileID,
	FileKey,
	ByteCount,
	TransactionID,
	UnixTime,
	EID,
	GQLNodeInterface,
	GQLTagInterface,
	EntityMetaDataTransactionData,
	DataContentType
} from '../../types';
import { Utf8ArrayToStr, extToMime } from '../../utils/common';
import { ArFSPublicFile, ArFSPrivateFile } from '../arfs_entities';
import { ArFSFileOrFolderBuilder } from './arfs_builders';
import { GatewayAPI } from '../../utils/gateway_api';

export interface FileMetaDataTransactionData extends EntityMetaDataTransactionData {
	// FIXME: do we need our safe types here? This interface refers to a JSON with primitive types
	name: string;
	size: number;
	lastModifiedDate: number;
	dataTxId: string;
	dataContentType: DataContentType;
}
export abstract class ArFSFileBuilder<T extends ArFSPublicFile | ArFSPrivateFile> extends ArFSFileOrFolderBuilder<
	'file',
	T
> {
	size?: ByteCount;
	lastModifiedDate?: UnixTime;
	dataTxId?: TransactionID;
	dataContentType?: DataContentType;

	getGqlQueryParameters(): GQLTagInterface[] {
		return [
			{ name: 'File-Id', value: `${this.entityId}` },
			{ name: 'Entity-Type', value: 'file' }
		];
	}

	protected async parseFromArweaveNode(node?: GQLNodeInterface, owner?: ArweaveAddress): Promise<GQLTagInterface[]> {
		const tags = await super.parseFromArweaveNode(node, owner);
		return tags.filter((tag) => tag.name !== 'File-Id');
	}

	protected readonly protectedDataJsonKeys = ['name', 'size', 'lastModifiedDate', 'dataTxId', 'dataContentType'];
}

export class ArFSPublicFileBuilder extends ArFSFileBuilder<ArFSPublicFile> {
	static fromArweaveNode(node: GQLNodeInterface, gatewayApi: GatewayAPI): ArFSPublicFileBuilder {
		const { tags } = node;
		const fileId = tags.find((tag) => tag.name === 'File-Id')?.value;
		if (!fileId) {
			throw new Error('File-ID tag missing!');
		}
		const fileBuilder = new ArFSPublicFileBuilder({ entityId: EID(fileId), gatewayApi });
		return fileBuilder;
	}

	protected async buildEntity(): Promise<ArFSPublicFile> {
		if (
			this.appName?.length &&
			this.appVersion?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.parentFolderId &&
			this.entityId
		) {
			const txData = await this.getDataForTxID(this.txId);
			const dataString = await Utf8ArrayToStr(txData);
			const dataJSON: FileMetaDataTransactionData = await JSON.parse(dataString);

			// Get fields from data JSON
			this.name = dataJSON.name;
			this.size = new ByteCount(dataJSON.size);
			this.lastModifiedDate = new UnixTime(dataJSON.lastModifiedDate);
			this.dataTxId = new TransactionID(dataJSON.dataTxId);
			this.dataContentType = dataJSON.dataContentType ?? extToMime(this.name);

			if (
				!this.name ||
				this.size === undefined ||
				!this.lastModifiedDate ||
				!this.dataTxId ||
				!this.dataContentType ||
				!(this.entityType === 'file')
			) {
				throw new Error('Invalid file state');
			}
			this.parseCustomMetaDataFromDataJson(dataJSON);

			return Promise.resolve(
				new ArFSPublicFile(
					this.appName,
					this.appVersion,
					this.arFS,
					this.contentType,
					this.driveId,
					this.name,
					this.txId,
					this.unixTime,
					this.parentFolderId,
					this.entityId,
					this.size,
					this.lastModifiedDate,
					this.dataTxId,
					this.dataContentType,
					this.boost,
					this.customMetaData.metaDataGqlTags,
					this.customMetaData.metaDataJson
				)
			);
		}
		throw new Error('Invalid file state');
	}
}

export class ArFSPrivateFileBuilder extends ArFSFileBuilder<ArFSPrivateFile> {
	cipher?: string;
	cipherIV?: CipherIV;

	constructor(
		readonly fileId: FileID,
		gatewayApi: GatewayAPI,
		private readonly driveKey: DriveKey,
		readonly owner?: ArweaveAddress,
		readonly fileKey?: FileKey
	) {
		super({ entityId: fileId, owner, gatewayApi });
	}

	static fromArweaveNode(node: GQLNodeInterface, gatewayApi: GatewayAPI, driveKey: DriveKey): ArFSPrivateFileBuilder {
		const { tags } = node;
		const fileId = tags.find((tag) => tag.name === 'File-Id')?.value;
		if (!fileId) {
			throw new Error('File-ID tag missing!');
		}
		const fileBuilder = new ArFSPrivateFileBuilder(EID(fileId), gatewayApi, driveKey);
		return fileBuilder;
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

	protected async buildEntity(): Promise<ArFSPrivateFile> {
		if (
			this.appName?.length &&
			this.appVersion?.length &&
			this.arFS?.length &&
			this.contentType?.length &&
			this.driveId &&
			this.entityType?.length &&
			this.txId &&
			this.unixTime &&
			this.parentFolderId &&
			this.entityId &&
			this.cipher?.length &&
			this.cipherIV?.length
		) {
			const txData = await this.getDataForTxID(this.txId);
			const dataBuffer = Buffer.from(txData);
			const fileKey = this.fileKey ?? (await deriveFileKey(`${this.fileId}`, this.driveKey));

			const decryptedFileBuffer: Buffer = await fileDecrypt(this.cipherIV, fileKey, dataBuffer);
			const decryptedFileString: string = await Utf8ArrayToStr(decryptedFileBuffer);
			const decryptedFileJSON: FileMetaDataTransactionData = await JSON.parse(decryptedFileString);

			// Get fields from data JSON
			this.name = decryptedFileJSON.name;
			this.size = new ByteCount(decryptedFileJSON.size);
			this.lastModifiedDate = new UnixTime(decryptedFileJSON.lastModifiedDate);
			this.dataTxId = new TransactionID(decryptedFileJSON.dataTxId);
			this.dataContentType = decryptedFileJSON.dataContentType ?? extToMime(this.name);

			if (
				!this.name ||
				this.size === undefined ||
				!this.lastModifiedDate ||
				!this.dataTxId ||
				!this.dataContentType ||
				!fileKey ||
				!(this.entityType === 'file')
			) {
				throw new Error('Invalid file state');
			}

			this.parseCustomMetaDataFromDataJson(decryptedFileJSON);

			return new ArFSPrivateFile(
				this.appName,
				this.appVersion,
				this.arFS,
				this.contentType,
				this.driveId,
				this.name,
				this.txId,
				this.unixTime,
				this.parentFolderId,
				this.entityId,
				this.size,
				this.lastModifiedDate,
				this.dataTxId,
				this.dataContentType,
				this.cipher,
				this.cipherIV,
				fileKey,
				this.driveKey,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
		}
		throw new Error('Invalid file state');
	}
}
