import { deriveFileKey, fileDecrypt } from '../../utils/crypto';
import {
	ArweaveAddress,
	CipherIV,
	FileID,
	FileKey,
	ByteCount,
	TransactionID,
	UnixTime,
	EID,
	GQLNodeInterface,
	GQLTagInterface,
	EntityMetaDataTransactionData,
	DataContentType,
	DriveKey
} from '../../types';
import { BufferToString, extToMime } from '../../utils/common_browser';
import { ArFSPublicFile, ArFSPrivateFile } from '../arfs_entities';
import { ArFSFileOrFolderBuilder } from './arfs_builders';
import { GatewayAPI } from '../../utils/gateway_api';
import { FileBuilderValidation, InvalidFileStateException } from '../../types/exceptions';
export interface FileMetaDataTransactionData extends EntityMetaDataTransactionData {
	// FIXME: do we need our safe types here? This interface refers to a JSON with primitive types
	name: string;
	size: number;
	lastModifiedDate: number;
	dataTxId: string;
	dataContentType: DataContentType;
	// NOTE: `isHidden` is intentionally not declared here — this interface extends the
	// Record<string, JsonSerializable> index type, which an optional `boolean | undefined`
	// property cannot satisfy. It is read (and narrowed) directly in buildEntity below.
}
export abstract class ArFSFileBuilder<T extends ArFSPublicFile | ArFSPrivateFile> extends ArFSFileOrFolderBuilder<
	'file',
	T
> {
	size?: ByteCount;
	lastModifiedDate?: UnixTime;
	dataTxId?: TransactionID;
	dataContentType?: DataContentType;
	isHidden?: boolean;

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

	protected readonly protectedDataJsonKeys = [
		'name',
		'size',
		'lastModifiedDate',
		'dataTxId',
		'dataContentType',
		'isHidden'
	];

	// CORE-6: Enumerates which required top-level (pre-decryption) properties are absent, so
	// buildEntity() can throw a descriptive InvalidFileStateException that the file-listing
	// paths tolerate/skip instead of aborting the whole drive. Mirrors the buildEntity() guard.
	protected getMissingRequiredProperties(): string[] {
		const missingProperties: string[] = [];
		if (!this.appName?.length) missingProperties.push('appName');
		if (!this.arFS?.length) missingProperties.push('arFS');
		if (!this.contentType?.length) missingProperties.push('contentType');
		if (!this.driveId) missingProperties.push('driveId');
		if (!this.entityType?.length) missingProperties.push('entityType');
		if (!this.txId) missingProperties.push('txId');
		if (!this.unixTime) missingProperties.push('unixTime');
		if (!this.parentFolderId) missingProperties.push('parentFolderId');
		if (!this.entityId) missingProperties.push('entityId');
		return missingProperties;
	}
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
			const dataString = BufferToString(txData);
			const dataJSON: FileMetaDataTransactionData = await JSON.parse(dataString);

			// Get fields from data JSON
			this.name = dataJSON.name;
			this.size = new ByteCount(dataJSON.size);
			this.lastModifiedDate = new UnixTime(dataJSON.lastModifiedDate);
			this.dataTxId = new TransactionID(dataJSON.dataTxId);
			this.dataContentType = dataJSON.dataContentType || extToMime(this.name);
			this.isHidden = typeof dataJSON.isHidden === 'boolean' ? dataJSON.isHidden : undefined;

			const fileBuilderValidation = new FileBuilderValidation();
			fileBuilderValidation.validateFileProperties(this);
			fileBuilderValidation.throwIfMissingProperties();

			this.parseCustomMetaDataFromDataJson(dataJSON);

			const publicFile = new ArFSPublicFile(
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
				this.size,
				this.lastModifiedDate,
				this.dataTxId,
				this.dataContentType,
				this.boost,
				this.customMetaData.metaDataGqlTags,
				this.customMetaData.metaDataJson
			);
			publicFile.isHidden = this.isHidden;
			return Promise.resolve(publicFile);
		}
		// CORE-6: A file entity that is missing a required top-level property (a genuinely
		// incomplete/legacy metadata tx) previously threw a plain Error('Invalid file state').
		// That plain Error is not caught by the file-listing paths, so a single incomplete
		// entity aborted the entire drive reconstruction. Throw the semantically-correct
		// InvalidFileStateException instead — the listing paths already skip it (see
		// getPublicFilesWithParentFolderIds / getPrivateFilesWithParentFolderIds) — and name
		// exactly which properties are missing.
		throw new InvalidFileStateException(this.getMissingRequiredProperties());
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

			if (!fileKey) {
				throw new InvalidFileStateException(['fileKey']);
			}

			const decryptedFileBuffer: Buffer = await fileDecrypt(this.cipherIV, fileKey, dataBuffer);
			const decryptedFileString: string = BufferToString(decryptedFileBuffer);
			const decryptedFileJSON: FileMetaDataTransactionData = await JSON.parse(decryptedFileString);

			// Get fields from data JSON
			this.name = decryptedFileJSON.name;
			this.size = new ByteCount(decryptedFileJSON.size);
			this.lastModifiedDate = new UnixTime(decryptedFileJSON.lastModifiedDate);
			this.dataTxId = new TransactionID(decryptedFileJSON.dataTxId);
			this.dataContentType = decryptedFileJSON.dataContentType || extToMime(this.name);
			this.isHidden = typeof decryptedFileJSON.isHidden === 'boolean' ? decryptedFileJSON.isHidden : undefined;

			const fileBuilderValidation = new FileBuilderValidation();
			fileBuilderValidation.validateFileProperties(this);
			fileBuilderValidation.throwIfMissingProperties();

			this.parseCustomMetaDataFromDataJson(decryptedFileJSON);

			const privateFile = new ArFSPrivateFile(
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
			privateFile.isHidden = this.isHidden;
			return privateFile;
		}
		// CORE-6: A private file missing a required top-level property (observed live: legacy
		// entities with no `Cipher` tag) previously threw a plain Error('Invalid file state'),
		// which the private file-listing path does not catch, aborting the entire private-drive
		// listing. Throw the semantically-correct InvalidFileStateException instead — which
		// getPrivateFilesWithParentFolderIds already skips — naming the missing properties
		// (e.g. `cipher`). This runs BEFORE any decryption, so it does not mask a decryption
		// failure (those surface as a SyntaxError from the fileDecrypt "Error" sentinel).
		throw new InvalidFileStateException(this.getMissingRequiredProperties());
	}

	// CORE-6: private files additionally require the Cipher / Cipher-IV tags.
	protected getMissingRequiredProperties(): string[] {
		const missingProperties = super.getMissingRequiredProperties();
		if (!this.cipher?.length) missingProperties.push('cipher');
		if (!this.cipherIV?.length) missingProperties.push('cipherIV');
		return missingProperties;
	}
}
