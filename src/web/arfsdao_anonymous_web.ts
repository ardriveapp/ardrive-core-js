/* Minimal browser-friendly ArFS anonymous DAO (read-only). */
import type { GQLEdgeInterface, GQLNodeInterface, GQLTagInterface } from '../types/gql_Types';
import { buildQuery, ASCENDING_ORDER } from '../utils/query';
import { ADDR } from '../types/arweave_address';
import { GatewayAPIWeb } from './gateway_api_web';

export interface WebPublicDrive {
	driveId: string;
	name: string;
	rootFolderId: string;
	txId: string;
	unixTime: number;
	appName: string;
	appVersion?: string;
	arFS: string;
}

export interface WebPublicFolder {
	entityType: 'folder';
	entityId: string;
	folderId: string;
	parentFolderId?: string; // root folders omit parent
	name: string;
	driveId: string;
	txId: string;
	unixTime: number;
	appName: string;
	appVersion?: string;
	arFS: string;
}

export interface WebPublicFile {
	entityType: 'file';
	entityId: string;
	fileId: string;
	parentFolderId: string;
	name: string;
	size: number;
	lastModifiedDate: number;
	dataTxId: string;
	dataContentType: string;
	driveId: string;
	txId: string;
	unixTime: number;
	appName: string;
	appVersion?: string;
	arFS: string;
}

export type WebPublicEntity = WebPublicFolder | WebPublicFile;

const td = new TextDecoder();

function tagsToRecord(tags: GQLTagInterface[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const { name, value } of tags) out[name] = value;
	return out;
}

function decodeJson(bytes: Uint8Array): Record<string, unknown> {
	return JSON.parse(td.decode(bytes)) as Record<string, unknown>;
}

export class ArFSDAOAnonymousWeb {
	constructor(private gatewayApi: GatewayAPIWeb) {}

	async getOwnerForDriveId(driveId: string): Promise<string> {
		const gqlQuery = buildQuery({
			tags: [
				{ name: 'Drive-Id', value: driveId },
				{ name: 'Entity-Type', value: 'drive' }
			],
			sort: ASCENDING_ORDER
		});
		const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
		const edges: GQLEdgeInterface[] = transactions.edges;
		if (!edges.length) throw new Error(`Drive not found: ${driveId}`);
		return edges[0].node.owner.address;
	}

	async getDriveIdForFolderId(folderId: string): Promise<string> {
		const gqlQuery = buildQuery({ tags: [{ name: 'Folder-Id', value: folderId }] });
		const txs = await this.gatewayApi.gqlRequest(gqlQuery);
		const edge = txs.edges[0];
		if (!edge) throw new Error(`Folder not found: ${folderId}`);
		const driveIdTag = edge.node.tags.find((t) => t.name === 'Drive-Id');
		if (!driveIdTag) throw new Error(`No Drive-Id tag for folder: ${folderId}`);
		return driveIdTag.value;
	}

	async getDriveIdForFileId(fileId: string): Promise<string> {
		const gqlQuery = buildQuery({ tags: [{ name: 'File-Id', value: fileId }] });
		const txs = await this.gatewayApi.gqlRequest(gqlQuery);
		const edge = txs.edges[0];
		if (!edge) throw new Error(`File not found: ${fileId}`);
		const driveIdTag = edge.node.tags.find((t) => t.name === 'Drive-Id');
		if (!driveIdTag) throw new Error(`No Drive-Id tag for file: ${fileId}`);
		return driveIdTag.value;
	}

	async getPublicDrive(driveId: string, owner: string): Promise<WebPublicDrive> {
		const gqlQuery = buildQuery({
			tags: [
				{ name: 'Drive-Id', value: driveId },
				{ name: 'Entity-Type', value: 'drive' },
				{ name: 'Drive-Privacy', value: 'public' }
			],
			owner: ADDR(owner)
		});
		const txs = await this.gatewayApi.gqlRequest(gqlQuery);
		const node = txs.edges[0]?.node as GQLNodeInterface | undefined;
		if (!node) throw new Error(`Public drive not found: ${driveId}`);
		const tags = tagsToRecord(node.tags);
		const data = decodeJson(await this.gatewayApi.getTxData(node.id));
		return {
			driveId,
			name: data.name as string,
			rootFolderId: data.rootFolderId as string,
			txId: node.id,
			unixTime: Number(tags['Unix-Time'] ?? 0),
			appName: tags['App-Name'],
			appVersion: tags['App-Version'],
			arFS: tags['ArFS']
		};
	}

	async getPublicFolder(folderId: string, owner: string): Promise<WebPublicFolder> {
		const gqlQuery = buildQuery({
			tags: [
				{ name: 'Folder-Id', value: folderId },
				{ name: 'Entity-Type', value: 'folder' }
			],
			owner: ADDR(owner)
		});
		const txs = await this.gatewayApi.gqlRequest(gqlQuery);
		const node = txs.edges[0]?.node as GQLNodeInterface | undefined;
		if (!node) throw new Error(`Public folder not found: ${folderId}`);
		const tags = tagsToRecord(node.tags);
		const data = decodeJson(await this.gatewayApi.getTxData(node.id));
		return {
			entityType: 'folder',
			entityId: folderId,
			folderId,
			parentFolderId: tags['Parent-Folder-Id'],
			name: data.name as string,
			driveId: tags['Drive-Id'],
			txId: node.id,
			unixTime: Number(tags['Unix-Time'] ?? 0),
			appName: tags['App-Name'],
			appVersion: tags['App-Version'],
			arFS: tags['ArFS']
		};
	}

