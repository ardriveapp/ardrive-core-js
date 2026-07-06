/* eslint-disable no-console */
import Arweave from 'arweave';
import {
	ArFSAllPublicFoldersOfDriveParams,
	ArFSListPublicFolderParams,
	ArFSDownloadPublicFolderParams,
	EntityID,
	GQLEdgeInterface,
	GQLNodeInterface,
	TransactionID,
	TxID
} from '../types';
import { ASCENDING_ORDER, buildQuery } from '../utils/query';
import { DriveID, FolderID, FileID, AnyEntityID, ArweaveAddress, EID, ADDR } from '../types';
import {
	buildDriveHistoryComposite,
	buildSnapshotQuery,
	computeSnapshotSubRanges,
	parseSnapshotData,
	snapshotEntityFromGQLNode,
	sortNodesNewestFirst,
	SnapshotWithBody,
	TailQueryBound
} from '../snapshots';
import { latestRevisionFilter, latestRevisionFilterForDrives } from '../utils/filter_methods';
import { FolderHierarchy } from './folder_hierarchy';
import { ArFSPublicDriveBuilder, SafeArFSDriveBuilder } from './arfs_builders/arfs_drive_builders';
import { ArFSPublicFolderBuilder } from './arfs_builders/arfs_folder_builders';
import { ArFSPublicFileBuilder } from './arfs_builders/arfs_file_builders';
import { ArFSDriveEntity, ArFSPublicDrive, ArFSPublicFile, ArFSPublicFolder } from './arfs_entities';
import { PrivateKeyData } from './private_key_data';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION } from '../utils/constants';
import axios, { AxiosRequestConfig } from 'axios';
import { Readable } from 'stream';
import { join as joinPath } from 'path';
import { ArFSPublicFileToDownload, ArFSFolderToDownload } from './arfs_file_wrapper';
import { PromiseCache } from '@ardrive/ardrive-promise-cache';
import { alphabeticalOrder } from '../utils/sort_functions';
import { ArFSPublicFileWithPaths, ArFSPublicFolderWithPaths, publicEntityWithPathsFactory } from './arfs_entities';
import { gatewayUrlForArweave } from '../utils/common_browser';
import { GatewayAPI } from '../utils/gateway_api';
import { InvalidFileStateException } from '../types/exceptions';

export abstract class ArFSDAOType {
	protected abstract readonly arweave: Arweave;
	protected abstract readonly appName: string;
	protected abstract readonly appVersion: string;
}

export interface ArFSPublicDriveCacheKey {
	driveId: DriveID;
	owner: ArweaveAddress;
}

export interface ArFSPublicFolderCacheKey {
	folderId: FolderID;
	owner: ArweaveAddress;
}

export interface ArFSPublicFileCacheKey {
	fileId: FileID;
	owner: ArweaveAddress;
}

export interface ArFSAnonymousCache {
	ownerCache: PromiseCache<DriveID, ArweaveAddress>;
	driveIdCache: PromiseCache<EntityID, DriveID>;
	publicDriveCache: PromiseCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>;
	publicFolderCache: PromiseCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>;
	publicFileCache: PromiseCache<ArFSPublicFileCacheKey, ArFSPublicFile>;
}

export const defaultCacheParams = {
	cacheCapacity: 10,
	cacheTTL: 1000 * 60 * 60 * 24 * 365 // 1 year
};

export const defaultArFSAnonymousCache: ArFSAnonymousCache = {
	ownerCache: new PromiseCache<DriveID, ArweaveAddress>(defaultCacheParams),
	driveIdCache: new PromiseCache<EntityID, DriveID>(defaultCacheParams),
	publicDriveCache: new PromiseCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>(defaultCacheParams),
	publicFolderCache: new PromiseCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>(defaultCacheParams),
	publicFileCache: new PromiseCache<ArFSPublicFileCacheKey, ArFSPublicFile>(defaultCacheParams)
};

/**
 * Performs all ArFS spec operations that do NOT require a wallet for signing or decryption
 */
