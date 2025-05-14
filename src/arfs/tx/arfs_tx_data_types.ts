import { driveEncrypt, fileEncrypt, deriveFileKey } from '../../utils/crypto';
import {
	CipherIV,
	DataContentType,
	FileID,
	FileKey,
	FolderID,
	ByteCount,
	TransactionID,
	UnixTime,
	ArFSEncryptedData,
	CipherType,
	DriveAuthMode,
	EntityMetaDataTransactionData,
	CustomMetaDataJsonFields,
	assertCustomMetaDataJsonFields,
	DriveKey,
	DriveSignatureType
} from '../../types';
import { DriveMetaDataTransactionData } from '../arfs_builders/arfs_drive_builders';
import { FileMetaDataTransactionData } from '../arfs_builders/arfs_file_builders';

/** Base class of an ArFS MetaData Tx's Data JSON */
export abstract class ArFSObjectTransactionData {
	public abstract asTransactionData(): string | Buffer;

	public sizeOf(): ByteCount {
		return new ByteCount(this.asTransactionData().length);
	}

	protected static parseCustomDataJsonFields(
		baseDataJson: EntityMetaDataTransactionData,
		dataJsonCustomMetaData: CustomMetaDataJsonFields
	): EntityMetaDataTransactionData {
		assertCustomMetaDataJsonFields(dataJsonCustomMetaData);
		const fullDataJson = Object.assign({}, baseDataJson);

		for (const [name, jsonSerializable] of Object.entries(dataJsonCustomMetaData)) {
			this.assertProtectedDataJsonField(name);

			const prevValue = fullDataJson[name];
			let newValue = jsonSerializable;

			if (prevValue !== undefined) {
				if (Array.isArray(prevValue)) {
					newValue = [...prevValue, jsonSerializable];
				} else {
					newValue = [prevValue, jsonSerializable];
				}
			}

			Object.assign(fullDataJson, { [name]: newValue });
		}

		return fullDataJson;
	}

	protected static assertProtectedDataJsonField(tagName: string): void {
		if (this.protectedDataJsonFields.includes(tagName)) {
			throw Error(`Provided data JSON custom metadata conflicts with an ArFS protected field name: ${tagName}`);
		}
	}

	protected static get protectedDataJsonFields(): string[] {
		return ['name'];
	}
}

export abstract class ArFSDriveTransactionData extends ArFSObjectTransactionData {
	protected static get protectedDataJsonFields(): string[] {
		const dataJsonFields = super.protectedDataJsonFields;

		dataJsonFields.push('rootFolderId');

		return dataJsonFields;
	}
}

export class ArFSPublicDriveTransactionData extends ArFSDriveTransactionData {
	private baseDataJson: DriveMetaDataTransactionData;
	private fullDataJson: EntityMetaDataTransactionData;

	constructor(
		private readonly name: string,
		private readonly rootFolderId: FolderID,
		protected readonly dataJsonCustomMetaData: CustomMetaDataJsonFields = {}
	) {
		super();

		this.baseDataJson = {
			name: this.name,
			rootFolderId: `${this.rootFolderId}`
		};

		this.fullDataJson = ArFSPublicDriveTransactionData.parseCustomDataJsonFields(
			this.baseDataJson,
			this.dataJsonCustomMetaData
		);
	}

	public asTransactionData(): string {
		return JSON.stringify(this.fullDataJson);
	}
}

export class ArFSPrivateDriveTransactionData extends ArFSDriveTransactionData {
	private constructor(
		readonly cipher: CipherType,
		readonly cipherIV: CipherIV,
		readonly encryptedDriveData: Buffer,
		readonly driveKey: DriveKey,
		readonly driveAuthMode: DriveAuthMode = 'password',
		readonly driveSignatureType: DriveSignatureType = driveKey.driveSignatureType
	) {
		super();
	}

	static async from(
		name: string,
		rootFolderId: FolderID,
		driveKey: DriveKey,
		dataJsonCustomMetaData: CustomMetaDataJsonFields = {}
	): Promise<ArFSPrivateDriveTransactionData> {
		const baseDataJson = {
			name: name,
			rootFolderId: `${rootFolderId}`
		};
		const fullDataJson = ArFSPrivateDriveTransactionData.parseCustomDataJsonFields(
			baseDataJson,
			dataJsonCustomMetaData
		);

		const { cipher, cipherIV, data } = await driveEncrypt(driveKey, Buffer.from(JSON.stringify(fullDataJson)));

		return new ArFSPrivateDriveTransactionData(
			cipher,
			cipherIV,
			data,
			driveKey,
			'password',
			driveKey.driveSignatureType
		);
	}

	asTransactionData(): Buffer {
		return this.encryptedDriveData;
	}
}

export abstract class ArFSFolderTransactionData extends ArFSObjectTransactionData {}

export class ArFSPublicFolderTransactionData extends ArFSFolderTransactionData {
	private baseDataJson: { name: string };
	private fullDataJson: EntityMetaDataTransactionData;

	constructor(
		private readonly name: string,
		protected readonly dataJsonCustomMetaData: CustomMetaDataJsonFields = {}
	) {
		super();

		this.baseDataJson = {
			name: this.name
		};

		this.fullDataJson = ArFSPublicFolderTransactionData.parseCustomDataJsonFields(
			this.baseDataJson,
			this.dataJsonCustomMetaData
		);
	}

