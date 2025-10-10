import { ArDriveAnonymous } from '../ardrive_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
import { JWKWalletWeb } from './jwk_wallet_web';
import { ArFSDAOAuthenticatedWeb } from './arfsdao_authenticated_web';
import type { DataItem, Signer } from '@dha-team/arbundles';
import { ArweaveSigner, ArconnectSigner, createData } from '@dha-team/arbundles';
import { v4 as uuidv4 } from 'uuid';
import type { WebFileToUpload } from './arfs_file_wrapper_web';
import { deriveDriveKeyWithSigner } from './crypto_web';
import { DriveID, FolderID, FileID, ArweaveAddress, DriveSignatureInfo, DriveKey, EID } from '../types';
import { EntityKey } from '../types/entity_key';
import {
	ArFSPrivateDrive,
	ArFSPrivateFolder,
	ArFSPrivateFile,
	ArFSPrivateFolderWithPaths,
	ArFSPrivateFileWithPaths
} from '../arfs/arfs_entities';
import { ArFSPublicFolderTransactionData, ArFSPrivateFolderTransactionData } from '../arfs/tx/arfs_tx_data_types';
import { TxID } from '../types';
import type { CustomMetaDataJsonFields } from '../types/custom_metadata_types';
import Arweave from 'arweave';
import type { ArDriveSigner } from './ardrive_signer';
import { TurboWeb, TurboSettings } from './turbo_web';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from '../utils/constants';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';

export interface ArDriveWebSettings {
	gatewayUrl?: URL;
	/** Browser JWK wallet wrapper (provide either wallet or signer) */
	wallet?: JWKWalletWeb;
	/** ArDriveSigner, ArweaveSigner, or ArconnectSigner instance (provide either wallet or signer) */
	signer?: ArDriveSigner | ArweaveSigner | ArconnectSigner;
	appName?: string;
	appVersion?: string;
	/** Turbo settings for automatic upload handling */
	turboSettings?: TurboSettings;
	/** Dry run mode - doesn't actually upload to Turbo */
	dryRun?: boolean;
}

export interface UploadPublicFileParams {
	driveId: string;
	parentFolderId: string;
	file: WebFileToUpload;
	customMetaDataJson?: Record<string, unknown>;
}

export interface UploadPublicFileResult {
	fileId: string;
	dataTxId: string;
	metaDataTxId: string;
}

export interface CreatePublicFolderParams {
	driveId: string;
	parentFolderId: string;
	folderName: string;
	customMetaDataJson?: Record<string, unknown>;
}

export interface CreatePublicFolderResult {
	folderId: string;
	metaDataTxId: string;
}

export interface CreatePrivateFolderParams {
	driveId: string;
	parentFolderId: string;
	folderName: string;
	driveKey: DriveKey;
	customMetaDataJson?: Record<string, unknown>;
}

export interface CreatePrivateFolderResult {
	folderId: string;
	metaDataTxId: string;
}

export interface UploadPrivateFileParams {
	driveId: string;
	parentFolderId: string;
	file: WebFileToUpload;
	driveKey: DriveKey;
	customMetaDataJson?: Record<string, unknown>;
}

export interface UploadPrivateFileResult {
	fileId: string;
	dataTxId: string;
	metaDataTxId: string;
}

// Browser ArDrive with read-only parity and upload stubs.
export class ArDriveWeb extends ArDriveAnonymous {
	private readonly signer: Signer | ArDriveSigner;
	// @ts-expect-error - Kept for future functionality
	private readonly _wallet: JWKWalletWeb;
	private readonly appName: string;
	private readonly appVersion: string;
	private readonly turbo?: TurboWeb;