export class ArFSDAOAnonymous extends ArFSDAOType {
	constructor(
		protected readonly arweave: Arweave,
		/** @deprecated App Name is an unused parameter on anonymous ArFSDAO */
		protected appName = DEFAULT_APP_NAME,
		/** @deprecated App Version is an unused parameter on anonymous ArFSDAO */
		protected appVersion = DEFAULT_APP_VERSION as string,
		protected caches = defaultArFSAnonymousCache,
		protected gatewayApi = new GatewayAPI({ gatewayUrl: gatewayUrlForArweave(arweave) })
	) {
		super();
	}

	public async getOwnerForDriveId(driveId: DriveID): Promise<ArweaveAddress> {
		const cachedOwner = this.caches.ownerCache.get(driveId);
		if (cachedOwner) {
			return cachedOwner;
		}

		return this.caches.ownerCache.put(
			driveId,
			(async () => {
				const gqlQuery = buildQuery({
					tags: [
						{ name: 'Drive-Id', value: `${driveId}` },
						{ name: 'Entity-Type', value: 'drive' }
					],
					sort: ASCENDING_ORDER
				});
				const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
				const edges: GQLEdgeInterface[] = transactions.edges;

				if (!edges.length) {
					throw new Error(`Could not find a transaction with "Drive-Id": ${driveId}`);
				}

				const edgeOfFirstDrive = edges[0];
				const driveOwnerAddress = edgeOfFirstDrive.node.owner.address;
				const driveOwner = ADDR(driveOwnerAddress);
				return driveOwner;
			})()
		);
	}

	async getDriveIDForEntityId(entityId: AnyEntityID, gqlTypeTag: 'File-Id' | 'Folder-Id'): Promise<DriveID> {
		const cachedDriveID = this.caches.driveIdCache.get(entityId);
		if (cachedDriveID) {
			return cachedDriveID;
		}

		return this.caches.driveIdCache.put(
			entityId,
			(async () => {
				const gqlQuery = buildQuery({ tags: [{ name: gqlTypeTag, value: `${entityId}` }] });

				const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
				const edges: GQLEdgeInterface[] = transactions.edges;

				if (!edges.length) {
					throw new Error(`Entity with ${gqlTypeTag} ${entityId} not found!`);
				}

				const driveIdTag = edges[0].node.tags.find((t) => t.name === 'Drive-Id');
				if (driveIdTag) {
					return EID(driveIdTag.value);
				}

				throw new Error(`No Drive-Id tag found for meta data transaction of ${gqlTypeTag}: ${entityId}`);
			})()
		);
	}

	async getDriveOwnerForFolderId(folderId: FolderID): Promise<ArweaveAddress> {
		return this.getOwnerForDriveId(await this.getDriveIdForFolderId(folderId));
	}

	async getDriveOwnerForFileId(fileId: FileID): Promise<ArweaveAddress> {
		return this.getOwnerForDriveId(await this.getDriveIdForFileId(fileId));
	}

	async getDriveIdForFileId(fileId: FileID): Promise<DriveID> {
		return this.getDriveIDForEntityId(fileId, 'File-Id');
	}

	async getDriveIdForFolderId(folderId: FolderID): Promise<DriveID> {
		return this.getDriveIDForEntityId(folderId, 'Folder-Id');
	}

	// Convenience function for known-public use cases
	async getPublicDrive(driveId: DriveID, owner: ArweaveAddress): Promise<ArFSPublicDrive> {
		const cacheKey = { driveId, owner };
		const cachedDrive = this.caches.publicDriveCache.get(cacheKey);
		if (cachedDrive) {
			return cachedDrive;
		}
		return this.caches.publicDriveCache.put(
			cacheKey,
			new ArFSPublicDriveBuilder({
				entityId: driveId,
				gatewayApi: this.gatewayApi,
				owner
			}).build()
		);
	}

	// Convenience function for known-private use cases
	async getPublicFolder(folderId: FolderID, owner: ArweaveAddress): Promise<ArFSPublicFolder> {
		const cacheKey = { folderId, owner };
		const cachedFolder = this.caches.publicFolderCache.get(cacheKey);
		if (cachedFolder) {
			return cachedFolder;
		}
		return this.caches.publicFolderCache.put(
			cacheKey,
			new ArFSPublicFolderBuilder({
				entityId: folderId,
				gatewayApi: this.gatewayApi,
				owner
			}).build()
		);
	}

