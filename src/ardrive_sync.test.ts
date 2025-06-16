import { expect } from 'chai';
import { stub, SinonStub, restore } from 'sinon';
import { ArDrive } from './ardrive';
import { ArFSDAO } from './arfs/arfsdao';
import { Wallet } from './wallet';
import { stubEntityID, stubDriveKey, stubArweaveAddress } from '../tests/stubs';
import { EID, TxID, FolderID, DriveID } from './types';
import { 
	DriveSyncState, 
	EntitySyncState, 
	IncrementalSyncResult,
	ArFSAllEntities 
} from './types/arfsdao_types';
import {
	serializeSyncState,
	deserializeSyncState,
	createInitialSyncState
} from './utils/sync_state';

describe('ArDrive - Sync Methods', () => {
	let arDrive: ArDrive;
	let arFSDAOStub: SinonStub;
	let walletStub: SinonStub;
	const testDriveId = stubEntityID();
	const testOwner = stubArweaveAddress();
	const testDriveKey = stubDriveKey();

	beforeEach(() => {
		// Create ArDrive instance with mocked dependencies
		const mockArFSDAO = {} as ArFSDAO;
		const mockWallet = {} as Wallet;
		
		arDrive = new ArDrive(
			mockWallet,
			mockArFSDAO,
			false, // dryRun
			'test-app',
			'1.0.0',
			'AR' // arFSMode
		);

		// Stub wallet to return test address
		walletStub = stub(arDrive['wallet'], 'getAddress').resolves(testOwner);
	});

	afterEach(() => {
		restore();
	});

	describe('syncPublicDrive', () => {
		beforeEach(() => {
			// Stub the DAO method
			arFSDAOStub = stub(arDrive['arFsDao'], 'getPublicDriveIncrementalSync');
		});

		it('should call DAO with correct parameters for initial sync', async () => {
			// Mock sync result
			const mockResult: IncrementalSyncResult = {
				entities: [],
				newSyncState: createInitialSyncState(testDriveId),
				changes: { added: [], modified: [], possiblyDeleted: [] },
				stats: { totalProcessed: 0, highestBlockHeight: 0, lowestBlockHeight: 0 }
			};

			arFSDAOStub.resolves(mockResult);

			// Perform sync
			const result = await arDrive.syncPublicDrive(testDriveId);

			// Verify DAO was called correctly
			expect(arFSDAOStub.calledOnce).to.be.true;
			expect(arFSDAOStub.firstCall.args[0]).to.equal(testDriveId);
			expect(arFSDAOStub.firstCall.args[1]).to.equal(testOwner);
			expect(arFSDAOStub.firstCall.args[2]).to.deep.equal({});

			// Verify result
			expect(result).to.deep.equal(mockResult);
		});

		it('should pass sync options correctly', async () => {
			// Create previous sync state
			const previousState: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map([
					['entity-1', {
						entityId: EID('entity-1'),
						txId: TxID('tx-1'),
						blockHeight: 1000000,
						name: 'Entity 1'
					}]
				])
			};

			// Mock sync result
			const mockResult: IncrementalSyncResult = {
				entities: [],
				newSyncState: previousState,
				changes: { added: [], modified: [], possiblyDeleted: [] },
				stats: { totalProcessed: 0, highestBlockHeight: 1000000, lowestBlockHeight: 1000000 }
			};

			arFSDAOStub.resolves(mockResult);

			// Progress tracking
			let progressCalled = false;
			const onProgress = () => { progressCalled = true; };

			// Perform sync with options
			const result = await arDrive.syncPublicDrive(testDriveId, {
				syncState: previousState,
				includeRevisions: true,
				onProgress,
				batchSize: 50,
				stopAfterKnownCount: 5
			});

			// Verify options were passed
			const passedOptions = arFSDAOStub.firstCall.args[2];
			expect(passedOptions.syncState).to.equal(previousState);
			expect(passedOptions.includeRevisions).to.be.true;
			expect(passedOptions.onProgress).to.equal(onProgress);
			expect(passedOptions.batchSize).to.equal(50);
			expect(passedOptions.stopAfterKnownCount).to.equal(5);
		});

		it('should handle sync state serialization/deserialization workflow', async () => {
			// Create initial sync state
			const initialState = createInitialSyncState(testDriveId);

			// Mock first sync result with some entities
			const firstSyncResult: IncrementalSyncResult = {
				entities: [
					{
						entityType: 'folder',
						entityId: EID('folder-1'),
						driveId: testDriveId,
						parentFolderId: EID('root'),
						name: 'Folder 1',
						txId: TxID('tx-folder-1'),
						unixTime: 1234567890,
						lastModifiedDate: 1234567890
					} as ArFSAllEntities
				],
				newSyncState: {
					driveId: testDriveId,
					lastSyncedBlockHeight: 1000001,
					lastSyncedTimestamp: Date.now(),
					entityStates: new Map([
						['folder-1', {
							entityId: EID('folder-1'),
							txId: TxID('tx-folder-1'),
							blockHeight: 1000001,
							parentFolderId: EID('root'),
							name: 'Folder 1'
						}]
					])
				},
				changes: {
					added: [firstSyncResult.entities[0]],
					modified: [],
					possiblyDeleted: []
				},
				stats: {
					totalProcessed: 1,
					highestBlockHeight: 1000001,
					lowestBlockHeight: 1000001
				}
			};

			arFSDAOStub.onFirstCall().resolves(firstSyncResult);

			// First sync
			const firstSync = await arDrive.syncPublicDrive(testDriveId);

			// Serialize sync state (simulating saving to disk)
			const serializedState = serializeSyncState(firstSync.newSyncState);
			expect(serializedState).to.be.a('string');

			// Deserialize sync state (simulating loading from disk)
			const deserializedState = deserializeSyncState(serializedState);

			// Mock second sync result
			const secondSyncResult: IncrementalSyncResult = {
				entities: [],
				newSyncState: deserializedState,
				changes: { added: [], modified: [], possiblyDeleted: [] },
				stats: { totalProcessed: 0, highestBlockHeight: 1000001, lowestBlockHeight: 1000001 }
			};

			arFSDAOStub.onSecondCall().resolves(secondSyncResult);

			// Second sync with deserialized state
			const secondSync = await arDrive.syncPublicDrive(testDriveId, {
				syncState: deserializedState
			});

			// Verify state was preserved
			expect(secondSync.newSyncState.lastSyncedBlockHeight).to.equal(1000001);
			expect(secondSync.newSyncState.entityStates.size).to.equal(1);
		});
	});

	describe('syncPrivateDrive', () => {
		beforeEach(() => {
			// Stub the DAO method
			arFSDAOStub = stub(arDrive['arFsDao'], 'getPrivateDriveIncrementalSync');
		});

		it('should call DAO with correct parameters including drive key', async () => {
			// Mock sync result
			const mockResult: IncrementalSyncResult = {
				entities: [],
				newSyncState: createInitialSyncState(testDriveId),
				changes: { added: [], modified: [], possiblyDeleted: [] },
				stats: { totalProcessed: 0, highestBlockHeight: 0, lowestBlockHeight: 0 }
			};

			arFSDAOStub.resolves(mockResult);

			// Perform sync
			const result = await arDrive.syncPrivateDrive(testDriveId, testDriveKey);

			// Verify DAO was called correctly
			expect(arFSDAOStub.calledOnce).to.be.true;
			expect(arFSDAOStub.firstCall.args[0]).to.equal(testDriveId);
			expect(arFSDAOStub.firstCall.args[1]).to.equal(testOwner);
			expect(arFSDAOStub.firstCall.args[2]).to.equal(testDriveKey);
			expect(arFSDAOStub.firstCall.args[3]).to.deep.equal({});

			// Verify result
			expect(result).to.deep.equal(mockResult);
		});

		it('should handle all sync options for private drives', async () => {
			// Create previous sync state
			const previousState: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map()
			};

			// Mock sync result
			const mockResult: IncrementalSyncResult = {
				entities: [],
				newSyncState: previousState,
				changes: { added: [], modified: [], possiblyDeleted: [] },
				stats: { totalProcessed: 0, highestBlockHeight: 1000000, lowestBlockHeight: 1000000 }
			};

			arFSDAOStub.resolves(mockResult);

			// Progress tracking
			const progressUpdates: Array<{ processed: number; total: number }> = [];
			const onProgress = (processed: number, total: number) => {
				progressUpdates.push({ processed, total });
			};

			// Perform sync with all options
			await arDrive.syncPrivateDrive(testDriveId, testDriveKey, {
				syncState: previousState,
				includeRevisions: false,
				onProgress,
				batchSize: 25,
				stopAfterKnownCount: 3
			});

			// Verify all options were passed correctly
			const passedOptions = arFSDAOStub.firstCall.args[3];
			expect(passedOptions.syncState).to.equal(previousState);
			expect(passedOptions.includeRevisions).to.be.false;
			expect(passedOptions.onProgress).to.equal(onProgress);
			expect(passedOptions.batchSize).to.equal(25);
			expect(passedOptions.stopAfterKnownCount).to.equal(3);
		});

		it('should handle sync workflow with state persistence', async () => {
			// Mock initial sync with private entities
			const initialSyncResult: IncrementalSyncResult = {
				entities: [
					{
						entityType: 'file',
						entityId: EID('file-1'),
						driveId: testDriveId,
						parentFolderId: EID('root'),
						name: 'secret.txt',
						txId: TxID('tx-file-1'),
						unixTime: 1234567890,
						lastModifiedDate: 1234567890,
						size: 1024,
						dataContentType: 'text/plain',
						dataTxId: TxID('data-tx-1'),
						cipher: 'AES256-GCM',
						cipherIV: 'test-iv'
					} as ArFSAllEntities
				],
				newSyncState: {
					driveId: testDriveId,
					lastSyncedBlockHeight: 1000005,
					lastSyncedTimestamp: Date.now(),
					entityStates: new Map([
						['file-1', {
							entityId: EID('file-1'),
							txId: TxID('tx-file-1'),
							blockHeight: 1000005,
							parentFolderId: EID('root'),
							name: 'secret.txt'
						}]
					])
				},
				changes: {
					added: [],
					modified: [],
					possiblyDeleted: []
				},
				stats: {
					totalProcessed: 1,
					highestBlockHeight: 1000005,
					lowestBlockHeight: 1000005
				}
			};

			arFSDAOStub.resolves(initialSyncResult);

			// Perform initial sync
			const result = await arDrive.syncPrivateDrive(testDriveId, testDriveKey);

			// Verify private entity was synced
			expect(result.entities).to.have.length(1);
			expect(result.entities[0].entityType).to.equal('file');
			expect('cipher' in result.entities[0]).to.be.true;

			// Serialize and deserialize state
			const serialized = serializeSyncState(result.newSyncState);
			const deserialized = deserializeSyncState(serialized);

			// Verify state integrity after serialization
			expect(deserialized.driveId.toString()).to.equal(testDriveId.toString());
			expect(deserialized.lastSyncedBlockHeight).to.equal(1000005);
			expect(deserialized.entityStates.size).to.equal(1);
		});
	});

	describe('Error handling', () => {
		it('should propagate errors from syncPublicDrive', async () => {
			const error = new Error('Network error');
			arFSDAOStub = stub(arDrive['arFsDao'], 'getPublicDriveIncrementalSync').rejects(error);

			await expect(arDrive.syncPublicDrive(testDriveId)).to.be.rejectedWith('Network error');
		});

		it('should propagate errors from syncPrivateDrive', async () => {
			const error = new Error('Decryption failed');
			arFSDAOStub = stub(arDrive['arFsDao'], 'getPrivateDriveIncrementalSync').rejects(error);

			await expect(arDrive.syncPrivateDrive(testDriveId, testDriveKey)).to.be.rejectedWith('Decryption failed');
		});

		it('should handle invalid sync state gracefully', async () => {
			// Invalid JSON should throw during deserialization
			const invalidJson = '{ invalid json }';
			expect(() => deserializeSyncState(invalidJson)).to.throw();
		});
	});

	describe('Real-world usage patterns', () => {
		it('should support continuous sync workflow', async () => {
			// Simulate a real sync workflow over multiple iterations
			let currentState: DriveSyncState | undefined;

			// Mock different results for each sync
			const syncResults = [
				// First sync - initial data
				{
					entities: [{ entityType: 'folder', entityId: EID('f1'), name: 'Folder 1' }],
					changes: { added: [{ entityType: 'folder' }], modified: [], possiblyDeleted: [] },
					newSyncState: {
						driveId: testDriveId,
						lastSyncedBlockHeight: 1000000,
						lastSyncedTimestamp: Date.now(),
						entityStates: new Map([['f1', { entityId: EID('f1'), txId: TxID('tx1'), blockHeight: 1000000 }]])
					},
					stats: { totalProcessed: 1, highestBlockHeight: 1000000, lowestBlockHeight: 1000000 }
				},
				// Second sync - new file added
				{
					entities: [{ entityType: 'file', entityId: EID('file1'), name: 'File 1' }],
					changes: { added: [{ entityType: 'file' }], modified: [], possiblyDeleted: [] },
					newSyncState: {
						driveId: testDriveId,
						lastSyncedBlockHeight: 1000010,
						lastSyncedTimestamp: Date.now(),
						entityStates: new Map([
							['f1', { entityId: EID('f1'), txId: TxID('tx1'), blockHeight: 1000000 }],
							['file1', { entityId: EID('file1'), txId: TxID('tx2'), blockHeight: 1000010 }]
						])
					},
					stats: { totalProcessed: 1, highestBlockHeight: 1000010, lowestBlockHeight: 1000010 }
				},
				// Third sync - folder modified
				{
					entities: [{ entityType: 'folder', entityId: EID('f1'), name: 'Folder 1 Renamed' }],
					changes: { added: [], modified: [{ entityType: 'folder' }], possiblyDeleted: [] },
					newSyncState: {
						driveId: testDriveId,
						lastSyncedBlockHeight: 1000020,
						lastSyncedTimestamp: Date.now(),
						entityStates: new Map([
							['f1', { entityId: EID('f1'), txId: TxID('tx3'), blockHeight: 1000020 }],
							['file1', { entityId: EID('file1'), txId: TxID('tx2'), blockHeight: 1000010 }]
						])
					},
					stats: { totalProcessed: 1, highestBlockHeight: 1000020, lowestBlockHeight: 1000020 }
				}
			] as IncrementalSyncResult[];

			arFSDAOStub = stub(arDrive['arFsDao'], 'getPublicDriveIncrementalSync');
			syncResults.forEach((result, index) => {
				arFSDAOStub.onCall(index).resolves(result);
			});

			// Perform multiple syncs
			for (let i = 0; i < syncResults.length; i++) {
				const result = await arDrive.syncPublicDrive(testDriveId, {
					syncState: currentState
				});

				// Verify incremental changes
				if (i === 0) {
					expect(result.changes.added).to.have.length(1);
				} else if (i === 1) {
					expect(result.changes.added).to.have.length(1);
				} else if (i === 2) {
					expect(result.changes.modified).to.have.length(1);
				}

				// Update state for next iteration
				currentState = result.newSyncState;

				// Simulate persistence
				const serialized = serializeSyncState(currentState);
				currentState = deserializeSyncState(serialized);
			}

			// Verify final state
			expect(currentState!.lastSyncedBlockHeight).to.equal(1000020);
			expect(currentState!.entityStates.size).to.equal(2);
		});
	});
});