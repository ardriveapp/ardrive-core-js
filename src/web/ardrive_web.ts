import { ArDriveAnonymous } from '../ardrive_anonymous';
import { GatewayAPI } from '../utils/gateway_api';
import { JWKWalletWeb } from './jwk_wallet_web';
import { ArFSDAOAuthenticatedWeb } from './arfsdao_authenticated_web';
import type { DataItem, Signer } from '@dha-team/arbundles';
import { ArweaveSigner, ArconnectSigner, createData } from '@dha-team/arbundles';
import { v4 as uuidv4 } from 'uuid';
import type { WebFileToUpload } from './arfs_file_wrapper_web';
import { deriveDriveKeyWithSigner } from './crypto_web';
import { DriveID, FolderID, FileID, ArweaveAddress, DriveSignatureInfo, DriveKey } from '../types';
import { EntityKey } from '../types/entity_key';
import {
	ArFSPrivateDrive,
	ArFSPrivateFolder,
	ArFSPrivateFile,
	ArFSPrivateFolderWithPaths,
	ArFSPrivateFileWithPaths
} from '../arfs/arfs_entities';
import Arweave from 'arweave';
import type { ArDriveSigner } from './ardrive_signer';

export interface ArDriveWebSettings {
	gatewayUrl?: URL;
	/** Browser JWK wallet wrapper (provide either wallet or signer) */
	wallet?: JWKWalletWeb;
	/** ArDriveSigner, ArweaveSigner, or ArconnectSigner instance (provide either wallet or signer) */
	signer?: ArDriveSigner | ArweaveSigner | ArconnectSigner;
	appName?: string;
	appVersion?: string;
}

export interface UploadPublicFileParams {
	driveId: string;
	parentFolderId: string;
	file: WebFileToUpload;
	customMetaDataJson?: Record<string, unknown>;
	// App-provided uploader that posts a signed DataItem and returns its id (e.g., Bundlr upload)
	postDataItem: (item: DataItem) => Promise<string>;
}

export interface UploadPublicFileResult {
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

	constructor(settings: ArDriveWebSettings) {
		// Validate that either wallet or signer is provided
		if (!settings.wallet && !settings.signer) {
			throw new Error('Either wallet or signer must be provided to ArDriveWeb');
		}

		const gw = new GatewayAPI({ gatewayUrl: settings.gatewayUrl ?? new URL('https://arweave.net/') });
		// Use provided signer or create one from wallet
		const signer: Signer | ArDriveSigner = settings.signer ?? new ArweaveSigner(settings.wallet!.getPrivateKey());
		const appName = settings.appName ?? 'ArDrive-Core';
		const appVersion = settings.appVersion ?? 'web';

		// Use authenticated DAO with signer support
		const dao = new ArFSDAOAuthenticatedWeb(signer, gw, appName, appVersion);

		super(dao);
		this._wallet = settings.wallet!;
		this.signer = signer;
		this.appName = appName;
		this.appVersion = appVersion;
	}

	// Example: Sign arbitrary data item (useful for client apps and future upload wiring)
	async signData(bytes: Uint8Array, tags: { name: string; value: string }[] = []) {
		const di = createData(bytes, this.signer, { tags });
		await di.sign(this.signer);
		return di; // Caller can post to a bundler or gateway endpoint
	}

	// Public file upload (metadata + data as DataItems). Caller supplies postDataItem implementation.
	async uploadPublicFile({
		driveId,
		parentFolderId,
		file,
		customMetaDataJson,
		postDataItem
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
		const dataTxId = await postDataItem(dataItem);

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
			{ name: 'Drive-Id', value: driveId },
			{ name: 'Parent-Folder-Id', value: parentFolderId },
			{ name: 'File-Id', value: fileId },
			{ name: 'Unix-Time', value: String(nowSec) }
		];

		const metaItem = createData(metaBytes, this.signer, { tags: metaTags });
		await metaItem.sign(this.signer);
		const metaDataTxId = await postDataItem(metaItem);

		return { fileId, dataTxId, metaDataTxId };
	}

	// Placeholder: Private upload API to be implemented
	async uploadPrivateFile(): Promise<never> {
		throw new Error('uploadPrivateFile is not yet implemented in the browser build');
	}

	/**
	 * Helper method to get owner address from signer
	 */
	private async getOwnerAddress(): Promise<ArweaveAddress> {
		const arweave = Arweave.init({});
		const publicKey = this.signer.publicKey;
		const address = await arweave.wallets.ownerToAddress(publicKey.toString());
		return new ArweaveAddress(address);
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
}
