import { expect } from 'chai';
import { MemorySyncStateStore } from './sync_state_store';
import { DriveID, EID, UnixTime, TransactionID } from '../types';
import { DriveSyncState, EntitySyncState } from '../types/sync_types';

describe('SyncStateStore', () => {
	describe('MemorySyncStateStore', () => {
		let store: MemorySyncStateStore;
		let testDriveId: DriveID;
		let testSyncState: DriveSyncState;

		beforeEach(() => {
			store = new MemorySyncStateStore();
			testDriveId = EID('11111111-1111-1111-1111-111111111111');

			const entityState: EntitySyncState = {
				entityId: EID('22222222-2222-2222-2222-222222222222'),
				txId: new TransactionID('1234567890abcdefghijklmnopqrstuvwxyz1234567'),
				blockHeight: 1000000,
				name: 'Test Entity',
				entityType: 'folder'
			};

			testSyncState = {
				driveId: testDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map([[entityState.entityId.toString(), entityState]])
			};
		});

		it('should save and load sync state', async () => {
			await store.save(testDriveId, testSyncState);
			const loaded = await store.load(testDriveId);

			expect(loaded).to.exist;
			expect(loaded?.driveId.toString()).to.equal(testDriveId.toString());
			expect(loaded?.drivePrivacy).to.equal('public');
			expect(loaded?.lastSyncedBlockHeight).to.equal(1000000);
			expect(loaded?.entityStates.size).to.equal(1);
		});

		it('should return undefined for non-existent drive', async () => {
			const nonExistentId = EID('33333333-3333-3333-3333-333333333333');
			const loaded = await store.load(nonExistentId);
			expect(loaded).to.be.undefined;
		});

		it('should clear specific sync state', async () => {
			await store.save(testDriveId, testSyncState);
			await store.clear(testDriveId);

			const loaded = await store.load(testDriveId);
			expect(loaded).to.be.undefined;
		});

		it('should list all stored drive IDs', async () => {
			const driveId1 = EID('44444444-4444-4444-4444-444444444444');
			const driveId2 = EID('55555555-5555-5555-5555-555555555555');

			await store.save(driveId1, { ...testSyncState, driveId: driveId1 });
			await store.save(driveId2, { ...testSyncState, driveId: driveId2 });

			const ids = await store.list();
			expect(ids).to.have.lengthOf(2);
			expect(ids.map((id) => id.toString())).to.include.members([driveId1.toString(), driveId2.toString()]);
		});

		it('should clear all sync states', async () => {
			const driveId1 = EID('66666666-6666-6666-6666-666666666666');
			const driveId2 = EID('77777777-7777-7777-7777-777777777777');

			await store.save(driveId1, { ...testSyncState, driveId: driveId1 });
			await store.save(driveId2, { ...testSyncState, driveId: driveId2 });

			await store.clearAll();

			const ids = await store.list();
			expect(ids).to.have.lengthOf(0);
		});

		it('should overwrite existing sync state', async () => {
			await store.save(testDriveId, testSyncState);

			const updatedState: DriveSyncState = {
				...testSyncState,
				lastSyncedBlockHeight: 2000000
			};

			await store.save(testDriveId, updatedState);
			const loaded = await store.load(testDriveId);

			expect(loaded?.lastSyncedBlockHeight).to.equal(2000000);
		});

		it('should handle private drive sync state', async () => {
			const privateSyncState: DriveSyncState = {
				...testSyncState,
				drivePrivacy: 'private'
			};

			await store.save(testDriveId, privateSyncState);
			const loaded = await store.load(testDriveId);

			expect(loaded?.drivePrivacy).to.equal('private');
		});

		it('should preserve entity states through save/load cycle', async () => {
			const entity1: EntitySyncState = {
				entityId: EID('88888888-8888-8888-8888-888888888888'),
				txId: new TransactionID('1111111111111111111111111111111111111111111'),
				blockHeight: 1000000,
				name: 'Entity 1',
				entityType: 'folder',
				parentFolderId: EID('99999999-9999-9999-9999-999999999999')
			};

			const entity2: EntitySyncState = {
				entityId: EID('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
				txId: new TransactionID('2222222222222222222222222222222222222222222'),
				blockHeight: 1000001,
				name: 'Entity 2',
				entityType: 'file'
			};

			const stateWithMultipleEntities: DriveSyncState = {
				...testSyncState,
				entityStates: new Map([
					[entity1.entityId.toString(), entity1],
					[entity2.entityId.toString(), entity2]
				])
			};

			await store.save(testDriveId, stateWithMultipleEntities);
			const loaded = await store.load(testDriveId);

			expect(loaded?.entityStates.size).to.equal(2);

			const loadedEntity1 = loaded?.entityStates.get(entity1.entityId.toString());
			expect(loadedEntity1?.name).to.equal('Entity 1');
			expect(loadedEntity1?.entityType).to.equal('folder');
			expect(loadedEntity1?.parentFolderId?.toString()).to.equal('99999999-9999-9999-9999-999999999999');

			const loadedEntity2 = loaded?.entityStates.get(entity2.entityId.toString());
			expect(loadedEntity2?.name).to.equal('Entity 2');
			expect(loadedEntity2?.entityType).to.equal('file');
			expect(loadedEntity2?.parentFolderId).to.be.undefined;
		});
	});
});
