import { ArDriveAnonymousWeb } from './ardrive_anonymous_web';
import { ArFSDAOAnonymousWeb } from './arfsdao_anonymous_web';
import { GatewayAPIWeb } from './gateway_api_web';
import { JWKWalletWeb } from './jwk_wallet_web';
import type { DataItem } from '@dha-team/arbundles';
import { ArweaveSigner, createData } from '@dha-team/arbundles';
import { v4 as uuidv4 } from 'uuid';
import type { WebFileToUpload } from './arfs_file_wrapper_web';

export interface ArDriveWebSettings {
	gatewayUrl?: URL;
	wallet: JWKWalletWeb; // Browser JWK wallet wrapper for Node.js compatibility
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
export class ArDriveWeb extends ArDriveAnonymousWeb {
	private readonly signer: ArweaveSigner;
	// @ts-expect-error - Kept for future functionality
	private readonly _wallet: JWKWalletWeb;
	private readonly appName: string;
	private readonly appVersion: string;

	constructor(settings: ArDriveWebSettings) {
		const gw = new GatewayAPIWeb({ gatewayUrl: settings.gatewayUrl ?? new URL('https://arweave.net/') });
		super(new ArFSDAOAnonymousWeb(gw));
		this._wallet = settings.wallet;
		this.signer = new ArweaveSigner(settings.wallet.getPrivateKey());
		this.appName = settings.appName ?? 'ArDrive-Core';
		this.appVersion = settings.appVersion ?? 'web';
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
}
