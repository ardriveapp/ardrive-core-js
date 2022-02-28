/* eslint-disable no-console */
import Arweave from 'arweave';
import {
	ArFSAllPublicFoldersOfDriveParams,
	ArFSListPublicFolderParams,
	ArFSDownloadPublicFolderParams,
	EntityID,
	GQLEdgeInterface,
	TransactionID
} from '../types';
import { ASCENDING_ORDER, buildQuery } from '../utils/query';
import { DriveID, FolderID, FileID, AnyEntityID, ArweaveAddress, EID, ADDR } from '../types';
import { latestRevisionFilter, latestRevisionFilterForDrives } from '../utils/filter_methods';
import { FolderHierarchy } from './folderHierarchy';
import { ArFSPublicDriveBuilder, SafeArFSDriveBuilder } from './arfs_builders/arfs_drive_builders';
import { ArFSPublicFolderBuilder } from './arfs_builders/arfs_folder_builders';
import { ArFSPublicFileBuilder } from './arfs_builders/arfs_file_builders';
import {
	ArFSDriveEntity,
	ArFSPublicDrive,
	ArFSPublicFile,
	ArFSPublicFileOrFolderWithPaths,
	ArFSPublicFolder
} from './arfs_entities';
import { PrivateKeyData } from './private_key_data';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION, graphQLURL } from '../utils/constants';
import axios, { AxiosRequestConfig } from 'axios';
import { gatewayURL } from '../utils/constants';
import { Readable } from 'stream';
import { join as joinPath } from 'path';
import { ArFSPublicFileToDownload, ArFSFolderToDownload } from './arfs_file_wrapper';
import { ArFSEntityCache } from './arfs_entity_cache';
import { alphabeticalOrder } from '../utils/sort_functions';

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
	ownerCache: ArFSEntityCache<DriveID, ArweaveAddress>;
	driveIdCache: ArFSEntityCache<EntityID, DriveID>;
	publicDriveCache: ArFSEntityCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>;
	publicFolderCache: ArFSEntityCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>;
	publicFileCache: ArFSEntityCache<ArFSPublicFileCacheKey, ArFSPublicFile>;
}

