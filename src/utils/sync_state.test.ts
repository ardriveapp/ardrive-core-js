import { expect } from 'chai';
import {
	serializeSyncState,
	deserializeSyncState,
	syncStateToJSON,
	syncStateFromJSON,
	mergeSyncStates,
	createEmptySyncState,
	SerializedDriveSyncState
} from './sync_state';
import { DriveSyncState, EntitySyncState, UnixTime, EID, TxID, DrivePrivacy } from '../types';
import { stubEntityID, stubEntityIDAlt, stubTxID, stubTxIDAlt } from '../../tests/stubs';

describe('sync_state utilities', () => {
	const mockDriveId = EID('8af1d6e8-1234-5678-9abc-def012345678');
	const mockEntityId = EID('9bf2e7f9-2345-6789-abcd-ef0123456789');
	const mockTxId = TxID('1234567890123456789012345678901234567890123');
	const mockParentFolderId = EID('acf3f8fa-3456-789a-bcde-f01234567890');

	const createMockEntityState = (overrides?: Partial<EntitySyncState>): EntitySyncState => ({
		entityId: mockEntityId,
		txId: mockTxId,
		blockHeight: 1000000,
		parentFolderId: mockParentFolderId,
		name: 'test-file.txt',
		entityType: 'file',
		...overrides
	});

	const createMockSyncState = (overrides?: Partial<DriveSyncState>): DriveSyncState => {
		const entityStates = new Map<string, EntitySyncState>();
		entityStates.set(mockEntityId.toString(), createMockEntityState());

		return {
			driveId: mockDriveId,
			drivePrivacy: 'public' as DrivePrivacy,
			lastSyncedBlockHeight: 1000000,
			lastSyncedTimestamp: new UnixTime(1640000000000),
			entityStates,
			...overrides
		};
	};

	describe('serializeSyncState', () => {
		it('should serialize a sync state to JSON-safe format', () => {
			const syncState = createMockSyncState();
			const serialized = serializeSyncState(syncState);

			expect(serialized.driveId).to.equal(mockDriveId.toString());
			expect(serialized.drivePrivacy).to.equal('public');
			expect(serialized.lastSyncedBlockHeight).to.equal(1000000);
			expect(serialized.lastSyncedTimestamp).to.equal(1640000000000);
			expect(serialized.entityStates).to.have.lengthOf(1);
			expect(serialized.entityStates[0].entityId).to.equal(mockEntityId.toString());
			expect(serialized.entityStates[0].txId).to.equal(mockTxId.toString());
		});

		it('should handle empty entity states', () => {
			const syncState = createMockSyncState({
				entityStates: new Map()
			});
			const serialized = serializeSyncState(syncState);

			expect(serialized.entityStates).to.have.lengthOf(0);
		});

		it('should handle optional parentFolderId', () => {
			const entityState = createMockEntityState({ parentFolderId: undefined });
			const entityStates = new Map<string, EntitySyncState>();
			entityStates.set(mockEntityId.toString(), entityState);

			const syncState = createMockSyncState({ entityStates });
			const serialized = serializeSyncState(syncState);

			expect(serialized.entityStates[0].parentFolderId).to.be.undefined;
		});
	});

	describe('deserializeSyncState', () => {
		it('should deserialize a serialized sync state', () => {
			const serialized: SerializedDriveSyncState = {
				driveId: mockDriveId.toString(),
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: 1640000000000,
				entityStates: [
					{
						entityId: mockEntityId.toString(),
						txId: mockTxId.toString(),
						blockHeight: 1000000,
						parentFolderId: mockParentFolderId.toString(),
						name: 'test-file.txt',
						entityType: 'file'
					}
				]
			};

			const deserialized = deserializeSyncState(serialized);

			expect(deserialized.driveId.equals(mockDriveId)).to.be.true;
			expect(deserialized.drivePrivacy).to.equal('public');
			expect(deserialized.lastSyncedBlockHeight).to.equal(1000000);
			expect(deserialized.lastSyncedTimestamp.valueOf()).to.equal(1640000000000);
			expect(deserialized.entityStates.size).to.equal(1);

			const entityState = deserialized.entityStates.get(mockEntityId.toString());
			expect(entityState).to.exist;
			expect(entityState!.entityId.equals(mockEntityId)).to.be.true;
			expect(entityState!.txId.equals(mockTxId)).to.be.true;
		});

		it('should handle private drive privacy', () => {
			const serialized: SerializedDriveSyncState = {
				driveId: mockDriveId.toString(),
				drivePrivacy: 'private',
				lastSyncedBlockHeight: 0,
				lastSyncedTimestamp: 0,
				entityStates: []
			};

			const deserialized = deserializeSyncState(serialized);
			expect(deserialized.drivePrivacy).to.equal('private');
		});
	});

	describe('syncStateToJSON and syncStateFromJSON', () => {
		it('should round-trip through JSON serialization', () => {
			const original = createMockSyncState();
			const json = syncStateToJSON(original);
			const restored = syncStateFromJSON(json);

			expect(restored.driveId.equals(original.driveId)).to.be.true;
			expect(restored.drivePrivacy).to.equal(original.drivePrivacy);
			expect(restored.lastSyncedBlockHeight).to.equal(original.lastSyncedBlockHeight);
			expect(restored.lastSyncedTimestamp.valueOf()).to.equal(original.lastSyncedTimestamp.valueOf());
			expect(restored.entityStates.size).to.equal(original.entityStates.size);
		});

		it('should produce readable JSON', () => {
			const syncState = createMockSyncState();
			const json = syncStateToJSON(syncState);

			expect(json).to.be.a('string');
			expect(json).to.include('driveId');
			expect(json).to.include('entityStates');

			// Should be pretty-printed
			expect(json).to.include('\n');
		});
	});

	describe('mergeSyncStates', () => {
		it('should merge two sync states keeping higher block heights', () => {
			const entity1 = createMockEntityState({
				entityId: stubEntityID,
				blockHeight: 1000000
			});
			const entity2 = createMockEntityState({
				entityId: stubEntityIDAlt,
				blockHeight: 1000100
			});

			const state1 = createMockSyncState({
				lastSyncedBlockHeight: 1000000,
				entityStates: new Map([[stubEntityID.toString(), entity1]])
			});

			const state2 = createMockSyncState({
				lastSyncedBlockHeight: 1000100,
				entityStates: new Map([[stubEntityIDAlt.toString(), entity2]])
			});

			const merged = mergeSyncStates(state1, state2);

			expect(merged.lastSyncedBlockHeight).to.equal(1000100);
			expect(merged.entityStates.size).to.equal(2);
			expect(merged.entityStates.has(stubEntityID.toString())).to.be.true;
			expect(merged.entityStates.has(stubEntityIDAlt.toString())).to.be.true;
		});

		it('should update entity when newer version exists', () => {
			const oldEntity = createMockEntityState({
				blockHeight: 1000000,
				txId: stubTxID
			});
			const newEntity = createMockEntityState({
				blockHeight: 1000100,
				txId: stubTxIDAlt
			});

			const state1 = createMockSyncState({
				entityStates: new Map([[mockEntityId.toString(), oldEntity]])
			});

			const state2 = createMockSyncState({
				entityStates: new Map([[mockEntityId.toString(), newEntity]])
			});

			const merged = mergeSyncStates(state1, state2);
			const mergedEntity = merged.entityStates.get(mockEntityId.toString());

			expect(mergedEntity).to.exist;
			expect(mergedEntity!.blockHeight).to.equal(1000100);
			expect(mergedEntity!.txId.equals(stubTxIDAlt)).to.be.true;
		});

		it('should keep more recent timestamp', () => {
			const state1 = createMockSyncState({
				lastSyncedTimestamp: new UnixTime(1640000000000)
			});

			const state2 = createMockSyncState({
				lastSyncedTimestamp: new UnixTime(1650000000000)
			});

			const merged = mergeSyncStates(state1, state2);
			expect(merged.lastSyncedTimestamp.valueOf()).to.equal(1650000000000);
		});

		it('should throw error when merging different drives', () => {
			const state1 = createMockSyncState({ driveId: stubEntityID });
			const state2 = createMockSyncState({ driveId: stubEntityIDAlt });

			expect(() => mergeSyncStates(state1, state2)).to.throw('Cannot merge sync states for different drives');
		});
	});

	describe('createEmptySyncState', () => {
		it('should create empty public drive sync state', () => {
			const empty = createEmptySyncState(mockDriveId, 'public');

			expect(empty.driveId.equals(mockDriveId)).to.be.true;
			expect(empty.drivePrivacy).to.equal('public');
			expect(empty.lastSyncedBlockHeight).to.equal(0);
			expect(empty.lastSyncedTimestamp.valueOf()).to.equal(0);
			expect(empty.entityStates.size).to.equal(0);
		});

		it('should create empty private drive sync state', () => {
			const empty = createEmptySyncState(mockDriveId, 'private');

			expect(empty.drivePrivacy).to.equal('private');
			expect(empty.lastSyncedBlockHeight).to.equal(0);
		});
	});
});
