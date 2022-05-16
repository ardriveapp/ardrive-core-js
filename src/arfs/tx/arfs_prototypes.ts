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
	TransactionID
} from '../../types';
import { ArFSDataToUpload } from '../arfs_file_wrapper';

export abstract class ArFSObjectMetadataPrototype {
	abstract gqlTags: GQLTagInterface[];
	abstract objectData: ArFSObjectTransactionData;

	// Implementation should throw if any protected tags are identified
	assertProtectedTags(tags: GQLTagInterface[]): void {
		const protectedTags = this.gqlTags.map((t) => t.name);

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

	constructor() {
		super();

		// Get the current time so the app can display the "created" data later on
		this.unixTime = new UnixTime(Math.round(Date.now() / 1000));
	}

	public get gqlTags(): GQLTagInterface[] {
		return [
			{ name: 'Content-Type', value: this.contentType },
			{ name: 'Entity-Type', value: this.entityType },
			{ name: 'Unix-Time', value: this.unixTime.toString() },
			{ name: 'Drive-Id', value: `${this.driveId}` }
		];
	}
}

export abstract class ArFSDriveMetaDataPrototype extends ArFSEntityMetaDataPrototype {
	abstract driveId: DriveID;
	abstract objectData: ArFSDriveTransactionData;
	abstract readonly privacy: DrivePrivacy;
	readonly entityType: EntityType = 'drive';

	public get gqlTags(): GQLTagInterface[] {
		return [...super.gqlTags, { name: 'Drive-Privacy', value: this.privacy }];
	}
}

export class ArFSPublicDriveMetaDataPrototype extends ArFSDriveMetaDataPrototype {
	readonly privacy: DrivePrivacy = 'public';
	readonly contentType: ContentType = JSON_CONTENT_TYPE;

	constructor(readonly objectData: ArFSPublicDriveTransactionData, readonly driveId: DriveID) {
		super();
	}
}

export class ArFSPrivateDriveMetaDataPrototype extends ArFSDriveMetaDataPrototype {
	readonly privacy: DrivePrivacy = 'private';
	readonly contentType: ContentType = PRIVATE_CONTENT_TYPE;

	constructor(readonly driveId: DriveID, readonly objectData: ArFSPrivateDriveTransactionData) {
		super();
	}

	public get gqlTags(): GQLTagInterface[] {
		return [
			...super.gqlTags,
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV },
			{ name: 'Drive-Auth-Mode', value: this.objectData.driveAuthMode }
		];
	}
}

export abstract class ArFSFolderMetaDataPrototype extends ArFSEntityMetaDataPrototype {
	abstract driveId: DriveID;
	abstract folderId: FolderID;
	abstract objectData: ArFSFolderTransactionData;
	abstract parentFolderId?: FolderID;
	abstract readonly contentType: ContentType;
	readonly entityType: EntityType = 'folder';

	public get gqlTags(): GQLTagInterface[] {
		const tags = [...super.gqlTags, { name: 'Folder-Id', value: `${this.folderId}` }];

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
		readonly parentFolderId?: FolderID
	) {
		super();
	}
}

export class ArFSPrivateFolderMetaDataPrototype extends ArFSFolderMetaDataPrototype {
	readonly privacy: DrivePrivacy = 'private';
	readonly contentType: ContentType = PRIVATE_CONTENT_TYPE;

	constructor(
		readonly driveId: DriveID,
		readonly folderId: FolderID,
		readonly objectData: ArFSPrivateFolderTransactionData,
		readonly parentFolderId?: FolderID
	) {
		super();
	}

	get gqlTags(): GQLTagInterface[] {
		return [
			...super.gqlTags,
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV }
		];
	}
}

export abstract class ArFSFileMetaDataPrototype extends ArFSEntityMetaDataPrototype {
	abstract driveId: DriveID;
	abstract fileId: FileID;
	abstract objectData: ArFSFileMetadataTransactionData;
	abstract parentFolderId: FolderID;
	abstract contentType: ContentType;
	readonly entityType: EntityType = 'file';

	public get gqlTags(): GQLTagInterface[] {
		return [
			...super.gqlTags,
			{ name: 'File-Id', value: `${this.fileId}` },
			{ name: 'Parent-Folder-Id', value: `${this.parentFolderId}` }
		];
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
		readonly parentFolderId: FolderID
	) {
		super();
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
				dataContentType
			),
			driveId,
			fileId,
			parentFolderId
		);
	}
}

export class ArFSPrivateFileMetaDataPrototype extends ArFSFileMetaDataPrototype {
	readonly contentType: ContentType = PRIVATE_CONTENT_TYPE;

	constructor(
		readonly objectData: ArFSPrivateFileMetadataTransactionData,
		readonly driveId: DriveID,
		readonly fileId: FileID,
		readonly parentFolderId: FolderID
	) {
		super();
	}

	get gqlTags(): GQLTagInterface[] {
		return [
			...super.gqlTags,
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV }
		];
	}
}

export abstract class ArFSFileDataPrototype extends ArFSObjectMetadataPrototype {
	abstract readonly objectData: ArFSFileDataTransactionData;
	abstract readonly contentType: DataContentType | typeof PRIVATE_CONTENT_TYPE;

	get gqlTags(): GQLTagInterface[] {
		return [{ name: 'Content-Type', value: this.contentType }];
	}
}

export class ArFSPublicFileDataPrototype extends ArFSFileDataPrototype {
	constructor(readonly objectData: ArFSPublicFileDataTransactionData, readonly contentType: DataContentType) {
		super();
	}
}

export class ArFSPrivateFileDataPrototype extends ArFSFileDataPrototype {
	readonly contentType = PRIVATE_CONTENT_TYPE;
	constructor(readonly objectData: ArFSPrivateFileDataTransactionData) {
		super();
	}

	get gqlTags(): GQLTagInterface[] {
		return [
			...super.gqlTags,
			{ name: 'Cipher', value: this.objectData.cipher },
			{ name: 'Cipher-IV', value: this.objectData.cipherIV }
		];
	}
}
