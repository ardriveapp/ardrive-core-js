import { expect } from 'chai';
import {
	createInitialSyncState,
	deserializeSyncState,
	diffSyncStates,
	mergeSyncStates,
	serializeSyncState
} from './sync_state';
import { DriveSyncState, EID, TxID } from '../types';

describe('Sync State Utilities', () => {
	const testDriveId = EID('00000000-0000-0000-0000-000000000000');

	describe('createInitialSyncState', () => {
		it('should create an empty sync state with zero values', () => {
			const state = createInitialSyncState(testDriveId);

			expect(state.driveId).to.equal(testDriveId);
			expect(state.lastSyncedBlockHeight).to.equal(0);
			expect(state.lastSyncedTimestamp).to.equal(0);
			expect(state.entityStates.size).to.equal(0);
		});
	});

	describe('serializeSyncState and deserializeSyncState', () => {
		it('should correctly serialize and deserialize a sync state', () => {
			const originalState: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 12345,
				lastSyncedTimestamp: 1234567890,
				entityStates: new Map([
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('tx-1'),
							blockHeight: 12340,
							parentFolderId: EID('parent-1'),
							name: 'Test Entity 1'
						}
					],
					[
						'entity-2',
						{
							entityId: EID('entity-2'),
							txId: TxID('tx-2'),
							blockHeight: 12342,
							name: 'Test Entity 2'
							// No parentFolderId - testing optional field
						}
					]
				])
			};

			// Serialize
			const json = serializeSyncState(originalState);
			expect(json).to.be.a('string');

			// Parse to check structure
			const parsed = JSON.parse(json);
			expect(parsed.driveId).to.equal(testDriveId.toString());
			expect(parsed.lastSyncedBlockHeight).to.equal(12345);
			expect(parsed.entityStates).to.be.an('array').with.length(2);

			// Deserialize
			const restoredState = deserializeSyncState(json);
			expect(restoredState.driveId).to.equal(originalState.driveId);
			expect(restoredState.lastSyncedBlockHeight).to.equal(originalState.lastSyncedBlockHeight);
			expect(restoredState.lastSyncedTimestamp).to.equal(originalState.lastSyncedTimestamp);
			expect(restoredState.entityStates.size).to.equal(2);

			// Check individual entities
			const entity1 = restoredState.entityStates.get('entity-1');
			expect(entity1).to.exist;
			expect(entity1!.entityId).to.equal(EID('entity-1'));
			expect(entity1!.txId).to.equal(TxID('tx-1'));
			expect(entity1!.blockHeight).to.equal(12340);
			expect(entity1!.parentFolderId).to.equal(EID('parent-1'));
			expect(entity1!.name).to.equal('Test Entity 1');

			const entity2 = restoredState.entityStates.get('entity-2');
			expect(entity2).to.exist;
			expect(entity2!.parentFolderId).to.be.undefined;
		});

		it('should handle empty entity states', () => {
			const state = createInitialSyncState(testDriveId);
			const json = serializeSyncState(state);
			const restored = deserializeSyncState(json);

			expect(restored.entityStates.size).to.equal(0);
		});
	});

	describe('mergeSyncStates', () => {
		it('should merge two sync states keeping the most recent data', () => {
			const state1: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000,
				lastSyncedTimestamp: 1000000,
				entityStates: new Map([
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('old-tx-1'),
							blockHeight: 900,
							name: 'Old Name'
						}
					],
					[
						'entity-2',
						{
							entityId: EID('entity-2'),
							txId: TxID('tx-2'),
							blockHeight: 950,
							name: 'Entity 2'
						}
					]
				])
			};

			const state2: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 2000,
				lastSyncedTimestamp: 2000000,
				entityStates: new Map([
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('new-tx-1'),
							blockHeight: 1500,
							name: 'New Name'
						}
					],
					[
						'entity-3',
						{
							entityId: EID('entity-3'),
							txId: TxID('tx-3'),
							blockHeight: 1800,
							name: 'Entity 3'
						}
					]
				])
			};

			const merged = mergeSyncStates(state1, state2);

			expect(merged.driveId).to.equal(testDriveId);
			expect(merged.lastSyncedBlockHeight).to.equal(2000);
			expect(merged.lastSyncedTimestamp).to.equal(2000000);
			expect(merged.entityStates.size).to.equal(3);

			// Entity 1 should have the newer version from state2
			const entity1 = merged.entityStates.get('entity-1');
			expect(entity1!.txId).to.equal(TxID('new-tx-1'));
			expect(entity1!.blockHeight).to.equal(1500);
			expect(entity1!.name).to.equal('New Name');

			// Entity 2 should remain from state1
			expect(merged.entityStates.has('entity-2')).to.be.true;

			// Entity 3 should be added from state2
			expect(merged.entityStates.has('entity-3')).to.be.true;
		});

		it('should throw error when merging states from different drives', () => {
			const state1 = createInitialSyncState(testDriveId);
			const state2 = createInitialSyncState(EID('different-drive-id'));

			expect(() => mergeSyncStates(state1, state2)).to.throw('Cannot merge sync states from different drives');
		});
	});

	describe('diffSyncStates', () => {
		it('should correctly identify added, modified, and removed entities', () => {
			const oldState: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000,
				lastSyncedTimestamp: 1000000,
				entityStates: new Map([
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('tx-1'),
							blockHeight: 900,
							name: 'Entity 1'
						}
					],
					[
						'entity-2',
						{
							entityId: EID('entity-2'),
							txId: TxID('tx-2'),
							blockHeight: 950,
							name: 'Entity 2'
						}
					],
					[
						'entity-3',
						{
							entityId: EID('entity-3'),
							txId: TxID('tx-3'),
							blockHeight: 960,
							name: 'Entity 3'
						}
					]
				])
			};

			const newState: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 2000,
				lastSyncedTimestamp: 2000000,
				entityStates: new Map([
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('tx-1'), // Same transaction - no change
							blockHeight: 900,
							name: 'Entity 1'
						}
					],
					[
						'entity-2',
						{
							entityId: EID('entity-2'),
							txId: TxID('tx-2-modified'), // Different transaction - modified
							blockHeight: 1500,
							name: 'Entity 2 Modified'
						}
					],
					[
						'entity-4',
						{
							entityId: EID('entity-4'),
							txId: TxID('tx-4'), // New entity
							blockHeight: 1800,
							name: 'Entity 4'
						}
					]
					// entity-3 is missing - removed
				])
			};

			const diff = diffSyncStates(oldState, newState);

			expect(diff.added).to.deep.equal(['entity-4']);
			expect(diff.modified).to.deep.equal(['entity-2']);
			expect(diff.removed).to.deep.equal(['entity-3']);
		});

		it('should return empty arrays when states are identical', () => {
			const state: DriveSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000,
				lastSyncedTimestamp: 1000000,
				entityStates: new Map([
					[
						'entity-1',
						{
							entityId: EID('entity-1'),
							txId: TxID('tx-1'),
							blockHeight: 900,
							name: 'Entity 1'
						}
					]
				])
			};

			const diff = diffSyncStates(state, state);

			expect(diff.added).to.be.empty;
			expect(diff.modified).to.be.empty;
			expect(diff.removed).to.be.empty;
		});
	});
});
