import {
	ArFSDriveTransactionData,
	ArFSFileDataTransactionData,
	ArFSFileMetadataTransactionData,
	ArFSFolderTransactionData,
	ArFSObjectTransactionData,
	ArFSPrivateDriveTransactionData,
	ArFSPrivateFileDataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPublicFileDataTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderTransactionData
} from './arfs_tx_data_types';
import {
	DataContentType,
	DriveID,
	FileID,
	FolderID,
	JSON_CONTENT_TYPE,
	PRIVATE_CONTENT_TYPE,
	UnixTime,
	ContentType,
	DrivePrivacy,
	GQLTagInterface,
	EntityType,
	TransactionID,
	CustomMetaDataGqlTags
} from '../../types';
import { ArFSDataToUpload } from '../arfs_file_wrapper';
import { WithDriveKey } from '../arfs_entity_result_factory';

export abstract class ArFSObjectMetadataPrototype {
	public abstract readonly objectData: ArFSObjectTransactionData;

	protected abstract readonly protectedTags: GQLTagInterface[];

	constructor(protected readonly customMetaDataTags: CustomMetaDataGqlTags) {}

	public get gqlTags(): GQLTagInterface[] {
		const tags = this.parseCustomGqlTags(this.customMetaDataTags);

		for (const tag of this.protectedTags) {
			tags.push(tag);
		}

		return tags;
	}

	private parseCustomGqlTags(customMetaDataGqlTagInterface: CustomMetaDataGqlTags): GQLTagInterface[] {
		const tagsAsArray = Object.entries(customMetaDataGqlTagInterface);

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

		this.assertProtectedTags(tags);
		return tags;
	}

	// Implementation should throw if any protected tags are identified
	public assertProtectedTags(tags: GQLTagInterface[]): void {
		const protectedTags = this.protectedTags.map((t) => t.name);

		tags.forEach((tag) => {
			if (protectedTags.includes(tag.name)) {
				throw new Error(`Tag ${tag.name} is protected and cannot be used in this context!`);
			}
		});
	}
}

export abstract class ArFSEntityMetaDataPrototype extends ArFSObjectMetadataPrototype {
	readonly unixTime: UnixTime;
	abstract readonly contentType: ContentType;
	abstract readonly entityType: EntityType;
	abstract readonly driveId: DriveID;

	constructor(protected readonly customMetaDataTags: CustomMetaDataGqlTags) {
		super(customMetaDataTags);

		// Get the current time so the app can display the "created" data later on
		// Unix-Time tag expects "seconds since unix epoch" per ArFS spec
		this.unixTime = new UnixTime(Math.floor(Date.now() / 1000));
	}

	protected get protectedTags(): GQLTagInterface[] {
		return [
			{ name: 'Content-Type', value: this.contentType },
			{ name: 'Entity-Type', value: this.entityType },
			{ name: 'Unix-Time', value: `${this.unixTime}` },
			{ name: 'Drive-Id', value: `${this.driveId}` }
		];
	}
}

export abstract class ArFSDriveMetaDataPrototype extends ArFSEntityMetaDataPrototype {
	abstract driveId: DriveID;
	abstract objectData: ArFSDriveTransactionData;
	abstract readonly privacy: DrivePrivacy;
	readonly entityType: EntityType = 'drive';

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		tags.push({ name: 'Drive-Privacy', value: this.privacy });

		return tags;
	}
}

export class ArFSPublicDriveMetaDataPrototype extends ArFSDriveMetaDataPrototype {
	readonly privacy: DrivePrivacy = 'public';
	readonly contentType: ContentType = JSON_CONTENT_TYPE;

	constructor(
		readonly objectData: ArFSPublicDriveTransactionData,
		readonly driveId: DriveID,
		public readonly customMetaDataTags = {}
	) {
		super(customMetaDataTags);
	}
}

export class ArFSPrivateDriveMetaDataPrototype extends ArFSDriveMetaDataPrototype {
	readonly privacy: DrivePrivacy = 'private';
	readonly contentType: ContentType = PRIVATE_CONTENT_TYPE;

	constructor(
		readonly driveId: DriveID,
		readonly objectData: ArFSPrivateDriveTransactionData,
		public readonly customMetaDataTags = {}
	) {
		super(customMetaDataTags);
	}

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		for (const tag of [
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV },
			{ name: 'Drive-Auth-Mode', value: this.objectData.driveAuthMode },
			{ name: 'Signature-Type', value: this.objectData.driveSignatureType.toString() }
		]) {
			tags.push(tag);
		}

		return tags;
	}
}

export abstract class ArFSFolderMetaDataPrototype extends ArFSEntityMetaDataPrototype {
	abstract driveId: DriveID;
	abstract folderId: FolderID;
	abstract objectData: ArFSFolderTransactionData;
	abstract parentFolderId?: FolderID;
	abstract readonly contentType: ContentType;
	readonly entityType: EntityType = 'folder';

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		tags.push({ name: 'Folder-Id', value: `${this.folderId}` });

		if (this.parentFolderId) {
			// Root folder transactions do not have Parent-Folder-Id
			tags.push({ name: 'Parent-Folder-Id', value: `${this.parentFolderId}` });
		}

		return tags;
	}
}

export class ArFSPublicFolderMetaDataPrototype extends ArFSFolderMetaDataPrototype {
	readonly contentType: ContentType = JSON_CONTENT_TYPE;

	constructor(
		readonly objectData: ArFSPublicFolderTransactionData,
		readonly driveId: DriveID,
		readonly folderId: FolderID,
		readonly parentFolderId?: FolderID,
		public readonly customMetaDataTags: CustomMetaDataGqlTags = {}
	) {
		super(customMetaDataTags);
	}
}