	async getPublicFile(fileId: string, owner: string): Promise<WebPublicFile> {
		const gqlQuery = buildQuery({
			tags: [
				{ name: 'File-Id', value: fileId },
				{ name: 'Entity-Type', value: 'file' }
			],
			owner: ADDR(owner)
		});
		const txs = await this.gatewayApi.gqlRequest(gqlQuery);
		const node = txs.edges[0]?.node as GQLNodeInterface | undefined;
		if (!node) throw new Error(`Public file not found: ${fileId}`);
		const tags = tagsToRecord(node.tags);
		const data = decodeJson(await this.gatewayApi.getTxData(node.id));
		return {
			entityType: 'file',
			entityId: fileId,
			fileId,
			parentFolderId: tags['Parent-Folder-Id'],
			name: data.name as string,
			size: Number(data.size),
			lastModifiedDate: Number(data.lastModifiedDate),
			dataTxId: data.dataTxId as string,
			dataContentType: (data.dataContentType as string) ?? 'application/octet-stream',
			driveId: tags['Drive-Id'],
			txId: node.id,
			unixTime: Number(tags['Unix-Time'] ?? 0),
			appName: tags['App-Name'],
			appVersion: tags['App-Version'],
			arFS: tags['ArFS']
		};
	}

	async getPublicData(fileTxId: string): Promise<Uint8Array> {
		return this.gatewayApi.getTxData(fileTxId);
	}

	async listPublicFolder(params: {
		folderId: string;
		owner: string;
		maxDepth?: number; // inclusive depth starting at folderId
		includeRoot?: boolean;
	}): Promise<WebPublicEntity[]> {
		const { folderId, owner, maxDepth = Number.MAX_SAFE_INTEGER, includeRoot = false } = params;
		const driveId = await this.getDriveIdForFolderId(folderId);

		// 1) Fetch all folders for drive
		const allFolders: WebPublicFolder[] = [];
		let cursor = '';
		let hasNext = true;
		while (hasNext) {
			const q = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: driveId },
					{ name: 'Entity-Type', value: 'folder' }
				],
				cursor,
				owner: ADDR(owner)
			});
			const res = await this.gatewayApi.gqlRequest(q);
			hasNext = res.pageInfo.hasNextPage;
			for (const edge of res.edges) {
				cursor = edge.cursor;
				const node = edge.node;
				const tags = tagsToRecord(node.tags);
				const data = decodeJson(await this.gatewayApi.getTxData(node.id));
				const entity: WebPublicFolder = {
					entityType: 'folder',
					entityId: tags['Folder-Id'],
					folderId: tags['Folder-Id'],
					parentFolderId: tags['Parent-Folder-Id'],
					name: data.name as string,
					driveId: tags['Drive-Id'],
					txId: node.id,
					unixTime: Number(tags['Unix-Time'] ?? 0),
					appName: tags['App-Name'],
					appVersion: tags['App-Version'],
					arFS: tags['ArFS']
				};
				allFolders.push(entity);
			}
		}

		// 2) Compute subtree folder IDs to depth
		const subIds: string[] = [];
		const queue: Array<{ id: string; depth: number }> = [{ id: folderId, depth: 0 }];
		while (queue.length) {
			const { id, depth } = queue.shift()!;
			subIds.push(id);
			if (depth >= maxDepth!) continue;
			const children = allFolders.filter((f) => (f.parentFolderId ?? '') === id);
			for (const c of children) queue.push({ id: c.folderId, depth: depth + 1 });
		}

		// 3) Collect folders
		const result: WebPublicEntity[] = [];
		const rootFolders = allFolders.filter((f) => f.folderId === folderId);
		if (includeRoot && rootFolders.length) result.push(...rootFolders);
		for (const id of subIds) {
			if (id === folderId) continue;
			result.push(...allFolders.filter((f) => f.folderId === id));
		}

		// 4) Fetch files for subIds
		if (subIds.length) {
			cursor = '';
			hasNext = true;
			while (hasNext) {
				const q = buildQuery({
					tags: [
						{ name: 'Drive-Id', value: driveId },
						{ name: 'Parent-Folder-Id', value: subIds },
						{ name: 'Entity-Type', value: 'file' }
					],
					cursor,
					owner: ADDR(owner)
				});
				const res = await this.gatewayApi.gqlRequest(q);
				hasNext = res.pageInfo.hasNextPage;
				for (const edge of res.edges) {
					cursor = edge.cursor;
					const node = edge.node;
					const tags = tagsToRecord(node.tags);
					const data = decodeJson(await this.gatewayApi.getTxData(node.id));
					const file: WebPublicFile = {
						entityType: 'file',
						entityId: tags['File-Id'],
						fileId: tags['File-Id'],
						parentFolderId: tags['Parent-Folder-Id'],
						name: data.name as string,
						size: Number(data.size),
						lastModifiedDate: Number(data.lastModifiedDate),
						dataTxId: data.dataTxId as string,
						dataContentType: (data.dataContentType as string) ?? 'application/octet-stream',
						driveId: tags['Drive-Id'],
						txId: node.id,
						unixTime: Number(tags['Unix-Time'] ?? 0),
						appName: tags['App-Name'],
						appVersion: tags['App-Version'],
						arFS: tags['ArFS']
					};
					result.push(file);
				}
			}
		}
		return result;
	}
}