	constructor(settings: ArDriveWebSettings) {
		// Validate that either wallet or signer is provided
		if (!settings.wallet && !settings.signer) {
			throw new Error('Either wallet or signer must be provided to ArDriveWeb');
		}

		const gw = new GatewayAPI({ gatewayUrl: settings.gatewayUrl ?? new URL('https://arweave.net/') });
		// Use provided signer or create one from wallet
		const signer: Signer | ArDriveSigner = settings.signer ?? new ArweaveSigner(settings.wallet!.getPrivateKey());
		const appName = settings.appName ?? DEFAULT_APP_NAME;
		const appVersion = settings.appVersion ?? DEFAULT_APP_VERSION;

		// Create tag settings with App-Platform tag for web
		const arFSTagSettings = new ArFSTagSettings({
			appName,
			appVersion,
			appPlatform: 'Web'
		});

		// Use authenticated DAO with signer support and turbo settings
		const dao = new ArFSDAOAuthenticatedWeb(
			signer,
			gw,
			appName,
			appVersion,
			arFSTagSettings,
			undefined, // caches - use default
			settings.turboSettings,
			settings.dryRun
		);

		super(dao);
		this._wallet = settings.wallet!;
		this.signer = signer;
		this.appName = appName;
		this.appVersion = appVersion;

		// Initialize Turbo if settings provided (for direct use in ArDriveWeb methods)
		if (settings.turboSettings) {
			this.turbo = new TurboWeb({
				...settings.turboSettings,
				isDryRun: settings.dryRun
			});
		}
	}

	/**
	 * Internal method to post a DataItem using Turbo
	 */
	private async postDataItem(dataItem: DataItem): Promise<string> {
		if (!this.turbo) {
			throw new Error('No Turbo uploader configured. Please provide turboSettings in ArDriveWeb constructor.');
		}

		const result = await this.turbo.sendDataItem(dataItem);
		return result.id;
	}

	// Example: Sign arbitrary data item (useful for client apps and future upload wiring)
	async signData(bytes: Uint8Array, tags: { name: string; value: string }[] = []) {
		const di = createData(bytes, this.signer, { tags });
		await di.sign(this.signer);
		return di; // Caller can post to a bundler or gateway endpoint
	}

	// Public file upload (metadata + data as DataItems) using internal Turbo.
	async uploadPublicFile({
		driveId,
		parentFolderId,
		file,
		customMetaDataJson
	}: UploadPublicFileParams): Promise<UploadPublicFileResult> {
		const nowSec = Math.floor(Date.now() / 1000);
		const fileId = uuidv4();

		// 1) Create + sign DataItem for file bytes
		const fileBytes = await file.getBytes();
		const dataTags = [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'Content-Type', value: file.contentType }
		];

		const dataItem = createData(fileBytes, this.signer, { tags: dataTags });
		await dataItem.sign(this.signer);
		const dataTxId = await this.postDataItem(dataItem);

		// 2) Build metadata JSON referencing dataTxId
		const metaJson = {
			name: file.name,
			size: file.size,
			lastModifiedDate: file.lastModifiedDateMS,
			dataTxId,
			dataContentType: file.contentType,
			...(customMetaDataJson ?? {})
		};
		const metaBytes = new TextEncoder().encode(JSON.stringify(metaJson));

		const metaTags = [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Drive-Id', value: `${driveId}` },
			{ name: 'Parent-Folder-Id', value: `${parentFolderId}` },
			{ name: 'File-Id', value: `${fileId}` },
			{ name: 'Unix-Time', value: `${nowSec}` }
		];

		const metaItem = createData(metaBytes, this.signer, { tags: metaTags });
		await metaItem.sign(this.signer);
		const metaDataTxId = await this.postDataItem(metaItem);