	asTransactionData(): string {
		return JSON.stringify(this.fullDataJson);
	}
}

export class ArFSPrivateFolderTransactionData extends ArFSFolderTransactionData {
	private constructor(
		readonly name: string,
		readonly cipher: CipherType,
		readonly cipherIV: CipherIV,
		readonly encryptedFolderData: Buffer,
		readonly driveKey: DriveKey
	) {
		super();
	}

	static async from(
		name: string,
		driveKey: DriveKey,
		dataJsonCustomMetaData: CustomMetaDataJsonFields = {}
	): Promise<ArFSPrivateFolderTransactionData> {
		const baseDataJson = {
			name: name
		};
		const fullDataJson = ArFSPrivateFolderTransactionData.parseCustomDataJsonFields(
			baseDataJson,
			dataJsonCustomMetaData
		);

		const { cipher, cipherIV, data }: ArFSEncryptedData = await fileEncrypt(
			driveKey,
			Buffer.from(JSON.stringify(fullDataJson))
		);
		return new ArFSPrivateFolderTransactionData(name, cipher, cipherIV, data, driveKey);
	}

	asTransactionData(): Buffer {
		return this.encryptedFolderData;
	}
}

export abstract class ArFSFileMetadataTransactionData extends ArFSObjectTransactionData {
	protected static get protectedDataJsonFields(): string[] {
		const dataJsonFields = super.protectedDataJsonFields;

		dataJsonFields.push('size');
		dataJsonFields.push('lastModifiedDate');
		dataJsonFields.push('dataTxId');
		dataJsonFields.push('dataContentType');

		return dataJsonFields;
	}
}

export class ArFSPublicFileMetadataTransactionData extends ArFSFileMetadataTransactionData {
	private baseDataJson: FileMetaDataTransactionData;
	private fullDataJson: EntityMetaDataTransactionData;

	constructor(
		private readonly name: string,
		private readonly size: ByteCount,
		private readonly lastModifiedDate: UnixTime,
		private readonly dataTxId: TransactionID,
		private readonly dataContentType: DataContentType,
		private readonly dataJsonCustomMetaData: CustomMetaDataJsonFields = {}
	) {
		super();

		this.baseDataJson = {
			name: this.name,
			size: +this.size,
			lastModifiedDate: +this.lastModifiedDate,
			dataTxId: `${this.dataTxId}`,
			dataContentType: this.dataContentType
		};

		this.fullDataJson = ArFSPublicFileMetadataTransactionData.parseCustomDataJsonFields(
			this.baseDataJson,
			this.dataJsonCustomMetaData
		);
	}

	asTransactionData(): string {
		return JSON.stringify(this.fullDataJson);
	}
}

export class ArFSPrivateFileMetadataTransactionData extends ArFSFileMetadataTransactionData {
	private constructor(
		readonly cipher: CipherType,
		readonly cipherIV: CipherIV,
		readonly encryptedFileMetadata: Buffer,
		readonly fileKey: FileKey,
		readonly driveAuthMode: DriveAuthMode = 'password'
	) {
		super();
	}

	static async from(
		name: string,
		size: ByteCount,
		lastModifiedDate: UnixTime,
		dataTxId: TransactionID,
		dataContentType: DataContentType,
		fileId: FileID,
		driveKey: DriveKey,
		dataJsonCustomMetaData: CustomMetaDataJsonFields = {}
	): Promise<ArFSPrivateFileMetadataTransactionData> {
		const baseDataJson = {
			name: name,
			size: +size,
			lastModifiedDate: +lastModifiedDate,
			dataTxId: `${dataTxId}`,
			dataContentType: dataContentType
		};
		const fullDataJson = ArFSPrivateFileMetadataTransactionData.parseCustomDataJsonFields(
			baseDataJson,
			dataJsonCustomMetaData
		);

		const fileKey: FileKey = await deriveFileKey(`${fileId}`, driveKey);
		const { cipher, cipherIV, data }: ArFSEncryptedData = await fileEncrypt(
			fileKey,
			Buffer.from(JSON.stringify(fullDataJson))
		);
		return new ArFSPrivateFileMetadataTransactionData(cipher, cipherIV, data, fileKey);
	}

	asTransactionData(): Buffer {
		return this.encryptedFileMetadata;
	}
}

export abstract class ArFSFileDataTransactionData extends ArFSObjectTransactionData {}
export class ArFSPublicFileDataTransactionData extends ArFSFileDataTransactionData {
	constructor(private readonly fileData: Buffer) {
		super();
	}

	asTransactionData(): Buffer {
		return this.fileData;
	}
}

export class ArFSPrivateFileDataTransactionData extends ArFSFileDataTransactionData {
	private constructor(
		readonly cipher: CipherType,
		readonly cipherIV: CipherIV,
		readonly encryptedFileData: Buffer,
		readonly driveAuthMode: DriveAuthMode = 'password'
	) {
		super();
	}

	static async from(
		fileData: Buffer,
		fileId: FileID,
		driveKey: DriveKey
	): Promise<ArFSPrivateFileDataTransactionData> {
		const fileKey: FileKey = await deriveFileKey(`${fileId}`, driveKey);
		const { cipher, cipherIV, data }: ArFSEncryptedData = await fileEncrypt(fileKey, fileData);
		return new ArFSPrivateFileDataTransactionData(cipher, cipherIV, data);
	}

	asTransactionData(): string | Buffer {
		return this.encryptedFileData;
	}
}
