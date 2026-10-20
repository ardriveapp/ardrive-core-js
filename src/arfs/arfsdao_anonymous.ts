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
import { keepLatestRevisions, keepLatestRevisionsForDrives } from '../utils/filter_methods';
import { FolderHierarchy } from './folder_hierarchy';
import { ArFSPublicDriveBuilder, SafeArFSDriveBuilder } from './arfs_builders/arfs_drive_builders';
import { ArFSPublicFolderBuilder } from './arfs_builders/arfs_folder_builders';
import { ArFSPublicFileBuilder } from './arfs_builders/arfs_file_builders';
import {
	ArFSDriveEntity,
	ArFSPrivateFile,
	ArFSPrivateFolder,
	ArFSPublicDrive,
	ArFSPublicFile,
	ArFSPublicFolder
} from './arfs_entities';
import { PrivateKeyData } from './private_key_data';
import {
	DEFAULT_APP_NAME,
	DEFAULT_APP_VERSION,
	DEFAULT_DOWNLOAD_CONCURRENCY,
	MAX_CONCURRENT_ENTITY_FETCHES
} from '../utils/constants';
import { mapWithConcurrency } from '../utils/concurrency';
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
import { DriveStateReadParams, DriveStateReadResult, DriveStateSource } from '../drive_state/drive_state_source';
import { driveStateSupported } from '../drive_state/artifact_engine';
import { DriveStateContents } from '../drive_state/drive_state_reader';
import { DriveStateProtection } from '../drive_state/drive_state_envelope';
import { publicEntitiesFromContents } from '../drive_state/drive_state_entities';
import { BuiltDriveState, buildDriveState, DriveStateChain, NodeWithBundle } from '../drive_state/drive_state_builder';
import { buildDriveHistoryQuery, buildMinedTxIdsQuery } from '../drive_state/drive_state_query';
import { v4 as uuidv4 } from 'uuid';

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
/**
 * [base] with each entity [later] holds replaced by [later]'s copy. [later] is
 * one revision per entity.
 */