export class ArFSPrivateFolderMetaDataPrototype extends ArFSFolderMetaDataPrototype {
	readonly privacy: DrivePrivacy = 'private';
	readonly contentType: ContentType = PRIVATE_CONTENT_TYPE;

	constructor(
		readonly driveId: DriveID,
		readonly folderId: FolderID,
		readonly objectData: ArFSPrivateFolderTransactionData,
		readonly parentFolderId?: FolderID,
		public readonly customMetaDataTags: CustomMetaDataGqlTags = {}
	) {
		super(customMetaDataTags);
	}

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		for (const tag of [
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV }
		]) {
			tags.push(tag);
		}

		return tags;
	}
}

export abstract class ArFSFileMetaDataPrototype extends ArFSEntityMetaDataPrototype {
	abstract driveId: DriveID;
	abstract fileId: FileID;
	abstract objectData: ArFSFileMetadataTransactionData;
	abstract parentFolderId: FolderID;
	abstract contentType: ContentType;
	readonly entityType: EntityType = 'file';

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		for (const tag of [
			{ name: 'File-Id', value: `${this.fileId}` },
			{ name: 'Parent-Folder-Id', value: `${this.parentFolderId}` }
		]) {
			tags.push(tag);
		}

		return tags;
	}
}

export interface ArFSPublicFileMetaDataPrototypeFromFileParams {
	wrappedFile: ArFSDataToUpload;
	dataTxId: TransactionID;
	driveId: DriveID;
	fileId: FileID;
	parentFolderId: FolderID;
}

export class ArFSPublicFileMetaDataPrototype extends ArFSFileMetaDataPrototype {
	readonly contentType: ContentType = JSON_CONTENT_TYPE;

	constructor(
		readonly objectData: ArFSPublicFileMetadataTransactionData,
		readonly driveId: DriveID,
		readonly fileId: FileID,
		readonly parentFolderId: FolderID,
		readonly customMetaDataTags: CustomMetaDataGqlTags = {}
	) {
		super(customMetaDataTags);
	}

	public static fromFile({
		wrappedFile,
		dataTxId,
		parentFolderId,
		fileId,
		driveId
	}: ArFSPublicFileMetaDataPrototypeFromFileParams): ArFSPublicFileMetaDataPrototype {
		const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();
		return new ArFSPublicFileMetaDataPrototype(
			new ArFSPublicFileMetadataTransactionData(
				wrappedFile.destinationBaseName,
				fileSize,
				lastModifiedDateMS,
				dataTxId,
				dataContentType,
				wrappedFile.customMetaData?.metaDataJson
			),
			driveId,
			fileId,
			parentFolderId,
			wrappedFile.customMetaData?.metaDataGqlTags
		);
	}
}

export type ArFSPrivateFileMetaDataPrototypeFromFileParams = ArFSPublicFileMetaDataPrototypeFromFileParams &
	WithDriveKey;

export class ArFSPrivateFileMetaDataPrototype extends ArFSFileMetaDataPrototype {
	readonly contentType: ContentType = PRIVATE_CONTENT_TYPE;

	constructor(
		readonly objectData: ArFSPrivateFileMetadataTransactionData,
		readonly driveId: DriveID,
		readonly fileId: FileID,
		readonly parentFolderId: FolderID,
		readonly customMetaDataTags: CustomMetaDataGqlTags = {}
	) {
		super(customMetaDataTags);
	}

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		for (const tag of [
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV }
		]) {
			tags.push(tag);
		}

		return tags;
	}

	public static async fromFile({
		wrappedFile,
		dataTxId,
		parentFolderId,
		fileId,
		driveId,
		driveKey
	}: ArFSPrivateFileMetaDataPrototypeFromFileParams): Promise<ArFSPrivateFileMetaDataPrototype> {
		const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

		return new ArFSPrivateFileMetaDataPrototype(
			await ArFSPrivateFileMetadataTransactionData.from(
				wrappedFile.destinationBaseName,
				fileSize,
				lastModifiedDateMS,
				dataTxId,
				dataContentType,
				fileId,
				driveKey,
				wrappedFile.customMetaData?.metaDataJson
			),
			driveId,
			fileId,
			parentFolderId,
			wrappedFile.customMetaData?.metaDataGqlTags
		);
	}
}

export abstract class ArFSFileDataPrototype extends ArFSObjectMetadataPrototype {
	abstract readonly objectData: ArFSFileDataTransactionData;
	abstract readonly contentType: DataContentType | typeof PRIVATE_CONTENT_TYPE;

	protected get protectedTags(): GQLTagInterface[] {
		return [{ name: 'Content-Type', value: this.contentType }];
	}
}

export class ArFSPublicFileDataPrototype extends ArFSFileDataPrototype {
	constructor(
		readonly objectData: ArFSPublicFileDataTransactionData,
		readonly contentType: DataContentType,
		public readonly customMetaDataTags: CustomMetaDataGqlTags = {}
	) {
		super(customMetaDataTags);
	}
}

export class ArFSPrivateFileDataPrototype extends ArFSFileDataPrototype {
	readonly contentType = PRIVATE_CONTENT_TYPE;

	constructor(
		readonly objectData: ArFSPrivateFileDataTransactionData,
		public readonly customMetaDataTags: CustomMetaDataGqlTags = {}
	) {
		super(customMetaDataTags);
	}

	protected get protectedTags(): GQLTagInterface[] {
		const tags = super.protectedTags;

		for (const tag of [
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV }
		]) {
			tags.push(tag);
		}

		return tags;
	}
}
