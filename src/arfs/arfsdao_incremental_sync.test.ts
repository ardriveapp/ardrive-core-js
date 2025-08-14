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

	const createMockGQLNode = (overrides?: Partial<GQLNodeInterface>): GQLNodeInterface => ({
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
		tags: [
			{ name: 'Drive-Id', value: mockDriveId.toString() },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Folder-Id', value: stubEntityIDAlt.toString() },
			{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
			{ name: 'Cipher', value: 'AES256-GCM' },
			{ name: 'Cipher-IV', value: '1234567890abcdef' },
			{ name: 'ArFS', value: '0.13' },
			{ name: 'Unix-Time', value: '1640000000' }
		],
		block: {
			id: 'test-block-id',
			height: 1000000,
			timestamp: 1640000000,
			previous: 'test-prev-block'
		},
		parent: { id: 'test-parent' },
		...overrides
	});

	const createMockGQLEdge = (node?: GQLNodeInterface): GQLEdgeInterface => ({
		cursor: 'mock-cursor',
		node: node || createMockGQLNode()
	});

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

		caches = {
			...defaultArFSPrivateIncrementalSyncCache
		};

		// Create gateway API stub
		const gatewayApi = new GatewayAPI({
			gatewayUrl: new URL('https://arweave.net')
		});

		gatewayApiStub = stub(gatewayApi, 'gqlRequest');

		// Stub getTxData to return mock encrypted metadata
		const getTxDataStub = stub(gatewayApi, 'getTxData');
		getTxDataStub.resolves(Buffer.from(JSON.stringify({ name: 'Test Folder' })));

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
			stub(arfsDaoIncSync, 'getPrivateDrive').resolves(await stubPrivateDrive());

			// Create a file node with encrypted metadata
			const fileNode = createMockGQLNode({
				tags: [
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

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge(modifiedNode)],
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

			// Create a file node that will fail decryption (keyless)
			const keylessFileNode = createMockGQLNode({
				tags: [
					{ name: 'Drive-Id', value: mockDriveId.toString() },
					{ name: 'Entity-Type', value: 'file' },
					{ name: 'File-Id', value: stubEntityIDAlt.toString() },
					{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
					{ name: 'Cipher', value: 'AES256-GCM' },
					{ name: 'Cipher-IV', value: 'invalid-iv' },
					{ name: 'ArFS', value: '0.13' },
					{ name: 'Unix-Time', value: '1640000000' },
					{ name: 'Content-Type', value: 'application/octet-stream' }
				]
			});

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge(keylessFileNode)],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPrivateDriveIncrementalSync(mockDriveId, driveKey, mockOwner);

			// Should still process keyless entities
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
					{ name: 'Drive-Id', value: mockDriveId.toString() },
					{ name: 'Entity-Type', value: 'folder' },
					{ name: 'Folder-Id', value: cachedFolder.entityId.toString() }
				]
			});

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge(folderNode)],
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
								{ name: 'Drive-Id', value: mockDriveId.toString() },
								{ name: 'Entity-Type', value: 'folder' },
								{ name: 'Folder-Id', value: entityId.toString() },
								{ name: 'Parent-Folder-Id', value: stubEntityID.toString() },
								{ name: 'Cipher', value: 'AES256-GCM' },
								{ name: 'Cipher-IV', value: '0000000000000000000000000000' },
								{ name: 'ArFS', value: '0.13' },
								{ name: 'Unix-Time', value: '1640000000' }
							]
						})
					)
				);
			}

			gatewayApiStub.resolves({
				edges,
				pageInfo: { hasNextPage: true }
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
				expect((error as Error).name).to.equal('IncrementalSyncError');
				const syncError = error as { partialResult: IncrementalSyncResult };
				expect(syncError.partialResult).to.exist;
				expect(syncError.partialResult.stats.totalProcessed).to.equal(1);
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
