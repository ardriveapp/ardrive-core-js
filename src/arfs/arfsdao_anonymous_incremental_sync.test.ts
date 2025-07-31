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
	stubPublicDrive
} from '../../tests/stubs';
import {
	DriveSyncState,
	EntitySyncState,
	UnixTime,
	GQLEdgeInterface,
	GQLNodeInterface,
	EID,
	TxID,
	IncrementalSyncResult,
	DriveID
} from '../types';
import {
	ArFSDAOAnonymousIncrementalSync,
	ArFSIncrementalSyncCache,
	defaultArFSIncrementalSyncCache
} from './arfsdao_anonymous_incremental_sync';
import { PromiseCache } from '@ardrive/ardrive-promise-cache';
import { GatewayAPI } from '../utils/gateway_api';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

describe('ArFSDAOAnonymousIncrementalSync class', () => {
	let arfsDaoIncSync: ArFSDAOAnonymousIncrementalSync;
	let gatewayApiStub: SinonStub;
	let caches: ArFSIncrementalSyncCache;

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
			{ name: 'Folder-Id', value: stubEntityIDAlt.toString() }
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

	beforeEach(() => {
		caches = {
			...defaultArFSIncrementalSyncCache,
			syncStateCache: new PromiseCache<DriveID, DriveSyncState>({
				cacheCapacity: 100,
				cacheTTL: 1000 * 60 * 5
			})
		};

		// Create gateway API stub
		const gatewayApi = new GatewayAPI({
			gatewayUrl: new URL('https://arweave.net')
		});

		gatewayApiStub = stub(gatewayApi, 'gqlRequest');

		arfsDaoIncSync = new ArFSDAOAnonymousIncrementalSync(fakeArweave, 'test_app', '0.0', caches, gatewayApi);
	});

	afterEach(() => {
		gatewayApiStub.restore();
	});

	describe('getPublicDriveIncrementalSync', () => {
		it('should perform initial sync when no previous state exists', async () => {
			// Mock drive metadata fetch
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			// Mock GraphQL responses
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: false }
			});
			gatewayApiStub.onSecondCall().resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner);

			expect(result.entities).to.have.lengthOf(1);
			expect(result.changes.added).to.have.lengthOf(1);
			expect(result.changes.modified).to.have.lengthOf(0);
			expect(result.changes.unreachable).to.have.lengthOf(0);
			expect(result.newSyncState.lastSyncedBlockHeight).to.equal(1000000);
			expect(result.stats.totalProcessed).to.equal(1);
		});

		it('should detect new entities when syncing with previous state', async () => {
			const previousState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 999999,
				lastSyncedTimestamp: new UnixTime(1639000000000),
				entityStates: new Map()
			};

			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, {
				syncState: previousState
			});

			// Verify minBlock parameter was used
			const gqlCall = gatewayApiStub.firstCall.args[0];
			expect(gqlCall.query).to.include('min: 1000000'); // Previous + 1
			expect(result.changes.added).to.have.lengthOf(1);
		});

		it('should detect modified entities', async () => {
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
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 999999,
				lastSyncedTimestamp: new UnixTime(1639000000000),
				entityStates: new Map([[stubEntityIDAlt.toString(), existingEntityState]])
			};

			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			// Return modified entity with new txId
			const modifiedNode = createMockGQLNode({
				id: stubTxIDAlt.toString(),
				tags: [
					{ name: 'Drive-Id', value: mockDriveId.toString() },
					{ name: 'Entity-Type', value: 'folder' },
					{ name: 'Folder-Id', value: stubEntityIDAlt.toString() },
					{ name: 'Name', value: 'new-name' }
				]
			});

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge(modifiedNode)],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, {
				syncState: previousState
			});

			expect(result.changes.modified).to.have.lengthOf(1);
			expect(result.changes.added).to.have.lengthOf(0);
		});

		it('should handle batch processing with multiple pages', async () => {
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			// First call returns batch with hasNextPage true
			gatewayApiStub.onCall(0).resolves({
				edges: [
					createMockGQLEdge(
						createMockGQLNode({
							tags: [
								{ name: 'Drive-Id', value: mockDriveId.toString() },
								{ name: 'Entity-Type', value: 'folder' },
								{ name: 'Folder-Id', value: EID('folder-1').toString() }
							]
						})
					)
				],
				pageInfo: { hasNextPage: true }
			});

			// Second call returns another batch
			gatewayApiStub.onCall(1).resolves({
				edges: [
					createMockGQLEdge(
						createMockGQLNode({
							tags: [
								{ name: 'Drive-Id', value: mockDriveId.toString() },
								{ name: 'Entity-Type', value: 'folder' },
								{ name: 'Folder-Id', value: EID('folder-2').toString() }
							]
						})
					)
				],
				pageInfo: { hasNextPage: false }
			});

			// Files queries
			gatewayApiStub.onCall(2).resolves({
				edges: [],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, { batchSize: 1 });

			expect(result.entities).to.have.lengthOf(2);
			expect(result.stats.totalProcessed).to.equal(2);
		});

		it('should stop early when finding known entities', async () => {
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
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 999999,
				lastSyncedTimestamp: new UnixTime(1639000000000),
				entityStates: new Map([[stubEntityIDAlt.toString(), knownEntity]])
			};

			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			// Return 11 entities, but 10th one is known
			const edges: GQLEdgeInterface[] = [];
			for (let i = 0; i < 11; i++) {
				const entityId = i === 9 ? stubEntityIDAlt : EID(`entity-${i}`);
				const txId = i === 9 ? stubTxID : TxID(`tx-${i}`);

				edges.push(
					createMockGQLEdge(
						createMockGQLNode({
							id: txId.toString(),
							tags: [
								{ name: 'Drive-Id', value: mockDriveId.toString() },
								{ name: 'Entity-Type', value: 'folder' },
								{ name: 'Folder-Id', value: entityId.toString() }
							]
						})
					)
				);
			}

			gatewayApiStub.resolves({
				edges,
				pageInfo: { hasNextPage: true } // Would have more, but should stop
			});

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, {
				syncState: previousState,
				stopAfterKnownCount: 1 // Stop after finding 1 known entity
			});

			// Should only process up to and including the known entity
			expect(result.entities.length).to.be.at.most(10);
		});

		it('should track progress via callback', async () => {
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: false }
			});

			const progressUpdates: Array<{ processed: number; total: number }> = [];

			await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, {
				onProgress: (processed, total) => {
					progressUpdates.push({ processed, total });
				}
			});

			expect(progressUpdates.length).to.be.greaterThan(0);
			expect(progressUpdates[0].processed).to.equal(1);
			expect(progressUpdates[0].total).to.equal(-1); // Unknown during streaming
		});

		it('should cache sync state after successful sync', async () => {
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: false }
			});

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner);

			// Check that sync state was cached
			const cachedState = await arfsDaoIncSync.getCachedSyncState(mockDriveId);
			expect(cachedState).to.exist;
			expect(cachedState!.lastSyncedBlockHeight).to.equal(result.newSyncState.lastSyncedBlockHeight);
		});

		it('should include revision filtering when requested', async () => {
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			// Return multiple revisions of same entity
			const entity1Rev1 = createMockGQLNode({
				block: { id: 'block1', height: 1000000, timestamp: 1640000000, previous: 'prev1' }
			});
			const entity1Rev2 = createMockGQLNode({
				block: { id: 'block2', height: 1000001, timestamp: 1640001000, previous: 'block1' }
			});

			gatewayApiStub.resolves({
				edges: [createMockGQLEdge(entity1Rev1), createMockGQLEdge(entity1Rev2)],
				pageInfo: { hasNextPage: false }
			});

			const resultWithRevisions = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, {
				includeRevisions: true
			});

			expect(resultWithRevisions.entities).to.have.lengthOf(2);

			const resultWithoutRevisions = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner, {
				includeRevisions: false
			});

			// Should filter to latest revision only
			expect(resultWithoutRevisions.entities.length).to.be.lessThan(2);
		});

		it('should throw IncrementalSyncError with partial results on failure', async () => {
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());

			// First call succeeds
			gatewayApiStub.onFirstCall().resolves({
				edges: [createMockGQLEdge()],
				pageInfo: { hasNextPage: true }
			});

			// Second call fails
			gatewayApiStub.onSecondCall().rejects(new Error('Network error'));

			try {
				await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner);
				expect.fail('Should have thrown error');
			} catch (error) {
				expect((error as Error).name).to.equal('IncrementalSyncError');
				const syncError = error as { partialResult: IncrementalSyncResult };
				expect(syncError.partialResult).to.exist;
				expect(syncError.partialResult.stats.totalProcessed).to.equal(1);
			}
		});
	});

	describe('getCachedSyncState and setCachedSyncState', () => {
		it('should store and retrieve sync state from cache', async () => {
			const syncState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			arfsDaoIncSync.setCachedSyncState(mockDriveId, syncState);
			const retrieved = await arfsDaoIncSync.getCachedSyncState(mockDriveId);

			expect(retrieved).to.exist;
			expect(retrieved!.lastSyncedBlockHeight).to.equal(syncState.lastSyncedBlockHeight);
		});

		it('should return undefined for non-cached drive', async () => {
			const retrieved = await arfsDaoIncSync.getCachedSyncState(EID('non-existent'));
			expect(retrieved).to.be.undefined;
		});
	});
});