		return { fileId, dataTxId, metaDataTxId };
	}

	/**
	 * Create a public folder using DAO (with proper validation and tag assembly)
	 */
	async createPublicFolder({
		driveId,
		parentFolderId,
		folderName,
		customMetaDataJson
	}: CreatePublicFolderParams): Promise<CreatePublicFolderResult> {
		const folderData = new ArFSPublicFolderTransactionData(
			folderName,
			customMetaDataJson as CustomMetaDataJsonFields | undefined
		);

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).createPublicFolder({
			driveId: EID(driveId),
			parentFolderId: EID(parentFolderId),
			folderData,
			rewardSettings: undefined
		});

		return {
			folderId: result.folderId.toString(),
			metaDataTxId: result.metaDataTxId.toString()
		};
	}

	/**
	 * Create a private folder using DAO (with proper validation and tag assembly)
	 */
	async createPrivateFolder({
		driveId,
		parentFolderId,
		folderName,
		driveKey,
		customMetaDataJson
	}: CreatePrivateFolderParams): Promise<CreatePrivateFolderResult> {
		// Build encrypted folder metadata
		const folderData = await ArFSPrivateFolderTransactionData.from(
			folderName,
			driveKey,
			customMetaDataJson as CustomMetaDataJsonFields
		);

		// Use DAO method which handles tag assembly and upload
		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).createPrivateFolder({
			driveId: EID(driveId),
			parentFolderId: EID(parentFolderId),
			folderData,
			rewardSettings: undefined // Turbo upload (no V2 tx)
		});

		return {
			folderId: result.folderId.toString(),
			metaDataTxId: result.metaDataTxId.toString()
		};
	}

	/**
	 * Upload a private file (metadata + data as DataItems) using internal Turbo
	 */
	async uploadPrivateFile({
		driveId,
		parentFolderId,
		file,
		driveKey,
		customMetaDataJson
	}: UploadPrivateFileParams): Promise<UploadPrivateFileResult> {
		const nowSec = Math.floor(Date.now() / 1000);
		const fileId = uuidv4();

		// 1) Encrypt and upload file data
		const fileBytes = await file.getBytes();

		// Derive file key and encrypt data
		const { deriveFileKey, aesGcmEncrypt } = await import('./crypto_web');
		const fileKey = deriveFileKey(fileId, new Uint8Array(driveKey.keyData));
		const { cipherIV, data: encryptedData } = await aesGcmEncrypt(fileKey, Buffer.from(fileBytes));
		const cipher = 'AES256-GCM';

		const dataTags = [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'Content-Type', value: 'application/octet-stream' },
			{ name: 'Cipher', value: cipher },
			{ name: 'Cipher-IV', value: cipherIV }
		];
		const dataItem = createData(encryptedData, this.signer, { tags: dataTags });
		await dataItem.sign(this.signer);
		const dataTxId = await this.postDataItem(dataItem);

		// 2) Build encrypted metadata JSON referencing dataTxId
		const metadataJson = {
			name: file.name,
			size: file.size,
			lastModifiedDate: file.lastModifiedDateMS,
			dataTxId,
			dataContentType: file.contentType,
			...(customMetaDataJson ?? {})
		};
		const metadataBytes = Buffer.from(JSON.stringify(metadataJson));
		const { cipherIV: metaCipherIV, data: encryptedMetadata } = await aesGcmEncrypt(fileKey, metadataBytes);
		const metaCipher = 'AES256-GCM';
		const metaBytes = encryptedMetadata;

		const metaTags = [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/octet-stream' },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Drive-Id', value: `${driveId}` },
			{ name: 'Parent-Folder-Id', value: `${parentFolderId}` },
			{ name: 'File-Id', value: `${fileId}` },
			{ name: 'Unix-Time', value: `${nowSec}` },
			{ name: 'Cipher', value: metaCipher },
			{ name: 'Cipher-IV', value: metaCipherIV }
		];

		const metaItem = createData(metaBytes, this.signer, { tags: metaTags });
		await metaItem.sign(this.signer);
		const metaDataTxId = await this.postDataItem(metaItem);

		return { fileId, dataTxId, metaDataTxId };
	}

	/**
	 * Helper method to get owner address from signer
	 */
	private async getOwnerAddress(): Promise<ArweaveAddress> {
		// If signer has getActiveAddress method (ArDriveSigner), use it
		if ('getActiveAddress' in this.signer && typeof this.signer.getActiveAddress === 'function') {
			const address = await (this.signer as any).getActiveAddress();
			return new ArweaveAddress(address);
		}

		// Otherwise derive from public key
		const arweave = Arweave.init({});
		const publicKey = this.signer.publicKey;
		const address = await arweave.wallets.ownerToAddress(publicKey.toString());
		return new ArweaveAddress(address);
	}

	/**
	 * Create a public drive
	 */
	async createPublicDrive({ driveName }: { driveName: string }): Promise<{
		driveId: string;
		rootFolderId: string;
		metaDataTxId: string;
		rootFolderTxId: string;
		bundleTxId: string;
	}> {
		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).createPublicDrive({ driveName });
		return {
			driveId: result.driveId.toString(),
			rootFolderId: result.rootFolderId.toString(),
			metaDataTxId: result.metaDataTxId.toString(),
			rootFolderTxId: result.rootFolderTxId.toString(),
			bundleTxId: result.bundleTxId.toString()
		};
	}

	/**
	 * Create a private drive
	 *
	 * @param newDriveData - PrivateDriveKeyData containing driveId and driveKey
	 *                       Use PrivateDriveKeyData.from(password, signer) to create
	 * @param driveName - Name for the new drive
	 *
	 * @example
	 * ```typescript
	 * import { PrivateDriveKeyData } from 'ardrive-core-js/web';
	 *
	 * const newDriveData = await PrivateDriveKeyData.from('my-password', signer);
	 * const result = await arDrive.createPrivateDrive({
	 *   driveName: 'My Private Drive',
	 *   newDriveData
	 * });
	 * ```
	 */
	async createPrivateDrive({
		driveName,
		newDriveData
	}: {
		driveName: string;
		newDriveData: { driveId: DriveID; driveKey: DriveKey };
	}): Promise<{
		driveId: string;
		rootFolderId: string;
		metaDataTxId: string;
		rootFolderTxId: string;
		bundleTxId: string;
	}> {
		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).createPrivateDrive({
			driveName,
			newDriveData
		});
		return {
			driveId: result.driveId.toString(),
			rootFolderId: result.rootFolderId.toString(),
			metaDataTxId: result.metaDataTxId.toString(),
			rootFolderTxId: result.rootFolderTxId.toString(),
			bundleTxId: result.bundleTxId.toString()
		};
	}

	/**
	 * Move a public file to a new parent folder
	 */
	async movePublicFile({
		fileId,
		newParentFolderId
	}: {
		fileId: string;
		newParentFolderId: string;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPublicFile({ fileId: EID(fileId), owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).movePublicFile({
			fileId: EID(fileId),
			newParentFolderId: EID(newParentFolderId),
			originalMetaData
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Move a private file to a new parent folder
	 */
	async movePrivateFile({
		fileId,
		newParentFolderId,
		driveKey
	}: {
		fileId: string;
		newParentFolderId: string;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPrivateFile({ fileId: EID(fileId), driveKey, owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).movePrivateFile({
			fileId: EID(fileId),
			newParentFolderId: EID(newParentFolderId),
			originalMetaData,
			driveKey
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Move a public folder to a new parent folder
	 */
	async movePublicFolder({
		folderId,
		newParentFolderId
	}: {
		folderId: string;
		newParentFolderId: string;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPublicFolder({ folderId: EID(folderId), owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).movePublicFolder({
			folderId: EID(folderId),
			newParentFolderId: EID(newParentFolderId),
			originalMetaData
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Move a private folder to a new parent folder
	 */
	async movePrivateFolder({
		folderId,
		newParentFolderId,
		driveKey
	}: {
		folderId: string;
		newParentFolderId: string;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPrivateFolder({ folderId: EID(folderId), driveKey, owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).movePrivateFolder({
			folderId: EID(folderId),
			newParentFolderId: EID(newParentFolderId),
			originalMetaData,
			driveKey
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Rename a public file
	 */
	async renamePublicFile({
		fileId,
		newName
	}: {
		fileId: string;
		newName: string;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPublicFile({ fileId: EID(fileId), owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).renamePublicFile({
			fileId: EID(fileId),
			newName,
			originalMetaData
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Rename a private file
	 */
	async renamePrivateFile({
		fileId,
		newName,
		driveKey
	}: {
		fileId: string;
		newName: string;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPrivateFile({ fileId: EID(fileId), driveKey, owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).renamePrivateFile({
			fileId: EID(fileId),
			newName,
			originalMetaData,
			driveKey
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Rename a public folder
	 */
	async renamePublicFolder({
		folderId,
		newName
	}: {
		folderId: string;
		newName: string;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPublicFolder({ folderId: EID(folderId), owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).renamePublicFolder({
			folderId: EID(folderId),
			newName,
			originalMetaData
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Rename a private folder
	 */
	async renamePrivateFolder({
		folderId,
		newName,
		driveKey
	}: {
		folderId: string;
		newName: string;
		driveKey: DriveKey;
	}): Promise<{ metaDataTxId: string }> {
		const owner = await this.getOwnerAddress();
		const originalMetaData = await this.getPrivateFolder({ folderId: EID(folderId), driveKey, owner });

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).renamePrivateFolder({
			folderId: EID(folderId),
			newName,
			originalMetaData,
			driveKey
		});

		return { metaDataTxId: result.metaDataTxId.toString() };
	}

	/**
	 * Get drive signature information for private drive key derivation
	 */
	async getDriveSignatureInfo({
		driveId,
		owner
	}: {
		driveId: DriveID;
		owner?: ArweaveAddress;
	}): Promise<DriveSignatureInfo> {
		if (!owner) {
			owner = await this.getOwnerAddress();
		}
		return (this.arFsDao as ArFSDAOAuthenticatedWeb).getDriveSignatureInfo(driveId, owner);
	}

	/**
	 * Get private drive with password-based key derivation
	 * The drive key is automatically derived from the password and signer
	 *
	 * @param driveId - Drive ID
	 * @param password - User's data encryption password
	 * @param owner - Optional owner address (derived from signer if not provided)
	 * @returns Private drive metadata
	 */
	async getPrivateDrive({
		driveId,
		password,
		owner
	}: {
		driveId: DriveID;
		password: string;
		owner?: ArweaveAddress;
	}): Promise<ArFSPrivateDrive> {
		if (!owner) {
			owner = await this.getOwnerAddress();
		}

		// Get signature info
		const signatureInfo = await this.getDriveSignatureInfo({ driveId, owner });

		// Derive drive key using signer
		const driveKeyBytes = await deriveDriveKeyWithSigner({
			dataEncryptionKey: password,
			driveId: driveId.toString(),
			signer: this.signer,
			driveSignatureType: signatureInfo.driveSignatureType,
			encryptedSignatureData: signatureInfo.encryptedSignatureData
		});

		const driveKey = new EntityKey(Buffer.from(driveKeyBytes));

		// Get private drive
		return (this.arFsDao as ArFSDAOAuthenticatedWeb).getPrivateDrive(driveId, driveKey, owner);
	}

	/**
	 * Get private folder with pre-derived drive key
	 *
	 * @param folderId - Folder ID
	 * @param driveKey - Pre-derived drive key
	 * @param owner - Optional owner address
	 * @returns Private folder metadata
	 */
	async getPrivateFolder({
		folderId,
		driveKey,
		owner
	}: {
		folderId: FolderID;
		driveKey: DriveKey;
		owner?: ArweaveAddress;
	}): Promise<ArFSPrivateFolder> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
		}
		return (this.arFsDao as ArFSDAOAuthenticatedWeb).getPrivateFolder(folderId, driveKey, owner);
	}

	/**
	 * Get private file with pre-derived drive key
	 *
	 * @param fileId - File ID
	 * @param driveKey - Pre-derived drive key
	 * @param owner - Optional owner address
	 * @returns Private file metadata
	 */
	async getPrivateFile({
		fileId,
		driveKey,
		owner
	}: {
		fileId: FileID;
		driveKey: DriveKey;
		owner?: ArweaveAddress;
	}): Promise<ArFSPrivateFile> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFileId(fileId);
		}
		return (this.arFsDao as ArFSDAOAuthenticatedWeb).getPrivateFile(fileId, driveKey, owner);
	}

	/**
	 * List private folder contents with pre-derived drive key
	 *
	 * @param folderId - Folder ID to list
	 * @param driveKey - Pre-derived drive key
	 * @param maxDepth - Maximum depth to traverse (default: 0 = immediate children only)
	 * @param includeRoot - Whether to include the root folder in results (default: false)
	 * @param owner - Optional owner address
	 * @returns Array of private folders and files with paths
	 */
	async listPrivateFolder({
		folderId,
		driveKey,
		maxDepth = 0,
		includeRoot = false,
		owner
	}: {
		folderId: FolderID;
		driveKey: DriveKey;
		maxDepth?: number;
		includeRoot?: boolean;
		owner?: ArweaveAddress;
	}): Promise<(ArFSPrivateFolderWithPaths | ArFSPrivateFileWithPaths)[]> {
		if (!owner) {
			owner = await this.arFsDao.getDriveOwnerForFolderId(folderId);
		}
		return (this.arFsDao as ArFSDAOAuthenticatedWeb).listPrivateFolder({
			folderId,
			driveKey,
			maxDepth,
			includeRoot,
			owner
		});
	}

	/**
	 * Rename a public drive
	 */
	async renamePublicDrive({ driveId, newName }: { driveId: string; newName: string }): Promise<{
		driveId: string;
		metaDataTxId: string;
	}> {
		const owner = await this.getOwnerAddress();
		const drive = await this.arFsDao.getPublicDrive(EID(driveId), owner);

		if (drive.name === newName) {
			throw new Error(`New drive name '${newName}' must be different from the current drive name!`);
		}

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).renamePublicDrive({
			drive,
			newName,
			metadataRewardSettings: undefined // Turbo upload
		});

		return {
			driveId: result.entityId.toString(),
			metaDataTxId: result.metaDataTxId.toString()
		};
	}

	/**
	 * Rename a private drive
	 */
	async renamePrivateDrive({
		driveId,
		newName,
		driveKey
	}: {
		driveId: string;
		newName: string;
		driveKey: DriveKey;
	}): Promise<{
		driveId: string;
		metaDataTxId: string;
	}> {
		const owner = await this.getOwnerAddress();
		const drive = await (this.arFsDao as ArFSDAOAuthenticatedWeb).getPrivateDrive(EID(driveId), driveKey, owner);

		if (drive.name === newName) {
			throw new Error(`New drive name '${newName}' must be different from the current drive name!`);
		}

		const result = await (this.arFsDao as ArFSDAOAuthenticatedWeb).renamePrivateDrive({
			drive,
			newName,
			metadataRewardSettings: undefined, // Turbo upload
			driveKey
		});

		return {
			driveId: result.entityId.toString(),
			metaDataTxId: result.metaDataTxId.toString()
		};
	}

	/**
	 * Upload a public manifest for a folder
	 * Creates an Arweave manifest that provides path-based access to files
	 *
	 * @param folderId - Root folder ID to create manifest for
	 * @param destManifestName - Name for the manifest file (default: 'DriveManifest.json')
	 * @param maxDepth - Maximum folder depth to include (default: unlimited)
	 * @returns Manifest transaction ID and links
	 */
	async uploadPublicManifest({
		folderId,
		destManifestName = 'DriveManifest.json',
		maxDepth = Number.MAX_SAFE_INTEGER
	}: {
		folderId: string;
		destManifestName?: string;
		maxDepth?: number;
	}): Promise<{
		manifestTxId: string;
		links: string[];
	}> {
		const owner = await this.getOwnerAddress();
		const children = await this.listPublicFolder({
			folderId: EID(folderId),
			maxDepth,
			includeRoot: true,
			owner
		});

		// Create manifest from folder contents
		const { ArFSManifestToUpload } = await import('../arfs/arfs_file_wrapper');
		const arweaveManifest = new ArFSManifestToUpload(children, destManifestName);

		// Upload manifest as a file
		const manifestData = JSON.stringify(arweaveManifest.manifest, null, 2);
		const manifestBlob = new Blob([manifestData], { type: 'application/x.arweave-manifest+json' });
		const manifestFile = new File([manifestBlob], destManifestName, {
			type: 'application/x.arweave-manifest+json'
		});

		const webFile = {
			name: manifestFile.name,
			size: manifestFile.size,
			lastModifiedDateMS: manifestFile.lastModified,
			contentType: manifestFile.type,
			getBytes: async () => new Uint8Array(await manifestFile.arrayBuffer())
		};

		const uploadResult = await this.uploadPublicFile({
			driveId: (await this.arFsDao.getDriveIdForFolderId(EID(folderId))).toString(),
			parentFolderId: folderId,
			file: webFile
		});

		const manifestTxId = uploadResult.dataTxId;
		const links = arweaveManifest.getLinksOutput(TxID(manifestTxId), new URL('https://arweave.net'));

		return {
			manifestTxId,
			links
		};
	}
}
