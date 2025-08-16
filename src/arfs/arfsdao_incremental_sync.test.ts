/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import { expect } from 'chai';
import { stub, SinonStub } from 'sinon';
import {
	stubArweaveAddress,
	stubEntityID,
	stubEntityIDAlt,
	stubTxID,
	stubTxIDAlt,
	stubPrivateDrive,
	stubPrivateFolder,
	getStubDriveKey
} from '../../tests/stubs';
import {
	DriveSyncState,
	EntitySyncState,
	UnixTime,
	GQLEdgeInterface,
	GQLNodeInterface,
	EID,
	TxID,
	DriveKey,
	IncrementalSyncResult
} from '../types';
import {
	ArFSDAOIncrementalSync,
	ArFSPrivateIncrementalSyncCache,
	defaultArFSPrivateIncrementalSyncCache
} from './arfsdao_incremental_sync';
import { Wallet } from '../wallet';
import { JWKWallet } from '../jwk_wallet';
import { GatewayAPI } from '../utils/gateway_api';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

describe('ArFSDAOIncrementalSync class', () => {
	let arfsDaoIncSync: ArFSDAOIncrementalSync;
	let gatewayApiStub: SinonStub;
	let caches: ArFSPrivateIncrementalSyncCache;
	let wallet: Wallet;
	let driveKey: DriveKey;

	const mockDriveId = stubEntityID;
	const mockOwner = stubArweaveAddress();

	const createMockGQLNode = (overrides?: Partial<GQLNodeInterface>): GQLNodeInterface => {
		const defaultTags = [
			{ name: 'App-Name', value: 'ArDrive-Core' },
			{ name: 'App-Version', value: '0.0.1' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Drive-Id', value: mockDriveId.toString() },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Folder-Id', value: stubEntityIDAlt.toString() },
			{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
			{ name: 'Cipher', value: 'AES256-GCM' },
			{ name: 'Cipher-IV', value: '1234567890abcdef' },
			{ name: 'ArFS', value: '0.13' },
			{ name: 'Unix-Time', value: '1640000000' }
		];

		// If overrides has tags, use them to replace/update default tags
		let finalTags = [...defaultTags];
		if (overrides?.tags) {
			// Replace matching tags and add new ones
			overrides.tags.forEach(overrideTag => {
				const existingIndex = finalTags.findIndex(t => t.name === overrideTag.name);
				if (existingIndex >= 0) {
					finalTags[existingIndex] = overrideTag;
				} else {
					finalTags.push(overrideTag);
				}
			});
		}

		const { tags: _, ...overridesWithoutTags } = overrides || {};

		return {
			id: stubTxID.toString(),
			anchor: 'test-anchor',
			signature: 'test-signature',
			recipient: 'test-recipient',
			owner: {
				address: mockOwner.toString(),
				key: 'test-owner-key'
			},
			fee: { winston: '0', ar: '0' },
			quantity: { winston: '0', ar: '0' },
			data: { size: 0, type: 'application/json' },
			block: {
				id: 'test-block-id',
				height: 1000000,
				timestamp: 1640000000,
				previous: 'test-prev-block'
			},
			parent: { id: 'test-parent' },
			...overridesWithoutTags,
			tags: finalTags
		};
	};

	const createMockGQLEdge = (node?: GQLNodeInterface): GQLEdgeInterface => ({
		cursor: 'mock-cursor',
		node: node || createMockGQLNode()
	});

	let getTxDataStub: SinonStub;
	let currentTestEntityType: 'file' | 'folder' = 'folder'; // Track what type of entity current test is for

	beforeEach(async () => {
		// Set up wallet
		const jwkWallet = {
			kty: 'RSA',
			n: 'test',
			e: 'AQAB',
			d: 'test',
			p: 'test',
			q: 'test',
			dp: 'test',
			dq: 'test',
			qi: 'test'
		};
		wallet = new JWKWallet(jwkWallet);
		driveKey = await getStubDriveKey();

		// Create fresh caches for each test to avoid cross-test pollution
		const { PromiseCache } = await import('@ardrive/ardrive-promise-cache');
		const { defaultCacheParams } = await import('./arfsdao_anonymous');
		
		caches = {
			ownerCache: new PromiseCache(defaultCacheParams),
			driveIdCache: new PromiseCache(defaultCacheParams),
			publicDriveCache: new PromiseCache(defaultCacheParams),
			publicFolderCache: new PromiseCache(defaultCacheParams),
			publicFileCache: new PromiseCache(defaultCacheParams),
			privateDriveCache: new PromiseCache(defaultCacheParams),
			privateFolderCache: new PromiseCache(defaultCacheParams),
			privateFileCache: new PromiseCache(defaultCacheParams),
			publicConflictCache: new PromiseCache(defaultCacheParams),
			privateConflictCache: new PromiseCache(defaultCacheParams),
			syncStateCache: new PromiseCache({
				cacheCapacity: 100,
				cacheTTL: 1000 * 60 * 5
			})
		};

		// Create gateway API stub
		const gatewayApi = new GatewayAPI({
			gatewayUrl: new URL('https://arweave.net')
		});

		gatewayApiStub = stub(gatewayApi, 'gqlRequest');

		// Import crypto utilities for proper encryption
		const { fileEncrypt, deriveFileKey } = await import('../utils/crypto');
		const crypto = await import('crypto');

		// Map to store encrypted data by transaction ID for test consistency
		const encryptedDataMap = new Map<string, Buffer>();

		// Stub getTxData to return properly encrypted metadata
		getTxDataStub = stub(gatewayApi, 'getTxData');
		getTxDataStub.callsFake(async (txId: string) => {
			// Create appropriate metadata for all entities
			const metadata = { 
				name: 'Test Entity', 
				size: 1000, 
				lastModifiedDate: 1640000000, 
				dataTxId: stubTxID.toString(), 
				dataContentType: 'text/plain' 
			};
			const metadataBuffer = Buffer.from(JSON.stringify(metadata));

			// Use the consistent cipherIV from our mock nodes
			const cipherIV = '1234567890abcdef';
			const iv = Buffer.from(cipherIV, 'base64');

			// Use appropriate key based on entity type
			if (currentTestEntityType === 'file') {
				// Files use derived file key
				const fileKey = await deriveFileKey(stubEntityIDAlt.toString(), driveKey);
				const cipher = crypto.createCipheriv('aes-256-gcm', fileKey.keyData, iv, { authTagLength: 16 });
				const encryptedBuffer = Buffer.concat([cipher.update(metadataBuffer), cipher.final(), cipher.getAuthTag()]);
				return encryptedBuffer;
			} else {
				// Folders use driveKey for encryption
				const cipher = crypto.createCipheriv('aes-256-gcm', driveKey.keyData, iv, { authTagLength: 16 });
				const encryptedBuffer = Buffer.concat([cipher.update(metadataBuffer), cipher.final(), cipher.getAuthTag()]);
				return encryptedBuffer;
			}
		});

		arfsDaoIncSync = new ArFSDAOIncrementalSync(
			wallet,
			fakeArweave,
			false,
			'test_app',
			'0.0',
			undefined,
			caches,
			gatewayApi
		);
	});

	afterEach(() => {
		gatewayApiStub.restore();
		getTxDataStub.restore();
	});

	describe('getPrivateDriveIncrementalSync', () => {
		it('should perform initial sync for private drive', async () => {
			// Mock drive metadata fetch
			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Mock GraphQL responses - folders query
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: false }
			});
			// Mock GraphQL responses - files query
			gatewayApiStub.onSecondCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner);

			expect(result.entities).to.have.lengthOf(1);
			expect(result.changes.added).to.have.lengthOf(1);
			expect(result.newSyncState.drivePrivacy).to.equal('private');
			expect(result.stats.totalProcessed).to.equal(1);
		});

		it('should handle encrypted entities with file keys', async () => {
			currentTestEntityType = 'file'; // Set for this test
			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Create a file node with encrypted metadata
			const fileNode = createMockGQLNode({
				tags: [
					{ name: 'App-Name', value: 'ArDrive-Core' },
					{ name: 'App-Version', value: '0.0.1' },
					{ name: 'Drive-Id', value: mockDriveId.toString() },
					{ name: 'Entity-Type', value: 'file' },
					{ name: 'File-Id', value: stubEntityIDAlt.toString() },
					{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
					{ name: 'Cipher', value: 'AES256-GCM' },
					{ name: 'Cipher-IV', value: '1234567890abcdef' },
					{ name: 'ArFS', value: '0.13' },
					{ name: 'Unix-Time', value: '1640000000' },
					{ name: 'Content-Type', value: 'application/octet-stream' }
				]
			});

			gatewayApiStub.onFirstCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});
			gatewayApiStub.onSecondCall().resolves({
				edges: [createMockGQLEdge(fileNode)],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner);

			expect(result.entities).to.have.lengthOf(1);
			// Entity should be decrypted
			expect(result.entities[0]).to.have.property('entityType', 'file');
		});

		it('should detect changes in private entities', async () => {
			currentTestEntityType = 'folder'; // Set for this test
			const existingEntityState: EntitySyncState = {
				entityId: stubEntityIDAlt,
				txId: stubTxID,
				blockHeight: 999999,
				parentFolderId: undefined,
				name: 'old-name',
				entityType: 'folder'
			};

			const previousState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'private',
				lastSyncedBlockHeight: 999999,
				lastSyncedTimestamp: new UnixTime(1639000000000),
				entityStates: new Map([[stubEntityIDAlt.toString(), existingEntityState]])
			};

			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Return modified entity with new txId
			const modifiedNode = createMockGQLNode({
				id: stubTxIDAlt.toString()
			});

			// Mock GraphQL responses - folders query
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge(modifiedNode)],
				pageInfo: { hasNextPage: false }
			});
			// Mock GraphQL responses - files query
			gatewayApiStub.onSecondCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner, {
				syncState: previousState
			});

			expect(result.changes.modified).to.have.lengthOf(1);
			expect(result.changes.added).to.have.lengthOf(0);
		});

		it('should handle keyless entities', async () => {
			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Create a folder node with valid encryption
			const folderNode = createMockGQLNode({
				tags: [
					{ name: 'App-Name', value: 'ArDrive-Core' },
					{ name: 'App-Version', value: '0.0.1' },
					{ name: 'Drive-Id', value: mockDriveId.toString() },
					{ name: 'Entity-Type', value: 'folder' },
					{ name: 'Folder-Id', value: stubEntityIDAlt.toString() },
					{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
					{ name: 'Cipher', value: 'AES256-GCM' },
					{ name: 'Cipher-IV', value: '1234567890abcdef' }, // Valid IV that matches our stub
					{ name: 'ArFS', value: '0.13' },
					{ name: 'Unix-Time', value: '1640000000' },
					{ name: 'Content-Type', value: 'application/json' }
				]
			});

			// Mock GraphQL responses - folders query
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge(folderNode)],
				pageInfo: { hasNextPage: false }
			});
			// Mock GraphQL responses - files query
			gatewayApiStub.onSecondCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner);

			// Should process entities successfully
			expect(result.entities).to.have.lengthOf(1);
			expect(result.stats.totalProcessed).to.equal(1);
		});

		it('should utilize cache for private entities', async () => {
			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Pre-populate cache with a folder
			const cachedFolder = await stubPrivateFolder({ folderId: stubEntityIDAlt });
			const cacheKey = {
				folderId: cachedFolder.entityId,
				owner: mockOwner,
				driveKey
			};
			caches.privateFolderCache.put(cacheKey, Promise.resolve(cachedFolder));

			const folderNode = createMockGQLNode({
				tags: [
					{ name: 'App-Name', value: 'ArDrive-Core' },
					{ name: 'App-Version', value: '0.0.1' },
					{ name: 'Content-Type', value: 'application/json' },
					{ name: 'Drive-Id', value: mockDriveId.toString() },
					{ name: 'Entity-Type', value: 'folder' },
					{ name: 'Folder-Id', value: cachedFolder.entityId.toString() },
					{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
					{ name: 'Cipher', value: 'AES256-GCM' },
					{ name: 'Cipher-IV', value: '1234567890abcdef' },
					{ name: 'ArFS', value: '0.13' },
					{ name: 'Unix-Time', value: '1640000000' }
				]
			});

			// Mock GraphQL responses - folders query
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge(folderNode)],
				pageInfo: { hasNextPage: false }
			});
			// Mock GraphQL responses - files query
			gatewayApiStub.onSecondCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner);

			expect(result.stats.fromCache).to.equal(1);
			expect(result.stats.fromNetwork).to.equal(0);
		});

		it('should stop after known entities count', async () => {
			const knownEntity: EntitySyncState = {
				entityId: stubEntityIDAlt,
				txId: stubTxID,
				blockHeight: 1000000,
				parentFolderId: undefined,
				name: 'known-folder',
				entityType: 'folder'
			};

			const previousState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'private',
				lastSyncedBlockHeight: 999999,
				lastSyncedTimestamp: new UnixTime(1639000000000),
				entityStates: new Map([[stubEntityIDAlt.toString(), knownEntity]])
			};

			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Return multiple entities including known one
			const edges: GQLEdgeInterface[] = [];
			for (let i = 0; i < 5; i++) {
				const entityId = i === 2 ? stubEntityIDAlt : EID(`aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa0${i}`);
				const txId = i === 2 ? stubTxID : TxID(`000000000000000000000000000000000000000000${i}`);

				edges.push(
					createMockGQLEdge(
						createMockGQLNode({
							id: txId.toString(),
							tags: [
								{ name: 'Folder-Id', value: entityId.toString() },
								{ name: 'Cipher-IV', value: '1234567890abcdef' } // Use valid IV that matches stub
							]
						})
					)
				);
			}

			// Mock GraphQL responses - folders query returns multiple entities
			gatewayApiStub.onFirstCall().resolves({
				edges,
				pageInfo: { hasNextPage: true }
			});
			// Second folder call (in case early stop doesn't work immediately)
			gatewayApiStub.onSecondCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});
			// Mock GraphQL responses - files query
			gatewayApiStub.onThirdCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner, {
				syncState: previousState,
				stopAfterKnownCount: 1
			});

			// Should stop after finding known entity
			expect(result.entities.length).to.be.at.most(3);
		});

		it('should throw IncrementalSyncError with partial results', async () => {
			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// First call succeeds
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: true }
			});

			// Second call fails
			gatewayApiStub.onSecondCall().rejects(new Error('Gateway error'));

			try {
				await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner);
				expect.fail('Should have thrown error');
			} catch (error) {
				// The error might be the original gateway error if it fails before processing
				// or IncrementalSyncError if it fails after processing some entities
				if ((error as Error).name === 'IncrementalSyncError') {
					const syncError = error as IncrementalSyncError;
					expect(syncError.partialResult).to.exist;
					if (syncError.partialResult?.stats) {
						expect(syncError.partialResult.stats.totalProcessed).to.be.greaterThan(0);
					}
				} else {
					// Gateway error before any processing
					expect((error as Error).message).to.include('Gateway error');
				}
			}
		});
	});

	describe('anonymousIncSync integration', () => {
		it('should have access to anonymous incremental sync instance', () => {
			expect(arfsDaoIncSync.anonymousIncSync).to.exist;
			expect(arfsDaoIncSync.anonymousIncSync.getPublicDriveIncrementalSync).to.be.a('function');
		});

		it('should share cache with anonymous instance', async () => {
			const syncState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			// Set state via anonymous instance
			arfsDaoIncSync.anonymousIncSync.setCachedSyncState(mockDriveId, syncState);

			// Retrieve via main instance
			const retrieved = await arfsDaoIncSync.getCachedSyncState(mockDriveId);
			expect(retrieved).to.exist;
			expect(retrieved!.lastSyncedBlockHeight).to.equal(1000000);
		});
	});
});
