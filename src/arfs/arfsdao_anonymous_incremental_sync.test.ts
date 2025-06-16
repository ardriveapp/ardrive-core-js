import { expect } from 'chai';
import { stub, SinonStub, restore } from 'sinon';
import Arweave from 'arweave';
import { stubArweaveAddress } from '../../tests/stubs';
import {
	createMockDriveNode,
	createMockFolderNode,
	createMockFileNode,
	createMockGQLResponse,
	createMockEdge,
	mockDriveMetadata,
	mockFolderMetadata,
	mockFileMetadata
} from '../../tests/mocks/gql_mock_responses';
import { EID, TxID } from '../types';
import { ArFSDAOAnonymous, defaultArFSAnonymousCache } from './arfsdao_anonymous';
import axios from 'axios';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

describe('ArFSDAOAnonymous - Incremental Sync Tests', () => {
	let arfsDao: ArFSDAOAnonymous;
	let gatewayApiStub: SinonStub;
	let axiosGetStub: SinonStub;
	const testDriveId = EID('test-drive-123');
	const testOwner = stubArweaveAddress();
	const rootFolderId = EID('root-folder-123');
	const fileId = EID('file-123');

	beforeEach(() => {
		// Create fresh DAO instance
		arfsDao = new ArFSDAOAnonymous(fakeArweave, 'test_app', '0.0', defaultArFSAnonymousCache);

		// Stub axios for metadata fetching
		axiosGetStub = stub(axios, 'get');
	});

	afterEach(() => {
		restore();
	});

	describe('getPublicDriveIncrementalSync', () => {
		beforeEach(() => {
			// Stub the gateway API
			gatewayApiStub = stub(arfsDao['gatewayApi'], 'gqlRequest');
		});

		it('should perform initial sync and return all entities', async () => {
			// Mock responses for each entity type
			const driveNode = createMockDriveNode(testDriveId.toString(), 1000000);
			const folderNode = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000001);
			const fileNode = createMockFileNode(
				fileId.toString(),
				testDriveId.toString(),
				rootFolderId.toString(),
				1000002
			);

			// Mock GraphQL responses for each entity type query
			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([createMockEdge(driveNode)], false));
			gatewayApiStub.onSecondCall().resolves(createMockGQLResponse([createMockEdge(folderNode)], false));
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([createMockEdge(fileNode)], false));

			// Mock metadata responses
			axiosGetStub.resolves({
				data: mockDriveMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform initial sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner);

			// Verify results
			expect(result.entities).to.have.length(3);
			expect(result.changes.added).to.have.length(3);
			expect(result.changes.modified).to.have.length(0);
			expect(result.changes.possiblyDeleted).to.have.length(0);
			expect(result.newSyncState.lastSyncedBlockHeight).to.equal(1000002);
			expect(result.newSyncState.entityStates.size).to.equal(3);
			expect(result.stats.totalProcessed).to.equal(3);
			expect(result.stats.lowestBlockHeight).to.equal(1000000);
			expect(result.stats.highestBlockHeight).to.equal(1000002);
		});

		it('should detect new entities in incremental sync', async () => {
			// Create previous sync state
			const previousSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000001,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map([
					[
						testDriveId.toString(),
						{
							entityId: testDriveId,
							txId: TxID('drive-tx-1000000'),
							blockHeight: 1000000,
							name: 'Test Drive'
						}
					],
					[
						rootFolderId.toString(),
						{
							entityId: rootFolderId,
							txId: TxID('folder-tx-1000001'),
							blockHeight: 1000001,
							parentFolderId: undefined,
							name: 'Root Folder'
						}
					]
				])
			};

			// New file added after last sync
			const newFileNode = createMockFileNode(
				fileId.toString(),
				testDriveId.toString(),
				rootFolderId.toString(),
				1000003
			);

			// Mock responses - empty for drive and folder (no changes), new file
			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([], false));
			gatewayApiStub.onSecondCall().resolves(createMockGQLResponse([], false));
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([createMockEdge(newFileNode)], false));

			// Mock metadata response
			axiosGetStub.resolves({
				data: mockFileMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform incremental sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner, {
				syncState: previousSyncState
			});

			// Verify only new entity is returned
			expect(result.entities).to.have.length(1);
			expect(result.changes.added).to.have.length(1);
			expect(result.changes.modified).to.have.length(0);
			expect(result.changes.possiblyDeleted).to.have.length(0);
			expect(result.newSyncState.lastSyncedBlockHeight).to.equal(1000003);
			expect(result.newSyncState.entityStates.size).to.equal(3); // Previous 2 + new 1
		});

		it('should detect modified entities', async () => {
			// Create previous sync state
			const previousSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000001,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map([
					[
						rootFolderId.toString(),
						{
							entityId: rootFolderId,
							txId: TxID('folder-tx-1000001'),
							blockHeight: 1000001,
							parentFolderId: undefined,
							name: 'Old Folder Name'
						}
					]
				])
			};

			// Modified folder (same ID, new transaction)
			const modifiedFolderNode = createMockFolderNode(
				rootFolderId.toString(),
				testDriveId.toString(),
				'',
				1000005
			);
			modifiedFolderNode.id = 'folder-tx-1000005'; // New transaction ID

			// Mock responses
			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([], false));
			gatewayApiStub.onSecondCall().resolves(createMockGQLResponse([createMockEdge(modifiedFolderNode)], false));
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([], false));

			// Mock metadata response
			axiosGetStub.resolves({
				data: { name: 'New Folder Name' },
				status: 200,
				statusText: 'OK'
			});

			// Perform incremental sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner, {
				syncState: previousSyncState
			});

			// Verify modification is detected
			expect(result.entities).to.have.length(1);
			expect(result.changes.added).to.have.length(0);
			expect(result.changes.modified).to.have.length(1);
			expect(result.changes.possiblyDeleted).to.have.length(0);
			const modifiedEntity = result.changes.modified[0];
			expect(modifiedEntity.name).to.equal('New Folder Name');
		});

		it('should detect possibly deleted entities', async () => {
			// Create previous sync state with multiple entities
			const previousSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000002,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map([
					[
						testDriveId.toString(),
						{
							entityId: testDriveId,
							txId: TxID('drive-tx-1000000'),
							blockHeight: 1000000,
							name: 'Test Drive'
						}
					],
					[
						rootFolderId.toString(),
						{
							entityId: rootFolderId,
							txId: TxID('folder-tx-1000001'),
							blockHeight: 1000001,
							parentFolderId: undefined,
							name: 'Root Folder'
						}
					],
					[
						fileId.toString(),
						{
							entityId: fileId,
							txId: TxID('file-tx-1000002'),
							blockHeight: 1000002,
							parentFolderId: rootFolderId,
							name: 'test.txt'
						}
					]
				])
			};

			// Only return drive and folder - file is "missing" (possibly deleted)
			const driveNode = createMockDriveNode(testDriveId.toString(), 1000000);
			const folderNode = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000001);

			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([createMockEdge(driveNode)], false));
			gatewayApiStub.onSecondCall().resolves(createMockGQLResponse([createMockEdge(folderNode)], false));
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([], false));

			// Mock metadata responses
			axiosGetStub.resolves({
				data: mockDriveMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform incremental sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner, {
				syncState: previousSyncState
			});

			// Verify deletion is detected
			expect(result.changes.possiblyDeleted).to.have.length(1);
			expect(result.changes.possiblyDeleted[0].toString()).to.equal(fileId.toString());
			expect(result.newSyncState.entityStates.size).to.equal(2); // File removed
		});

		it('should handle progress callback', async () => {
			const progressUpdates: Array<{ processed: number; total: number }> = [];
			const onProgress = (processed: number, total: number) => {
				progressUpdates.push({ processed, total });
			};

			// Mock some entities
			const driveNode = createMockDriveNode(testDriveId.toString(), 1000000);
			const folderNode = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000001);

			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([createMockEdge(driveNode)], false));
			gatewayApiStub.onSecondCall().resolves(createMockGQLResponse([createMockEdge(folderNode)], false));
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([], false));

			// Mock metadata responses
			axiosGetStub.resolves({
				data: mockDriveMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform sync with progress callback
			await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner, {
				onProgress
			});

			// Verify progress was reported
			expect(progressUpdates.length).to.be.greaterThan(0);
			progressUpdates.forEach((update) => {
				expect(update.processed).to.be.a('number');
				expect(update.total).to.be.a('number');
			});
		});

		it('should stop early when finding many known entities', async () => {
			// Create previous sync state
			const previousSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map()
			};

			// Add many known entities
			for (let i = 0; i < 20; i++) {
				previousSyncState.entityStates.set(`entity-${i}`, {
					entityId: EID(`entity-${i}`),
					txId: TxID(`tx-${i}`),
					blockHeight: 1000000 + i,
					name: `Entity ${i}`
				});
			}

			// Create response with known entities
			const knownEntities = [];
			for (let i = 0; i < 15; i++) {
				const node = createMockFolderNode(`entity-${i}`, testDriveId.toString(), '', 1000001 + i);
				node.id = `tx-${i}`; // Same transaction ID as in state
				knownEntities.push(createMockEdge(node));
			}

			// First call returns many known entities
			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([], false));
			gatewayApiStub.onSecondCall().resolves(
				createMockGQLResponse(knownEntities, true) // Has next page
			);
			// Third call should not happen due to early stopping
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([], false));

			// Mock metadata responses
			axiosGetStub.resolves({
				data: mockFolderMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform sync with low stopAfterKnownCount
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner, {
				syncState: previousSyncState,
				stopAfterKnownCount: 5
			});

			// Verify early stopping occurred
			expect(gatewayApiStub.callCount).to.be.lessThan(4); // Should stop before querying all types
			expect(result.stats.totalProcessed).to.be.greaterThanOrEqual(5);
		});

		it('should handle pagination correctly', async () => {
			// Create multiple pages of results
			const page1Nodes = [
				createMockFolderNode('folder-1', testDriveId.toString(), '', 1000001),
				createMockFolderNode('folder-2', testDriveId.toString(), '', 1000002)
			];
			const page2Nodes = [
				createMockFolderNode('folder-3', testDriveId.toString(), '', 1000003),
				createMockFolderNode('folder-4', testDriveId.toString(), '', 1000004)
			];

			// Mock paginated responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([], false)); // No drives
			gatewayApiStub.onCall(1).resolves(
				createMockGQLResponse(
					page1Nodes.map((n) => createMockEdge(n)),
					true
				) // Has next page
			);
			gatewayApiStub.onCall(2).resolves(
				createMockGQLResponse(
					page2Nodes.map((n) => createMockEdge(n)),
					false
				) // Last page
			);
			gatewayApiStub.onCall(3).resolves(createMockGQLResponse([], false)); // No files

			// Mock metadata responses
			axiosGetStub.resolves({
				data: mockFolderMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner);

			// Verify all entities from both pages were processed
			expect(result.entities).to.have.length(4);
			expect(result.stats.totalProcessed).to.equal(4);
		});

		it('should respect includeRevisions option', async () => {
			// Create multiple revisions of the same folder
			const revision1 = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000001);
			revision1.id = 'tx-rev-1';

			const revision2 = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000002);
			revision2.id = 'tx-rev-2';
			revision2.tags.find((t) => t.name === 'ArFS')!.value = '0.12'; // Different version

			// Mock response with multiple revisions
			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([], false));
			gatewayApiStub.onSecondCall().resolves(
				createMockGQLResponse(
					[
						createMockEdge(revision2), // Latest revision first (HEIGHT_DESC order)
						createMockEdge(revision1)
					],
					false
				)
			);
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([], false));

			// Mock metadata responses
			axiosGetStub.resolves({
				data: mockFolderMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Test with includeRevisions = false (default)
			const resultFiltered = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner);
			expect(resultFiltered.entities).to.have.length(1); // Only latest revision

			// Test with includeRevisions = true
			const resultAll = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner, {
				includeRevisions: true
			});
			expect(resultAll.entities).to.have.length(2); // All revisions
		});

		it('should handle empty results gracefully', async () => {
			// All queries return empty results
			gatewayApiStub.resolves(createMockGQLResponse([], false));

			// Perform sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner);

			// Verify empty but valid result
			expect(result.entities).to.have.length(0);
			expect(result.changes.added).to.have.length(0);
			expect(result.changes.modified).to.have.length(0);
			expect(result.changes.possiblyDeleted).to.have.length(0);
			expect(result.newSyncState.entityStates.size).to.equal(0);
			expect(result.stats.totalProcessed).to.equal(0);
			expect(result.stats.lowestBlockHeight).to.equal(0);
			expect(result.stats.highestBlockHeight).to.equal(0);
		});

		it('should handle corrupted entities gracefully', async () => {
			// Create a node with missing required tags
			const corruptedNode = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000001);
			// Remove Entity-Type tag to cause build failure
			corruptedNode.tags = corruptedNode.tags.filter((t) => t.name !== 'Entity-Type');

			const validNode = createMockFileNode(
				fileId.toString(),
				testDriveId.toString(),
				rootFolderId.toString(),
				1000002
			);

			// Mock responses with one corrupted and one valid entity
			gatewayApiStub.onFirstCall().resolves(createMockGQLResponse([], false));
			gatewayApiStub.onSecondCall().resolves(createMockGQLResponse([createMockEdge(corruptedNode)], false));
			gatewayApiStub.onThirdCall().resolves(createMockGQLResponse([createMockEdge(validNode)], false));

			// Mock metadata response for valid entity
			axiosGetStub.resolves({
				data: mockFileMetadata,
				status: 200,
				statusText: 'OK'
			});

			// Perform sync
			const result = await arfsDao.getPublicDriveIncrementalSync(testDriveId, testOwner);

			// Verify only valid entity is returned
			expect(result.entities).to.have.length(1);
			expect(result.entities[0].entityType).to.equal('file');
			expect(result.stats.totalProcessed).to.equal(1); // Only valid entity counted
		});
	});
});