	async getPublicFile(fileId: FileID, owner: ArweaveAddress): Promise<ArFSPublicFile> {
		const cacheKey = { fileId, owner };
		const cachedFile = this.caches.publicFileCache.get(cacheKey);
		if (cachedFile) {
			return cachedFile;
		}
		return this.caches.publicFileCache.put(
			cacheKey,
			new ArFSPublicFileBuilder({
				entityId: fileId,
				gatewayApi: this.gatewayApi,
				owner
			}).build()
		);
	}

	async getAllDrivesForAddress(
		address: ArweaveAddress,
		privateKeyData: PrivateKeyData,
		latestRevisionsOnly = true
	): Promise<ArFSDriveEntity[]> {
		let cursor = '';
		let hasNextPage = true;
		const allDrives: ArFSDriveEntity[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({ tags: [{ name: 'Entity-Type', value: 'drive' }], cursor, owner: address });

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;

			const drives: Promise<ArFSDriveEntity>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;

				const driveBuilder = SafeArFSDriveBuilder.fromArweaveNode(node, this.gatewayApi, privateKeyData);
				const drive = await driveBuilder.build(node);
				if (drive.drivePrivacy === 'public') {
					const cacheKey = { driveId: drive.driveId, owner: address };
					return this.caches.publicDriveCache.put(cacheKey, Promise.resolve(drive as ArFSPublicDrive));
				} else {
					// TODO: No access to private drive cache from here
					return Promise.resolve(drive);
				}
			});

