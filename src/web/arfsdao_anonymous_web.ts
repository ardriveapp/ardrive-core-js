/* Minimal browser-friendly ArFS anonymous DAO (read-only). */
import type { GQLEdgeInterface, GQLNodeInterface, GQLTagInterface } from '../types/gql_Types';
import { buildQuery, ASCENDING_ORDER } from '../utils/query';
import { ADDR } from '../types/arweave_address';
import { ROOT_FOLDER_ID_PLACEHOLDER } from '../arfs/arfs_builders/arfs_folder_builders';
import { GatewayAPIWeb } from './gateway_api_web';
import type { CustomMetaDataGqlTags, CustomMetaDataJsonFields } from '../types';

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
	contentType?: string;
	customMetaDataGqlTags?: CustomMetaDataGqlTags;
	customMetaDataJson?: CustomMetaDataJsonFields;
	path?: string;
	txIdPath?: string;
	entityIdPath?: string;
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
	contentType?: string;
	customMetaDataGqlTags?: CustomMetaDataGqlTags;
	customMetaDataJson?: CustomMetaDataJsonFields;
	path?: string;
	txIdPath?: string;
	entityIdPath?: string;
}

export type WebPublicEntity = WebPublicFolder | WebPublicFile;

const td = new TextDecoder();

const COMMON_TAG_NAMES = new Set([
	'App-Name',
	'App-Version',
	'ArFS',
	'Content-Type',
	'Drive-Id',
	'Entity-Type',
	'Unix-Time',
	'Boost'
]);

const FOLDER_TAG_NAMES = new Set([...COMMON_TAG_NAMES, 'Folder-Id', 'Parent-Folder-Id']);
const FILE_TAG_NAMES = new Set([...COMMON_TAG_NAMES, 'File-Id', 'Parent-Folder-Id']);

const FOLDER_JSON_PROTECTED_KEYS = ['name'] as const;
const FILE_JSON_PROTECTED_KEYS = ['name', 'size', 'lastModifiedDate', 'dataTxId', 'dataContentType'] as const;

function collectCustomMetaDataGqlTags(
	tags: GQLTagInterface[],
	knownTagNames: Set<string>
): CustomMetaDataGqlTags | undefined {
	const custom: CustomMetaDataGqlTags = {};
	for (const { name, value } of tags) {
		if (knownTagNames.has(name)) {
			continue;
		}
		const existing = custom[name];
		if (existing === undefined) {
			custom[name] = value;
		} else if (Array.isArray(existing)) {
			custom[name] = [...existing, value];
		} else {
			custom[name] = [existing, value];
		}
	}
	return Object.keys(custom).length ? custom : undefined;
}

function collectCustomMetaDataJson(
	data: Record<string, unknown>,
	protectedKeys: readonly string[]
): CustomMetaDataJsonFields | undefined {
	const entries = Object.entries(data).filter(([key]) => !protectedKeys.includes(key));
	if (!entries.length) {
		return undefined;
	}
	const customMetaData: CustomMetaDataJsonFields = {};
	for (const [key, value] of entries) {
		customMetaData[key] = value as CustomMetaDataJsonFields[string];
	}
	return customMetaData;
}