export const defaultArFSAnonymousCache: ArFSAnonymousCache = {
	ownerCache: new ArFSEntityCache<DriveID, ArweaveAddress>('ownerCache'),
	driveIdCache: new ArFSEntityCache<EntityID, DriveID>('driveIdCache'),
	publicDriveCache: new ArFSEntityCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>('publicDriveCache'),
	publicFolderCache: new ArFSEntityCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>('publicFolderCache'),
	publicFileCache: new ArFSEntityCache<ArFSPublicFileCacheKey, ArFSPublicFile>('publicFileCache')
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
		protected caches = defaultArFSAnonymousCache
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
				const response = await this.arweave.api.post(graphQLURL, gqlQuery);
				const edges: GQLEdgeInterface[] = response.data.data.transactions.edges;

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

				const response = await this.arweave.api.post(graphQLURL, gqlQuery);
				const { data } = response.data;
				const { transactions } = data;

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
			new ArFSPublicDriveBuilder({ entityId: driveId, arweave: this.arweave, owner }).build()
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
			new ArFSPublicFolderBuilder({ entityId: folderId, arweave: this.arweave, owner }).build()
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
			new ArFSPublicFileBuilder({ entityId: fileId, arweave: this.arweave, owner }).build()
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

			const response = await this.arweave.api.post(graphQLURL, gqlQuery);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;

			const drives: Promise<ArFSDriveEntity>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;

				const driveBuilder = SafeArFSDriveBuilder.fromArweaveNode(node, this.arweave, privateKeyData);
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
		latestRevisionsOnly = false
	): Promise<ArFSPublicFile[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: ArFSPublicFile[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Parent-Folder-Id', value: folderIDs.map((fid) => fid.toString()) },
					{ name: 'Entity-Type', value: 'file' }
				],
				cursor,
				owner
			});

			const response = await this.arweave.api.post(graphQLURL, gqlQuery);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			const files: Promise<ArFSPublicFile>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				const fileBuilder = ArFSPublicFileBuilder.fromArweaveNode(node, this.arweave);
				const file = await fileBuilder.build(node);
				const cacheKey = { fileId: file.fileId, owner };
				return this.caches.publicFileCache.put(cacheKey, Promise.resolve(file));
			});
			allFiles.push(...(await Promise.all(files)));
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

			const response = await this.arweave.api.post(graphQLURL, gqlQuery);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;

			hasNextPage = transactions.pageInfo.hasNextPage;
			const folders: Promise<ArFSPublicFolder>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				const folderBuilder = ArFSPublicFolderBuilder.fromArweaveNode(node, this.arweave);
				const folder = await folderBuilder.build(node);
				const cacheKey = { folderId: folder.entityId, owner };
				return this.caches.publicFolderCache.put(cacheKey, Promise.resolve(folder));
			});
			allFolders.push(...(await Promise.all(folders)));
		}
		return latestRevisionsOnly ? allFolders.filter(latestRevisionFilter) : allFolders;
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
		owner
	}: ArFSListPublicFolderParams): Promise<ArFSPublicFileOrFolderWithPaths[]> {
		if (!Number.isInteger(maxDepth) || maxDepth < 0) {
			throw new Error('maxDepth should be a non-negative integer!');
		}

		const folder = await this.getPublicFolder(folderId, owner);

		// Fetch all of the folder entities within the drive
		const driveIdOfFolder = folder.driveId;
		const allFolderEntitiesOfDrive = await this.getAllFoldersOfPublicDrive({
			driveId: driveIdOfFolder,
			owner,
			latestRevisionsOnly: true
		});

		// Feed entities to FolderHierarchy
		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth - 1);
		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth);

		const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.some((fid) => fid.equals(folder.entityId))
		);

		if (includeRoot) {
			childrenFolderEntities.unshift(folder);
		}

		// Fetch all file entities within all Folders of the drive
		const childrenFileEntities = await this.getPublicFilesWithParentFolderIds(searchFolderIDs, owner, true);

		const children = [...childrenFolderEntities, ...childrenFileEntities];

		const entitiesWithPath = children.map((entity) => new ArFSPublicFileOrFolderWithPaths(entity, hierarchy));
		return entitiesWithPath;
	}

	/**
	 * Returns the data stream of a public file
	 * @param fileTxId - the transaction ID of the data to be download
	 * @returns {Promise<Readable>}
	 */
	async getPublicDataStream(fileTxId: TransactionID): Promise<Readable> {
		const dataTxUrl = `${gatewayURL}${fileTxId}`;
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
		const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(publicFolder.entityId, maxDepth - 1);
		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(publicFolder.entityId, maxDepth);
		const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.some((subFolderID) => subFolderID.equals(folder.entityId))
		);

		// Fetch all file entities within all Folders of the drive
		const childrenFileEntities = await this.getPublicFilesWithParentFolderIds(searchFolderIDs, owner, true);
		const folderWrapper = new ArFSFolderToDownload(
			new ArFSPublicFileOrFolderWithPaths(publicFolder, hierarchy),
			customFolderName
		);

		const foldersWithPath = [publicFolder, ...childrenFolderEntities]
			.map((folder) => new ArFSPublicFileOrFolderWithPaths(folder, hierarchy))
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
					new ArFSPublicFileOrFolderWithPaths(file, hierarchy).path
				);
				const absoluteLocalFilePath = joinPath(destFolderPath, relativeFilePath);

				/*
				 * FIXME: Downloading all files at once consumes a lot of resources.
				 * TODO: Implement a download manager for downloading in paralel
				 * Doing it sequentially for now
				 */
				const dataStream = await this.getPublicDataStream(file.dataTxId);
				const fileWrapper = new ArFSPublicFileToDownload(file, dataStream, absoluteLocalFilePath);
				await fileWrapper.write();
			}
		}
	}
}