			allDrives.push(...(await Promise.all(drives)));
		}

		return latestRevisionsOnly ? allDrives.filter(latestRevisionFilterForDrives) : allDrives;
	}

	async getPublicFilesWithParentFolderIds(
		folderIDs: FolderID[],
		owner: ArweaveAddress,
		driveId: DriveID,
		latestRevisionsOnly = false
	): Promise<ArFSPublicFile[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: ArFSPublicFile[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Parent-Folder-Id', value: folderIDs.map((fid) => fid.toString()) },
					{ name: 'Entity-Type', value: 'file' }
				],
				cursor,
				owner
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			const files: Promise<ArFSPublicFile | null>[] = edges.map(async (edge: GQLEdgeInterface) => {
				try {
					const { node } = edge;
					cursor = edge.cursor;
					const fileBuilder = ArFSPublicFileBuilder.fromArweaveNode(node, this.gatewayApi);
					const file = await fileBuilder.build(node);
					const cacheKey = { fileId: file.fileId, owner };
					return this.caches.publicFileCache.put(cacheKey, Promise.resolve(file));
				} catch (e) {
					// If the file is broken, skip it
					if (e instanceof SyntaxError) {
						console.error(`Error building file. Skipping... Error: ${e}`);
						return null;
					}

					if (e instanceof InvalidFileStateException) {
						console.error(`Error building file. Skipping... Error: ${e}`);
						return null;
					}

					throw e;
				}
			});

			const validFiles = (await Promise.all(files)).filter((f) => f !== null) as ArFSPublicFile[];

			allFiles.push(...validFiles);
		}
		return latestRevisionsOnly ? allFiles.filter(latestRevisionFilter) : allFiles;
	}

	async getAllFoldersOfPublicDrive({
		driveId,
		owner,
		latestRevisionsOnly = false
	}: ArFSAllPublicFoldersOfDriveParams): Promise<ArFSPublicFolder[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFolders: ArFSPublicFolder[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Entity-Type', value: 'folder' }
				],
				cursor,
				owner
			});

			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			const { edges } = transactions;

			hasNextPage = transactions.pageInfo.hasNextPage;
			const folderPromises = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				try {
					const folderBuilder = ArFSPublicFolderBuilder.fromArweaveNode(node, this.gatewayApi);
					const folder = await folderBuilder.build(node);
					const cacheKey = { folderId: folder.entityId, owner };
					await this.caches.publicFolderCache.put(cacheKey, Promise.resolve(folder));
					return folder;
				} catch (e) {
					// If the folder is broken, skip it
					if (e instanceof SyntaxError) {
						console.error(`Error building folder. Skipping... Error: ${e}`);
						return null;
					}

					throw e;
				}
			});

			const folders = await Promise.all(folderPromises);

			// Filter out null values
			const validFolders = folders.filter((folder) => folder !== null) as ArFSPublicFolder[];

			allFolders.push(...validFolders);
		}
		return latestRevisionsOnly ? allFolders.filter(latestRevisionFilter) : allFolders;
	}

	/**
	 * Whether the snapshot-accelerated listing path is enabled. Default ON; a caller
	 * can opt out per-listing (`useSnapshots: false`) or globally via the
	 * `ARDRIVE_DISABLE_SNAPSHOTS=1` environment flag. The full-replay FALLBACK is the
	 * real safety net — this flag only lets callers force the legacy path.
	 */
	protected snapshotsEnabled(useSnapshots?: boolean): boolean {
		if (process.env['ARDRIVE_DISABLE_SNAPSHOTS'] === '1') {
			return false;
		}
		return useSnapshots !== false;
	}

	/**
	 * Enumerates a drive's snapshots (owner-scoped, newest first) and parses the
	 * bodies of the snapshots that own a live sub-range under the newest-wins model.
	 *
	 * Returns `null` when the drive has NO snapshots — the caller must full-replay.
	 * THROWS when a snapshot that owns a range cannot be fetched or parsed; the caller
	 * MUST catch and fall back to full replay, since a partial snapshot set would list
	 * an incomplete tree. Snapshots are an optimization, never a correctness dependency.
	 */
	protected async fetchDriveSnapshotsWithBodies(
		driveId: DriveID,
		owner: ArweaveAddress
	): Promise<SnapshotWithBody[] | null> {
		// 1. Enumerate the drive's snapshot transactions (owner-scoped, HEIGHT_DESC).
		const snapshotNodes: GQLNodeInterface[] = [];
		let cursor: string | undefined = undefined;
		let hasNextPage = true;
		while (hasNextPage) {
			const gqlQuery = buildSnapshotQuery({ driveId, owner, cursor });
			const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
			hasNextPage = transactions.pageInfo.hasNextPage;
			for (const edge of transactions.edges) {
				cursor = edge.cursor;
				snapshotNodes.push(edge.node);
			}
		}

		if (snapshotNodes.length === 0) {
			return null;
		}

		// 2. Parse snapshot metadata; skip malformed ones. No valid snapshot → full replay.
		const entities = snapshotNodes
			.map((node) => snapshotEntityFromGQLNode(node))
			.filter((entity): entity is NonNullable<typeof entity> => entity !== null);
		if (entities.length === 0) {
			return null;
		}

		// Order newest-first (mining height desc) — the order the obscuring model expects.
		entities.sort((a, b) => (b.blockHeight ?? b.blockEnd) - (a.blockHeight ?? a.blockEnd));

		// 3. Only the snapshots that own live sub-ranges need their (large) bodies fetched.
		const { obscured } = computeSnapshotSubRanges(entities);
		const snapshots: SnapshotWithBody[] = [];
		for (const { snapshot, subRanges } of obscured) {
			if (subRanges.rangeSegments.length === 0) {
				// Fully obscured by a newer snapshot — no body needed.
				snapshots.push({
					blockStart: snapshot.blockStart,
					blockEnd: snapshot.blockEnd,
					txId: snapshot.txId,
					data: { txSnapshots: [] }
				});
				continue;
			}

			// Throwing here signals the caller to fall back to full replay (zero regression).
			const bodyBuffer = await this.gatewayApi.getTxData(snapshot.txId);
			const data = parseSnapshotData(bodyBuffer);
			if (data.txSnapshots.length === 0) {
				throw new Error(`Snapshot ${snapshot.txId} body was empty or unparseable`);
			}
			snapshots.push({
				blockStart: snapshot.blockStart,
				blockEnd: snapshot.blockEnd,
				txId: snapshot.txId,
				data
			});
		}

		return snapshots;
	}

	/**
	 * Fetches the live-tail entity nodes over the given block bounds, drive-wide.
	 * Files and folders are fetched together (`Entity-Type in [file, folder]`) so the
	 * tail costs ONE paged query per bound rather than two — this is where the snapshot
	 * path claws back GraphQL requests versus the full-replay path's per-folder walk.
	 */
	protected async getSnapshotTailNodes(
		driveId: DriveID,
		owner: ArweaveAddress,
		entityTypes: ('file' | 'folder')[],
		tailBounds: TailQueryBound[]
	): Promise<GQLNodeInterface[]> {
		const nodes: GQLNodeInterface[] = [];
		for (const bound of tailBounds) {
			let cursor = '';
			let hasNextPage = true;
			while (hasNextPage) {
				const gqlQuery = buildQuery({
					tags: [
						{ name: 'Drive-Id', value: `${driveId}` },
						{ name: 'Entity-Type', value: entityTypes }
					],
					cursor,
					owner,
					minBlockHeight: bound.minBlockHeight,
					maxBlockHeight: bound.maxBlockHeight
				});
				const transactions = await this.gatewayApi.gqlRequest(gqlQuery);
				hasNextPage = transactions.pageInfo.hasNextPage;
				for (const edge of transactions.edges) {
					cursor = edge.cursor;
					nodes.push(edge.node);
				}
			}
		}
		return nodes;
	}

	private async buildPublicFoldersFromNodes(
		nodes: GQLNodeInterface[],
		owner: ArweaveAddress
	): Promise<ArFSPublicFolder[]> {
		const folderPromises = nodes.map(async (node) => {
			try {
				const folderBuilder = ArFSPublicFolderBuilder.fromArweaveNode(node, this.gatewayApi);
				const folder = await folderBuilder.build(node);
				const cacheKey = { folderId: folder.entityId, owner };
				await this.caches.publicFolderCache.put(cacheKey, Promise.resolve(folder));
				return folder;
			} catch (e) {
				// Match the full-replay path's skip semantics so the entity SET is identical.
				if (e instanceof SyntaxError) {
					console.error(`Error building folder. Skipping... Error: ${e}`);
					return null;
				}
				throw e;
			}
		});
		const folders = await Promise.all(folderPromises);
		return folders.filter((folder) => folder !== null) as ArFSPublicFolder[];
	}

	private async buildPublicFilesFromNodes(
		nodes: GQLNodeInterface[],
		owner: ArweaveAddress
	): Promise<ArFSPublicFile[]> {
		const filePromises = nodes.map(async (node) => {
			try {
				const fileBuilder = ArFSPublicFileBuilder.fromArweaveNode(node, this.gatewayApi);
				const file = await fileBuilder.build(node);
				const cacheKey = { fileId: file.fileId, owner };
				return this.caches.publicFileCache.put(cacheKey, Promise.resolve(file));
			} catch (e) {
				// Match the full-replay path's skip semantics so the entity SET is identical.
				if (e instanceof SyntaxError || e instanceof InvalidFileStateException) {
					console.error(`Error building file. Skipping... Error: ${e}`);
					return null;
				}
				throw e;
			}
		});
		const files = await Promise.all(filePromises);
		return files.filter((file) => file !== null) as ArFSPublicFile[];
	}

	/**
	 * Snapshot-accelerated whole-drive entity fetch. Returns every file and folder
	 * revision of the drive (the caller applies `latestRevisionFilter`), sourced from
	 * snapshot bodies for the snapshot-covered heights and from the live GraphQL tail
	 * for the rest. Returns `null` when the drive has no snapshots (→ full replay).
	 * THROWS on any snapshot fetch/parse failure (→ caller falls back to full replay).
	 */
	protected async getPublicDriveEntitiesViaSnapshots(
		driveId: DriveID,
		owner: ArweaveAddress
	): Promise<{ folders: ArFSPublicFolder[]; files: ArFSPublicFile[] } | null> {
		const snapshots = await this.fetchDriveSnapshotsWithBodies(driveId, owner);
		if (snapshots === null) {
			return null;
		}

		const composite = buildDriveHistoryComposite({
			snapshotsNewestFirst: snapshots,
			owner,
			isPrivate: false
		});

		// Seed the metadata cache so snapshot entities build without a data-tx GET.
		for (const entry of composite.metadataCache) {
			this.gatewayApi.cacheMetadataForTxId(TxID(entry.txId), entry.data);
		}

		// Fetch the live tail (heights no snapshot covers), drive-wide, over GraphQL.
		const tailNodes = await this.getSnapshotTailNodes(driveId, owner, ['folder', 'file'], composite.tailBounds);

		const isFolder = (node: GQLNodeInterface): boolean =>
			node.tags?.find((tag) => tag.name === 'Entity-Type')?.value === 'folder';
		const isFile = (node: GQLNodeInterface): boolean =>
			node.tags?.find((tag) => tag.name === 'Entity-Type')?.value === 'file';

		// Merge snapshot + tail nodes and order newest-first for correct latest-revision selection.
		const folderNodes = sortNodesNewestFirst([
			...tailNodes.filter(isFolder),
			...composite.snapshotNodes.filter(isFolder)
		]);
		const fileNodes = sortNodesNewestFirst([
			...tailNodes.filter(isFile),
			...composite.snapshotNodes.filter(isFile)
		]);

		const [folders, files] = await Promise.all([
			this.buildPublicFoldersFromNodes(folderNodes, owner),
			this.buildPublicFilesFromNodes(fileNodes, owner)
		]);

		return { folders, files };
	}

	/**
	 * Lists the children of certain public folder
	 * @param {FolderID} folderId the folder ID to list children of
	 * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
	 * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
	 * @returns {ArFSPublicFileOrFolderWithPaths[]} an array representation of the children and parent folder
	 */
	async listPublicFolder({
		folderId,
		maxDepth,
		includeRoot,
		owner,
		useSnapshots
	}: ArFSListPublicFolderParams): Promise<(ArFSPublicFolderWithPaths | ArFSPublicFileWithPaths)[]> {
		if (!Number.isInteger(maxDepth) || maxDepth < 0) {
			throw new Error('maxDepth should be a non-negative integer!');
		}

		const folder = await this.getPublicFolder(folderId, owner);

		// Fetch all of the folder entities within the drive
		const driveIdOfFolder = folder.driveId;

		// SNAPSHOT-ACCELERATED PATH (isolated). Any failure or the absence of snapshots
		// transparently falls back to the full-history replay below — a drive without
		// snapshots, and any snapshot failure, lists EXACTLY as it does today.
		let snapshotEntities: { folders: ArFSPublicFolder[]; files: ArFSPublicFile[] } | null = null;
		if (this.snapshotsEnabled(useSnapshots)) {
			try {
				snapshotEntities = await this.getPublicDriveEntitiesViaSnapshots(driveIdOfFolder, owner);
			} catch (e) {
				console.error(`[snapshot] falling back to full-history replay for drive ${driveIdOfFolder}: ${e}`);
				snapshotEntities = null;
			}
		}

		const allFolderEntitiesOfDrive = snapshotEntities
			? snapshotEntities.folders.filter(latestRevisionFilter)
			: await this.getAllFoldersOfPublicDrive({
					driveId: driveIdOfFolder,
					owner,
					latestRevisionsOnly: true
				});

		// Feed entities to FolderHierarchy
		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth);
		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth + 1);

		const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.some((fid) => fid.equals(folder.entityId))
		);

		if (includeRoot) {
			childrenFolderEntities.unshift(folder);
		}

		// Fetch all file entities within all Folders of the drive
		const childrenFileEntities: ArFSPublicFile[] = [];

		if (snapshotEntities) {
			// Files were already fetched drive-wide; keep those parented within the search subtree.
			for (const file of snapshotEntities.files) {
				if (searchFolderIDs.some((fid) => fid.equals(file.parentFolderId))) {
					childrenFileEntities.push(file);
				}
			}
		} else {
			for (const id of searchFolderIDs) {
				(await this.getPublicFilesWithParentFolderIds([id], owner, driveIdOfFolder, true)).forEach((e) => {
					childrenFileEntities.push(e);
				});
			}
		}

		// Deduplicate files by entityId - when a file is moved, it appears in multiple parent folders
		// Keep only the latest revision (highest unixTime) for each unique fileId
		const uniqueFiles = childrenFileEntities.filter(latestRevisionFilter);

		const children: (ArFSPublicFolder | ArFSPublicFile)[] = [];
		for (const en of childrenFolderEntities) {
			children.push(en);
		}
		for (const en of uniqueFiles) {
			children.push(en);
		}

		const entitiesWithPath = children.map((entity) => publicEntityWithPathsFactory(entity, hierarchy));

		return entitiesWithPath;
	}

	/**
	 * Returns the data stream of a public file
	 * @param fileTxId - the transaction ID of the data to be download
	 * @returns {Promise<Readable>}
	 */
	async getPublicDataStream(fileTxId: TransactionID): Promise<Readable> {
		const dataTxUrl = `${gatewayUrlForArweave(this.arweave).href}${fileTxId}`;
		const requestConfig: AxiosRequestConfig = {
			method: 'get',
			url: dataTxUrl,
			responseType: 'stream'
		};
		const response = await axios(requestConfig);
		return response.data;
	}

	async downloadPublicFolder({
		folderId,
		destFolderPath,
		customFolderName,
		maxDepth,
		owner
	}: ArFSDownloadPublicFolderParams): Promise<void> {
		const publicFolder = await this.getPublicFolder(folderId, owner);
		// Fetch all of the folder entities within the drive
		const driveIdOfFolder = publicFolder.driveId;
		const allFolderEntitiesOfDrive = await this.getAllFoldersOfPublicDrive({
			driveId: driveIdOfFolder,
			owner,
			latestRevisionsOnly: true
		});

		// Feed entities to FolderHierarchy
		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(publicFolder.entityId, maxDepth);
		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(
			publicFolder.entityId,
			maxDepth + 1
		);
		const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.some((subFolderID) => subFolderID.equals(folder.entityId))
		);

		// Fetch all file entities within all Folders of the drive
		const childrenFileEntities = await this.getPublicFilesWithParentFolderIds(
			searchFolderIDs,
			owner,
			driveIdOfFolder,
			true
		);
		const folderWrapper = new ArFSFolderToDownload(
			publicEntityWithPathsFactory(publicFolder, hierarchy),
			customFolderName
		);

		const foldersWithPath = [publicFolder, ...childrenFolderEntities]
			.map((folder) => publicEntityWithPathsFactory(folder, hierarchy))
			.sort((a, b) => alphabeticalOrder(a.path, b.path));

		for (const folder of foldersWithPath) {
			// assert the existence of the folder in disk
			const relativeFolderPath = folderWrapper.getRelativePathOf(folder.path);
			const absoluteLocalFolderPath = joinPath(destFolderPath, relativeFolderPath);
			folderWrapper.ensureFolderExistence(absoluteLocalFolderPath);

			// download child files into the folder
			const childrenFiles = childrenFileEntities.filter(
				(file) => `${file.parentFolderId}` === `${folder.entityId}` /* FIXME: use the `equals` method */
			);
			for (const file of childrenFiles) {
				const relativeFilePath = folderWrapper.getRelativePathOf(
					publicEntityWithPathsFactory(file, hierarchy).path
				);
				const absoluteLocalFilePath = joinPath(destFolderPath, relativeFilePath);

				/*
				 * FIXME: Downloading all files at once consumes a lot of resources.
				 * TODO: Implement a download manager for downloading in parallel
				 * Doing it sequentially for now
				 */
				const dataStream = await this.getPublicDataStream(file.dataTxId);
				const fileWrapper = new ArFSPublicFileToDownload(file, dataStream, absoluteLocalFilePath);
				await fileWrapper.write();
			}
		}
	}
}
