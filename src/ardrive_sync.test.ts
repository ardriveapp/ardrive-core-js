import { expect } from 'chai';
import { stub, SinonStub, restore } from 'sinon';
import { ArDrive } from './ardrive';
import {
	stubEntityID,
	getStubDriveKey,
	stubArweaveAddress,
	stubPublicFolder,
	stubPrivateFile,
	stubPublicFile
} from '../tests/stubs';
import { EID, TxID, DriveKey, DriveID, IncrementalSyncOptions } from './types';
import { DriveSyncState, IncrementalSyncResult } from './types/arfsdao_types';
import { serializeSyncState, deserializeSyncState, createInitialSyncState } from './utils/sync_state';
import { expectAsyncErrorThrow } from '../tests/test_helpers';

describe('ArDrive - Sync Methods', () => {
	let arDrive: ArDrive;
	let arFSDAOStub: SinonStub;
	const testDriveId = stubEntityID;
	const testOwner = stubArweaveAddress();
	let testDriveKey: DriveKey;

	beforeEach(async () => {
		// Get test drive key
		testDriveKey = await getStubDriveKey();

		// Create ArDrive instance with stubbed ArFSDAO
		const mockWallet = {
			getAddress: stub().resolves(testOwner)
		};
		const mockArFsDao = {
			getPublicDriveIncrementalSync: stub(),
			getPrivateDriveIncrementalSync: stub()
		};

		arDrive = {
			syncPublicDrive: async function (driveId: DriveID, options?: IncrementalSyncOptions) {
				return mockArFsDao.getPublicDriveIncrementalSync(driveId, await mockWallet.getAddress(), options);
			},
			syncPrivateDrive: async function (driveId: DriveID, driveKey: DriveKey, options?: IncrementalSyncOptions) {
				return mockArFsDao.getPrivateDriveIncrementalSync(
					driveId,
					driveKey,
					await mockWallet.getAddress(),
					options
				);
			},
			wallet: mockWallet,
			arFsDao: mockArFsDao
		} as unknown as ArDrive;
	});

	afterEach(() => {
		restore();
	});

	describe('syncPublicDrive', () => {
		beforeEach(() => {
			// Stub the DAO method
			arFSDAOStub = arDrive['arFsDao'].getPublicDriveIncrementalSync as SinonStub;
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
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('tx-1'),
							blockHeight: 1000000,
							name: 'Entity 1'
						}
					]
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
			const onProgress = () => {
				// Progress callback
			};

			// Perform sync with options
			await arDrive.syncPublicDrive(testDriveId, {
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
			// Create a mock public folder entity
			const mockFolder = stubPublicFolder({
				folderId: EID('folder-1'),
				parentFolderId: EID('root'),
				folderName: 'Folder 1',
				driveId: testDriveId
			});

			// Mock first sync result with some entities
			const firstSyncResult: IncrementalSyncResult = {
				entities: [mockFolder],
				newSyncState: {
					driveId: testDriveId,
					lastSyncedBlockHeight: 1000001,
					lastSyncedTimestamp: Date.now(),
					entityStates: new Map([
						[
							'folder-1',
							{
								entityId: EID('folder-1'),
								txId: TxID('tx-folder-1'),
								blockHeight: 1000001,
								parentFolderId: EID('root'),
								name: 'Folder 1'
							}
						]
					])
				},
				changes: {
					added: [mockFolder],
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
			arFSDAOStub = arDrive['arFsDao'].getPrivateDriveIncrementalSync as SinonStub;
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
			expect(arFSDAOStub.firstCall.args[1]).to.equal(testDriveKey);
			expect(arFSDAOStub.firstCall.args[2]).to.equal(testOwner);
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
			// Create a mock private file entity
			const mockPrivateFile = await stubPrivateFile({
				fileId: EID('file-1'),
				parentFolderId: EID('root'),
				fileName: 'secret.txt',
				driveId: testDriveId,
				txId: TxID('tx-file-1'),
				dataTxId: TxID('data-tx-1')
			});

			// Mock initial sync with private entities
			const initialSyncResult: IncrementalSyncResult = {
				entities: [mockPrivateFile],
				newSyncState: {
					driveId: testDriveId,
					lastSyncedBlockHeight: 1000005,
					lastSyncedTimestamp: Date.now(),
					entityStates: new Map([
						[
							'file-1',
							{
								entityId: EID('file-1'),
								txId: TxID('tx-file-1'),
								blockHeight: 1000005,
								parentFolderId: EID('root'),
								name: 'secret.txt'
							}
						]
					])
				},
				changes: {
					added: [mockPrivateFile],
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
			// Check if it's a private file by checking for cipher property
			const privateFile = result.entities[0];
			if (privateFile.entityType === 'file' && 'cipher' in privateFile) {
				expect(privateFile.cipher).to.exist;
			}

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
			arFSDAOStub = arDrive['arFsDao'].getPublicDriveIncrementalSync as SinonStub;
			arFSDAOStub.rejects(error);

			await expectAsyncErrorThrow({
				promiseToError: arDrive.syncPublicDrive(testDriveId),
				errorMessage: 'Network error'
			});
		});

		it('should propagate errors from syncPrivateDrive', async () => {
			const error = new Error('Decryption failed');
			arFSDAOStub = arDrive['arFsDao'].getPrivateDriveIncrementalSync as SinonStub;
			arFSDAOStub.rejects(error);

			await expectAsyncErrorThrow({
				promiseToError: arDrive.syncPrivateDrive(testDriveId, testDriveKey),
				errorMessage: 'Decryption failed'
			});
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

			// Create mock entities
			const mockFolder1 = stubPublicFolder({
				folderId: EID('f1'),
				folderName: 'Folder 1',
				driveId: testDriveId
			});

			const mockFile1 = stubPublicFile({
				fileId: EID('file1'),
				fileName: 'File 1',
				driveId: testDriveId
			});

			const mockFolder1Renamed = stubPublicFolder({
				folderId: EID('f1'),
				folderName: 'Folder 1 Renamed',
				driveId: testDriveId
			});

			// Mock different results for each sync
			const syncResults = [
				// First sync - initial data
				{
					entities: [mockFolder1],
					changes: { added: [mockFolder1], modified: [], possiblyDeleted: [] },
					newSyncState: {
						driveId: testDriveId,
						lastSyncedBlockHeight: 1000000,
						lastSyncedTimestamp: Date.now(),
						entityStates: new Map([
							['f1', { entityId: EID('f1'), txId: TxID('tx1'), blockHeight: 1000000, name: 'Folder 1' }]
						])
					},
					stats: { totalProcessed: 1, highestBlockHeight: 1000000, lowestBlockHeight: 1000000 }
				},
				// Second sync - new file added
				{
					entities: [mockFile1],
					changes: { added: [mockFile1], modified: [], possiblyDeleted: [] },
					newSyncState: {
						driveId: testDriveId,
						lastSyncedBlockHeight: 1000010,
						lastSyncedTimestamp: Date.now(),
						entityStates: new Map([
							['f1', { entityId: EID('f1'), txId: TxID('tx1'), blockHeight: 1000000, name: 'Folder 1' }],
							[
								'file1',
								{ entityId: EID('file1'), txId: TxID('tx2'), blockHeight: 1000010, name: 'File 1' }
							]
						])
					},
					stats: { totalProcessed: 1, highestBlockHeight: 1000010, lowestBlockHeight: 1000010 }
				},
				// Third sync - folder modified
				{
					entities: [mockFolder1Renamed],
					changes: { added: [], modified: [mockFolder1Renamed], possiblyDeleted: [] },
					newSyncState: {
						driveId: testDriveId,
						lastSyncedBlockHeight: 1000020,
						lastSyncedTimestamp: Date.now(),
						entityStates: new Map([
							[
								'f1',
								{
									entityId: EID('f1'),
									txId: TxID('tx3'),
									blockHeight: 1000020,
									name: 'Folder 1 Renamed'
								}
							],
							[
								'file1',
								{ entityId: EID('file1'), txId: TxID('tx2'), blockHeight: 1000010, name: 'File 1' }
							]
						])
					},
					stats: { totalProcessed: 1, highestBlockHeight: 1000020, lowestBlockHeight: 1000020 }
				}
			] as IncrementalSyncResult[];

			arFSDAOStub = arDrive['arFsDao'].getPublicDriveIncrementalSync as SinonStub;
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
