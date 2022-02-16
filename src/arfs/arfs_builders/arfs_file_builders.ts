import Arweave from 'arweave';
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
	ContentType,
	GQLNodeInterface,
	GQLTagInterface
} from '../../types';
import { Utf8ArrayToStr, extToMime } from '../../utils/common';
import { ArFSPublicFile, ArFSPrivateFile } from '../arfs_entities';
import { ArFSFileOrFolderBuilder } from './arfs_builders';

interface FileMetaDataTransactionData {
	// FIXME: do we need our safe types here? This interface refers to a JSON with primitive types
	name: string;
	size: number;
	lastModifiedDate: number;
	dataTxId: string;
	dataContentType: ContentType;
}
export abstract class ArFSFileBuilder<T extends ArFSPublicFile | ArFSPrivateFile> extends ArFSFileOrFolderBuilder<T> {
	size?: ByteCount;
	lastModifiedDate?: UnixTime;
	dataTxId?: TransactionID;
	dataContentType?: ContentType;

	getGqlQueryParameters(): GQLTagInterface[] {
		return [
			{ name: 'File-Id', value: `${this.entityId}` },
			{ name: 'Entity-Type', value: 'file' }
		];
	}
}

export class ArFSPublicFileBuilder extends ArFSFileBuilder<ArFSPublicFile> {
	static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave): ArFSPublicFileBuilder {
		const { tags } = node;
		const fileId = tags.find((tag) => tag.name === 'File-Id')?.value;
		if (!fileId) {
			throw new Error('File-ID tag missing!');
		}
		const fileBuilder = new ArFSPublicFileBuilder({ entityId: EID(fileId), arweave });
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

			return Promise.resolve(
				new ArFSPublicFile(
					this.appName,
					this.appVersion,
					this.arFS,
					this.contentType,
					this.driveId,
					this.entityType,
					this.name,
					this.txId,
					this.unixTime,
					this.parentFolderId,
					this.entityId,
					this.size,
					this.lastModifiedDate,
					this.dataTxId,
					this.dataContentType
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
		readonly arweave: Arweave,
		private readonly driveKey: DriveKey,
		readonly owner?: ArweaveAddress,
		readonly fileKey?: FileKey
	) {
		super({ entityId: fileId, arweave, owner });
	}

	static fromArweaveNode(node: GQLNodeInterface, arweave: Arweave, driveKey: DriveKey): ArFSPrivateFileBuilder {
		const { tags } = node;
		const fileId = tags.find((tag) => tag.name === 'File-Id')?.value;
		if (!fileId) {
			throw new Error('File-ID tag missing!');
		}
		const fileBuilder = new ArFSPrivateFileBuilder(EID(fileId), arweave, driveKey);
		return fileBuilder;
	}

	protected async parseFromArweaveNode(node?: GQLNodeInterface): Promise<GQLTagInterface[]> {
		const unparsedTags: GQLTagInterface[] = [];
		const tags = await super.parseFromArweaveNode(node);
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

			return new ArFSPrivateFile(
				this.appName,
				this.appVersion,
				this.arFS,
				this.contentType,
				this.driveId,
				this.entityType,
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
				this.driveKey
			);
		}
		throw new Error('Invalid file state');
	}
}