function normalizeParentFolderId(parentFolderId?: string): string {
	return parentFolderId ?? ROOT_FOLDER_ID_PLACEHOLDER;
}

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

	/**
	 * Filters entities to keep only the latest revision of each entity ID.
	 * This matches the behavior of the node implementation's latestRevisionFilter.
	 */
	private filterLatestRevisions<T extends WebPublicFolder | WebPublicFile>(entities: T[]): T[] {
		const entityMap = new Map<string, T[]>();

		// Group entities by their entityId
		for (const entity of entities) {
			const id = entity.entityId;
			if (!entityMap.has(id)) {
				entityMap.set(id, []);
			}
			entityMap.get(id)!.push(entity);
		}

		// For each entity ID, keep only the latest revision (highest unixTime)
		const latestEntities: T[] = [];
		for (const [, revisions] of entityMap) {
			// Sort by unixTime descending to get the latest first
			revisions.sort((a, b) => b.unixTime - a.unixTime);
			latestEntities.push(revisions[0]);
		}

		return latestEntities;
	}

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
		const customMetaDataGqlTags = collectCustomMetaDataGqlTags(node.tags, FOLDER_TAG_NAMES);
		const data = decodeJson(await this.gatewayApi.getTxData(node.id));
		const customMetaDataJson = collectCustomMetaDataJson(data, FOLDER_JSON_PROTECTED_KEYS);
		const parentFolderId = normalizeParentFolderId(tags['Parent-Folder-Id']);
		return {
			entityType: 'folder',
			entityId: folderId,
			folderId,
			parentFolderId,
			name: data.name as string,
			driveId: tags['Drive-Id'],
			txId: node.id,
			unixTime: Number(tags['Unix-Time'] ?? 0),
			appName: tags['App-Name'],
			appVersion: tags['App-Version'],
			arFS: tags['ArFS'],
			contentType: tags['Content-Type'],
			...(customMetaDataGqlTags ? { customMetaDataGqlTags } : {}),
			...(customMetaDataJson ? { customMetaDataJson } : {})
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
		const customMetaDataGqlTags = collectCustomMetaDataGqlTags(node.tags, FILE_TAG_NAMES);
		const data = decodeJson(await this.gatewayApi.getTxData(node.id));
		const customMetaDataJson = collectCustomMetaDataJson(data, FILE_JSON_PROTECTED_KEYS);
		const parentFolderId = normalizeParentFolderId(tags['Parent-Folder-Id']);
		return {
			entityType: 'file',
			entityId: fileId,
			fileId,
			parentFolderId,
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
			arFS: tags['ArFS'],
			contentType: tags['Content-Type'],
			...(customMetaDataGqlTags ? { customMetaDataGqlTags } : {}),
			...(customMetaDataJson ? { customMetaDataJson } : {})
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
				const customMetaDataGqlTags = collectCustomMetaDataGqlTags(node.tags, FOLDER_TAG_NAMES);
				const data = decodeJson(await this.gatewayApi.getTxData(node.id));
				const customMetaDataJson = collectCustomMetaDataJson(data, FOLDER_JSON_PROTECTED_KEYS);
				const folderEntityId = tags['Folder-Id'];
				const parentFolderId = normalizeParentFolderId(tags['Parent-Folder-Id']);
				const folder: WebPublicFolder = {
					entityType: 'folder',
					entityId: folderEntityId,
					folderId: folderEntityId,
					parentFolderId,
					name: data.name as string,
					driveId: tags['Drive-Id'],
					txId: node.id,
					unixTime: Number(tags['Unix-Time'] ?? 0),
					appName: tags['App-Name'],
					appVersion: tags['App-Version'],
					arFS: tags['ArFS'],
					contentType: tags['Content-Type'] ?? 'application/json',
					...(customMetaDataGqlTags ? { customMetaDataGqlTags } : {}),
					...(customMetaDataJson ? { customMetaDataJson } : {})
				};
				allFolders.push(folder);
			}
		}

		const latestFolders = this.filterLatestRevisions(allFolders);
		const folderMap = new Map<string, WebPublicFolder>();
		for (const folder of latestFolders) {
			folderMap.set(folder.folderId, folder);
		}

		const folderPaths = new Map<string, { path: string; txIdPath: string; entityIdPath: string }>();
		const resolveFolderPaths = (id: string): { path: string; txIdPath: string; entityIdPath: string } => {
			const memoized = folderPaths.get(id);
			if (memoized) {
				return memoized;
			}
			const folder = folderMap.get(id);
			if (!folder) {
				throw new Error(`Missing folder metadata for ${id}`);
			}
			let derivedPaths: { path: string; txIdPath: string; entityIdPath: string };
			if (!folder.parentFolderId || folder.parentFolderId === ROOT_FOLDER_ID_PLACEHOLDER) {
				derivedPaths = {
					path: `/${folder.name}`,
					txIdPath: `/${folder.txId}`,
					entityIdPath: `/${folder.folderId}`
				};
			} else {
				const parentPaths = resolveFolderPaths(folder.parentFolderId);
				derivedPaths = {
					path: `${parentPaths.path}/${folder.name}`,
					txIdPath: `${parentPaths.txIdPath}/${folder.txId}`,
					entityIdPath: `${parentPaths.entityIdPath}/${folder.folderId}`
				};
			}
			folder.path = derivedPaths.path;
			folder.txIdPath = derivedPaths.txIdPath;
			folder.entityIdPath = derivedPaths.entityIdPath;
			folderPaths.set(id, derivedPaths);
			return derivedPaths;
		};

		for (const folder of latestFolders) {
			resolveFolderPaths(folder.folderId);
		}

		const subIds: string[] = [];
		const queue: Array<{ id: string; depth: number }> = [{ id: folderId, depth: 0 }];
		while (queue.length) {
			const { id, depth } = queue.shift()!;
			subIds.push(id);
			if (depth >= maxDepth) {
				continue;
			}
			const children = latestFolders.filter((f) => f.parentFolderId === id);
			for (const child of children) {
				queue.push({ id: child.folderId, depth: depth + 1 });
			}
		}

		const folderResults: WebPublicFolder[] = [];
		if (includeRoot) {
			const rootFolder = folderMap.get(folderId);
			if (rootFolder) {
				folderResults.push(rootFolder);
			}
		}
		for (const id of subIds) {
			if (id === folderId) {
				continue;
			}
			const folder = folderMap.get(id);
			if (folder) {
				folderResults.push(folder);
			}
		}

		const fileResults: WebPublicFile[] = [];
		if (subIds.length) {
			const allFiles: WebPublicFile[] = [];
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
					const customMetaDataGqlTags = collectCustomMetaDataGqlTags(node.tags, FILE_TAG_NAMES);
					const data = decodeJson(await this.gatewayApi.getTxData(node.id));
					const customMetaDataJson = collectCustomMetaDataJson(data, FILE_JSON_PROTECTED_KEYS);
					const fileParentFolderId = tags['Parent-Folder-Id'];
					if (!fileParentFolderId) {
						continue;
					}
					const fileIdTag = tags['File-Id'];
					const file: WebPublicFile = {
						entityType: 'file',
						entityId: fileIdTag,
						fileId: fileIdTag,
						parentFolderId: fileParentFolderId,
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
						arFS: tags['ArFS'],
						contentType: tags['Content-Type'] ?? 'application/json',
						...(customMetaDataGqlTags ? { customMetaDataGqlTags } : {}),
						...(customMetaDataJson ? { customMetaDataJson } : {})
					};
					const parentPaths = resolveFolderPaths(fileParentFolderId);
					file.path = `${parentPaths.path}/${file.name}`;
					file.txIdPath = `${parentPaths.txIdPath}/${file.txId}`;
					file.entityIdPath = `${parentPaths.entityIdPath}/${file.fileId}`;
					allFiles.push(file);
				}
			}
			const latestFiles = this.filterLatestRevisions(allFiles);
			fileResults.push(...latestFiles);
		}

		const combined: WebPublicEntity[] = [...folderResults, ...fileResults];
		combined.sort((a, b) => (a.path ?? '').localeCompare(b.path ?? ''));
		return combined;
	}
}
