import { GatewayAPIWeb } from './gateway_api_web';
import {
	ArFSDAOAnonymousWeb,
	type WebPublicDrive,
	type WebPublicFolder,
	type WebPublicFile
} from './arfsdao_anonymous_web';

export interface GetPublicDriveParamsWeb {
	driveId: string;
	owner?: string;
}
export interface GetPublicFolderParamsWeb {
	folderId: string;
	owner?: string;
}
export interface GetPublicFileParamsWeb {
	fileId: string;
	owner?: string;
}
export interface ListPublicFolderParamsWeb {
	folderId: string;
	owner?: string;
	maxDepth?: number;
	includeRoot?: boolean;
}

export class ArDriveAnonymousWeb {
	constructor(private readonly dao: ArFSDAOAnonymousWeb) {}

	static fromGatewayUrl(gatewayUrl = new URL('https://arweave.net/')): ArDriveAnonymousWeb {
		const gw = new GatewayAPIWeb({ gatewayUrl });
		return new ArDriveAnonymousWeb(new ArFSDAOAnonymousWeb(gw));
	}

	async getOwnerForDriveId(driveId: string): Promise<string> {
		return this.dao.getOwnerForDriveId(driveId);
	}

	async getOwnerForFileId(fileId: string): Promise<string> {
		return this.dao.getDriveIdForFileId(fileId).then((driveId) => this.dao.getOwnerForDriveId(driveId));
	}

	async getPublicDrive({ driveId, owner }: GetPublicDriveParamsWeb): Promise<WebPublicDrive> {
		const ensuredOwner = owner ?? (await this.getOwnerForDriveId(driveId));
		return this.dao.getPublicDrive(driveId, ensuredOwner);
	}

	async getPublicFolder({ folderId, owner }: GetPublicFolderParamsWeb): Promise<WebPublicFolder> {
		const ensuredOwner =
			owner ?? (await this.dao.getDriveIdForFolderId(folderId).then((d) => this.dao.getOwnerForDriveId(d)));
		if (!ensuredOwner) throw new Error('Could not determine owner for folder');
		return this.dao.getPublicFolder(folderId, ensuredOwner);
	}

	async getPublicFile({ fileId, owner }: GetPublicFileParamsWeb): Promise<WebPublicFile> {
		const ensuredOwner =
			owner ?? (await this.dao.getDriveIdForFileId(fileId).then((d) => this.dao.getOwnerForDriveId(d)));
		if (!ensuredOwner) throw new Error('Could not determine owner for file');
		return this.dao.getPublicFile(fileId, ensuredOwner);
	}

	async listPublicFolder({ folderId, owner, maxDepth = 0, includeRoot = false }: ListPublicFolderParamsWeb) {
		const ensuredOwner =
			owner ?? (await this.dao.getDriveIdForFolderId(folderId).then((d) => this.dao.getOwnerForDriveId(d)));
		if (!ensuredOwner) throw new Error('Could not determine owner for folder listing');
		return this.dao.listPublicFolder({ folderId, owner: ensuredOwner, maxDepth, includeRoot });
	}

	async downloadPublicFileBytes(fileId: string): Promise<Uint8Array> {
		const file = await this.getPublicFile({ fileId });
		return this.dao.getPublicData(file.dataTxId);
	}
}