export function laterRevisionsWin<T extends { entityId: { toString(): string } }>(base: T[], later: T[]): T[] {
	const byId = new Map<string, T>();
	for (const entity of base) {
		byId.set(`${entity.entityId}`, entity);
	}
	for (const entity of later) {
		byId.set(`${entity.entityId}`, entity);
	}
	return [...byId.values()];
}

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

			// Bounded fan-out: build at most MAX_CONCURRENT_ENTITY_FETCHES drives at a time so a
			// full (1000-edge) page does not put ~1000 metadata GETs on the gateway at once
			// [CORE-9]. Order-preserving; the built set is identical to the prior Promise.all.
			const drives = await mapWithConcurrency(
				edges,
				MAX_CONCURRENT_ENTITY_FETCHES,
				async (edge: GQLEdgeInterface) => {
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
				}
			);

			allDrives.push(...drives);
		}

		return latestRevisionsOnly ? keepLatestRevisionsForDrives(allDrives) : allDrives;
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
			// Bounded fan-out: build at most MAX_CONCURRENT_ENTITY_FETCHES files at a time so a
			// full (1000-edge) page does not put ~1000 metadata GETs on the gateway at once
			// [CORE-9]. Order-preserving and skip-on-broken semantics unchanged.
			const files = await mapWithConcurrency(
				edges,
				MAX_CONCURRENT_ENTITY_FETCHES,
				async (edge: GQLEdgeInterface) => {
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
				}
			);

			const validFiles = files.filter((f) => f !== null) as ArFSPublicFile[];

			allFiles.push(...validFiles);
		}
		return latestRevisionsOnly ? keepLatestRevisions(allFiles) : allFiles;
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
			// Bounded fan-out: build at most MAX_CONCURRENT_ENTITY_FETCHES folders at a time so a
			// full (1000-edge) page does not put ~1000 metadata GETs on the gateway at once
			// [CORE-9]. Order-preserving and skip-on-broken semantics unchanged.
			const folders = await mapWithConcurrency(
				edges,
				MAX_CONCURRENT_ENTITY_FETCHES,
				async (edge: GQLEdgeInterface) => {
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
				}
			);

			// Filter out null values
			const validFolders = folders.filter((folder) => folder !== null) as ArFSPublicFolder[];

			allFolders.push(...validFolders);
		}
		return latestRevisionsOnly ? keepLatestRevisions(allFolders) : allFolders;
	}

	private driveStateSourceInstance?: DriveStateSource;

	/** Finds and reads drive state artifacts, created on first use. */
	protected get driveStateSource(): DriveStateSource {
		if (!this.driveStateSourceInstance) {
			this.driveStateSourceInstance = new DriveStateSource({ gatewayApi: this.gatewayApi });
		}
		return this.driveStateSourceInstance;
	}

	/** Replaces how drive state is found and read, such as with a test double. */
	setDriveStateSource(source: DriveStateSource): void {
		this.driveStateSourceInstance = source;
	}

	/** Finds and reads a drive's Drive State artifact. Never throws. */
	readDriveState(params: DriveStateReadParams): Promise<DriveStateReadResult> {
		return this.driveStateSource.read(params);
	}

	/** Whether reads use Drive State, given a caller's `useDriveState` option. */
	isDriveStateEnabled(useDriveState?: boolean): boolean {
		return this.driveStateEnabled(useDriveState);
	}

	/**
	 * Whether listing reads a drive's Drive State artifact first. Default ON; a
	 * caller can opt out per listing (`useDriveState: false`) or globally with
	 * `ARDRIVE_DISABLE_DRIVE_STATE=1`. Any artifact that cannot be used falls
	 * back to the snapshot path and then to a full replay, so this only exists
	 * to force those paths.
	 */
	protected driveStateEnabled(useDriveState?: boolean): boolean {
		if (process.env['ARDRIVE_DISABLE_DRIVE_STATE'] === '1' || !driveStateSupported()) {
			return false;
		}
		return useDriveState !== false;
	}

	/**
	 * A drive's current entities from its Drive State artifact, brought up to
	 * date from snapshots and GraphQL. Returns the latest revision of every
	 * folder and file, or `null` when the drive has no usable artifact (the
	 * caller then lists it as it would without one).
	 *
	 * The artifact is the drive's state through `coveredThroughBlock`, a margin
	 * below its `Block-End`. Snapshots and GraphQL supply every height above
	 * that, and an entity they return replaces the artifact's copy: those
	 * sources cover every height above the margin, so whatever they hold for an
	 * entity is at least as new as the artifact's.
	 */
	protected async driveEntitiesViaDriveState<
		Folder extends ArFSPublicFolder | ArFSPrivateFolder,
		File extends ArFSPublicFile | ArFSPrivateFile
	>({
		driveId,
		owner,
		protection,
		fromContents,
		buildFromNodes
	}: {
		driveId: DriveID;
		owner: ArweaveAddress;
		protection: DriveStateProtection;
		fromContents: (contents: DriveStateContents) => Promise<{ folders: Folder[]; files: File[] }>;
		buildFromNodes: (
			folderNodes: GQLNodeInterface[],
			fileNodes: GQLNodeInterface[]
		) => Promise<{ folders: Folder[]; files: File[] }>;
	}): Promise<{ folders: Folder[]; files: File[] } | null> {
		const result = await this.driveStateSource.read({ driveId, owner, protection });
		if (result.outcome !== 'used' || !result.contents || result.coveredThroughBlock === undefined) {
			return null;
		}
		const base = await fromContents(result.contents);
		const floor = result.coveredThroughBlock;

		const snapshots = (await this.fetchDriveSnapshotsWithBodies(driveId, owner, floor)) ?? [];
		const composite = buildDriveHistoryComposite({
			snapshotsNewestFirst: snapshots,
			owner,
			isPrivate: protection.kind === 'private',
			lastBlockHeight: floor
		});
		for (const entry of composite.metadataCache) {
			this.gatewayApi.cacheMetadataForTxId(TxID(entry.txId), entry.data);
		}
		const tailNodes = await this.getSnapshotTailNodes(driveId, owner, ['folder', 'file'], composite.tailBounds);

		const entityType = (node: GQLNodeInterface) => node.tags?.find((tag) => tag.name === 'Entity-Type')?.value;
		const later = await buildFromNodes(
			sortNodesNewestFirst([
				...tailNodes.filter((n) => entityType(n) === 'folder'),
				...composite.snapshotNodes.filter((n) => entityType(n) === 'folder')
			]),
			sortNodesNewestFirst([
				...tailNodes.filter((n) => entityType(n) === 'file'),
				...composite.snapshotNodes.filter((n) => entityType(n) === 'file')
			])
		);

		return {
			folders: laterRevisionsWin(base.folders, keepLatestRevisions(later.folders)),
			files: laterRevisionsWin(base.files, keepLatestRevisions(later.files))
		};
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
		owner: ArweaveAddress,
		floor?: number
	): Promise<SnapshotWithBody[] | null> {
		// 1. Enumerate the drive's snapshot transactions (owner-scoped, HEIGHT_DESC).
		//    With a floor, heights [0, floor] are already accounted for, and a
		//    snapshot mined at or below it can cover nothing above it.
		const snapshotNodes: GQLNodeInterface[] = [];
		let cursor: string | undefined = undefined;
		let hasNextPage = true;
		while (hasNextPage) {
			const gqlQuery = buildSnapshotQuery({
				driveId,
				owner,
				cursor,
				minBlockHeight: floor !== undefined ? floor + 1 : undefined
			});
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
		const { obscured } = computeSnapshotSubRanges(entities, floor);
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
		// Bounded fan-out: snapshot nodes build from the seeded metadata cache (no fetch) but
		// the live-tail nodes each do a per-entity metadata GET; cap in-flight builds at
		// MAX_CONCURRENT_ENTITY_FETCHES so a large tail does not swamp the gateway [CORE-9].
		// Order-preserving and skip-on-broken semantics unchanged.
		const folders = await mapWithConcurrency(nodes, MAX_CONCURRENT_ENTITY_FETCHES, async (node) => {
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
		return folders.filter((folder) => folder !== null) as ArFSPublicFolder[];
	}

	private async buildPublicFilesFromNodes(
		nodes: GQLNodeInterface[],
		owner: ArweaveAddress
	): Promise<ArFSPublicFile[]> {
		// Bounded fan-out: snapshot nodes build from the seeded metadata cache (no fetch) but
		// the live-tail nodes each do a per-entity metadata GET; cap in-flight builds at
		// MAX_CONCURRENT_ENTITY_FETCHES so a large tail does not swamp the gateway [CORE-9].
		// Order-preserving and skip-on-broken semantics unchanged.
		const files = await mapWithConcurrency(nodes, MAX_CONCURRENT_ENTITY_FETCHES, async (node) => {
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
		return files.filter((file) => file !== null) as ArFSPublicFile[];
	}

	/**
	 * Every folder and file revision of a public drive from its Drive State
	 * artifact or its snapshots, whichever is usable first, or `null` when
	 * neither is (the caller then replays the drive's history). Never throws.
	 */
	protected async acceleratedPublicDriveEntities(
		driveId: DriveID,
		owner: ArweaveAddress,
		useSnapshots?: boolean,
		useDriveState?: boolean
	): Promise<{ folders: ArFSPublicFolder[]; files: ArFSPublicFile[] } | null> {
		// DRIVE STATE FIRST (isolated): the drive's published state plus later
		// revisions. Any failure falls through to the snapshot path.
		if (this.driveStateEnabled(useDriveState)) {
			try {
				const entities = await this.getPublicDriveEntitiesViaDriveState(driveId, owner);
				if (entities) {
					return entities;
				}
			} catch (e) {
				console.error(`[drive-state] ${driveId}: falling back to snapshots: ${e}`);
			}
		}
		if (this.snapshotsEnabled(useSnapshots)) {
			try {
				return await this.getPublicDriveEntitiesViaSnapshots(driveId, owner);
			} catch (e) {
				console.error(`[snapshot] falling back to full-history replay for drive ${driveId}: ${e}`);
			}
		}
		return null;
	}

	/** Every page of a drive's own revisions of [entityTypes] between two heights, oldest first. */
	protected async driveHistoryNodes(
		driveId: DriveID,
		owner: ArweaveAddress,
		entityTypes: string[],
		bounds: { minBlockHeight?: number; maxBlockHeight?: number } = {}
	): Promise<NodeWithBundle[]> {
		const nodes: NodeWithBundle[] = [];
		let cursor: string | undefined;
		let hasNextPage = true;
		while (hasNextPage) {
			const page = await this.gatewayApi.gqlRequest(
				buildDriveHistoryQuery({ driveId, owner, entityTypes, cursor, ...bounds })
			);
			hasNextPage = page.pageInfo.hasNextPage;
			if (page.edges.length === 0) {
				break;
			}
			for (const edge of page.edges) {
				cursor = edge.cursor;
				nodes.push(edge.node as NodeWithBundle);
			}
		}
		return nodes;
	}

	/**
	 * The chain as a drive state producer reads it: the drive's revisions from
	 * snapshots where it has them and GraphQL for the rest, with metadata read
	 * through [readMetadata].
	 */
	protected driveStateChain(
		driveId: DriveID,
		owner: ArweaveAddress,
		isPrivate: boolean,
		readMetadata: (node: GQLNodeInterface, data: Buffer) => Promise<Record<string, unknown>>
	): DriveStateChain {
		return {
			currentHeight: async () => (await this.arweave.network.getInfo()).height,
			driveNodes: () => this.driveHistoryNodes(driveId, owner, ['drive']),
			folderAndFileNodes: async () => {
				let snapshots: SnapshotWithBody[] = [];
				try {
					snapshots = (await this.fetchDriveSnapshotsWithBodies(driveId, owner)) ?? [];
				} catch (e) {
					console.error(`[drive-state] ${driveId}: reading the drive without its snapshots: ${e}`);
				}
				const composite = buildDriveHistoryComposite({ snapshotsNewestFirst: snapshots, owner, isPrivate });
				for (const entry of composite.metadataCache) {
					this.gatewayApi.cacheMetadataForTxId(TxID(entry.txId), entry.data);
				}
				const tail: NodeWithBundle[] = [];
				for (const bound of composite.tailBounds) {
					tail.push(...(await this.driveHistoryNodes(driveId, owner, ['folder', 'file'], bound)));
				}
				return [...(composite.snapshotNodes as NodeWithBundle[]), ...tail];
			},
			metadata: async (node) => readMetadata(node, await this.gatewayApi.getTxData(TxID(node.id))),
			minedTxIds: async (ids) => {
				const page = await this.gatewayApi.gqlRequest(buildMinedTxIdsQuery(ids));
				return new Set(
					page.edges
						.filter((edge) => edge.node.block && edge.node.block.height !== null)
						.map((edge) => edge.node.id)
				);
			}
		};
	}

	/**
	 * Builds a public drive's Drive State artifact from chain data, ready to
	 * upload. Throws {@link DriveStateBuildRefused} when the drive cannot be
	 * published as it stands.
	 */
	async buildPublicDriveState({
		driveId,
		owner,
		producer,
		log
	}: {
		driveId: DriveID;
		owner: ArweaveAddress;
		/** `<App-Name>/<App-Version>`. */
		producer: string;
		log?: (line: string) => void;
	}): Promise<BuiltDriveState> {
		return buildDriveState({
			driveId: `${driveId}`,
			owner: `${owner}`,
			protection: { kind: 'public' },
			producer,
			driveStateId: uuidv4(),
			log,
			chain: this.driveStateChain(driveId, owner, false, async (_node, data) => JSON.parse(data.toString('utf8')))
		});
	}

	/** {@link driveEntitiesViaDriveState} for a public drive. */
	protected async getPublicDriveEntitiesViaDriveState(
		driveId: DriveID,
		owner: ArweaveAddress
	): Promise<{ folders: ArFSPublicFolder[]; files: ArFSPublicFile[] } | null> {
		return this.driveEntitiesViaDriveState<ArFSPublicFolder, ArFSPublicFile>({
			driveId,
			owner,
			protection: { kind: 'public' },
			fromContents: async (contents) => publicEntitiesFromContents(contents),
			buildFromNodes: async (folderNodes, fileNodes) => {
				const [folders, files] = await Promise.all([
					this.buildPublicFoldersFromNodes(folderNodes, owner),
					this.buildPublicFilesFromNodes(fileNodes, owner)
				]);
				return { folders, files };
			}
		});
	}

	/**
	 * Snapshot-accelerated whole-drive entity fetch. Returns every file and folder
	 * revision of the drive (the caller applies `keepLatestRevisions`), sourced from
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
		useSnapshots,
		useDriveState
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
		const snapshotEntities = await this.acceleratedPublicDriveEntities(
			driveIdOfFolder,
			owner,
			useSnapshots,
			useDriveState
		);

		const allFolderEntitiesOfDrive = snapshotEntities
			? keepLatestRevisions(snapshotEntities.folders)
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
			// Files were already fetched drive-wide. Each file's latest revision is
			// chosen before filtering by folder: filtering first would keep an older
			// revision in a folder the file has since moved out of.
			for (const file of keepLatestRevisions(snapshotEntities.files)) {
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
		const uniqueFiles = keepLatestRevisions(childrenFileEntities);

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
		owner,
		useSnapshots,
		useDriveState
	}: ArFSDownloadPublicFolderParams): Promise<void> {
		const publicFolder = await this.getPublicFolder(folderId, owner);
		// Fetch all of the folder entities within the drive
		const driveIdOfFolder = publicFolder.driveId;
		const accelerated = await this.acceleratedPublicDriveEntities(
			driveIdOfFolder,
			owner,
			useSnapshots,
			useDriveState
		);
		const allFolderEntitiesOfDrive = accelerated
			? keepLatestRevisions(accelerated.folders)
			: await this.getAllFoldersOfPublicDrive({
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

		// Fetch all file entities within all Folders of the drive. From drive-wide
		// data, each file's latest revision is chosen before filtering by folder.
		const childrenFileEntities = accelerated
			? keepLatestRevisions(accelerated.files).filter((file) =>
					searchFolderIDs.some((fid) => fid.equals(file.parentFolderId))
				)
			: await this.getPublicFilesWithParentFolderIds(searchFolderIDs, owner, driveIdOfFolder, true);
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

			// download child files into the folder with bounded concurrency so at
			// most DEFAULT_DOWNLOAD_CONCURRENCY downloads are ever in flight at once
			const childrenFiles = childrenFileEntities.filter(
				(file) => `${file.parentFolderId}` === `${folder.entityId}` /* FIXME: use the `equals` method */
			);
			await mapWithConcurrency(childrenFiles, DEFAULT_DOWNLOAD_CONCURRENCY, async (file) => {
				const relativeFilePath = folderWrapper.getRelativePathOf(
					publicEntityWithPathsFactory(file, hierarchy).path
				);
				const absoluteLocalFilePath = joinPath(destFolderPath, relativeFilePath);

				const dataStream = await this.getPublicDataStream(file.dataTxId);
				const fileWrapper = new ArFSPublicFileToDownload(file, dataStream, absoluteLocalFilePath);
				await fileWrapper.write();
			});
		}
	}
}
