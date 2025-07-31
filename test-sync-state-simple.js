// Simple test for sync_state utilities without TypeScript
const { expect } = require('chai');

// Import the sync_state utilities from the source
const {
  serializeSyncState,
  deserializeSyncState,
  syncStateToJSON,
  syncStateFromJSON,
  mergeSyncStates,
  createEmptySyncState,
} = require('./src/utils/sync_state');

const {
  EID,
  TxID,
  UnixTime
} = require('./src/types');

describe('sync_state utilities (simple test)', () => {
  const mockDriveId = EID('8af1d6e8-1234-5678-9abc-def012345678');
  const mockEntityId = EID('9bf2e7f9-2345-6789-abcd-ef0123456789');
  const mockTxId = TxID('1234567890123456789012345678901234567890123');
  const mockParentFolderId = EID('acf3f8fa-3456-789a-bcde-f01234567890');

  const createMockEntityState = (overrides = {}) => ({
    entityId: mockEntityId,
    txId: mockTxId,
    blockHeight: 1000000,
    parentFolderId: mockParentFolderId,
    name: 'test-file.txt',
    entityType: 'file',
    ...overrides
  });

  const createMockSyncState = (overrides = {}) => {
    const entityStates = new Map();
    entityStates.set(mockEntityId.toString(), createMockEntityState());
    
    return {
      driveId: mockDriveId,
      drivePrivacy: 'public',
      lastSyncedBlockHeight: 1000000,
      lastSyncedTimestamp: new UnixTime(1640000000000),
      entityStates,
      ...overrides
    };
  };

  it('should serialize and deserialize sync state', () => {
    const syncState = createMockSyncState();
    const serialized = serializeSyncState(syncState);
    const deserialized = deserializeSyncState(serialized);

    expect(deserialized.driveId.equals(syncState.driveId)).to.be.true;
    expect(deserialized.drivePrivacy).to.equal(syncState.drivePrivacy);
    expect(deserialized.lastSyncedBlockHeight).to.equal(syncState.lastSyncedBlockHeight);
    expect(deserialized.lastSyncedTimestamp.valueOf()).to.equal(syncState.lastSyncedTimestamp.valueOf());
    expect(deserialized.entityStates.size).to.equal(syncState.entityStates.size);
  });

  it('should convert to and from JSON', () => {
    const syncState = createMockSyncState();
    const json = syncStateToJSON(syncState);
    const restored = syncStateFromJSON(json);

    expect(restored.driveId.equals(syncState.driveId)).to.be.true;
    expect(restored.drivePrivacy).to.equal(syncState.drivePrivacy);
    expect(restored.lastSyncedBlockHeight).to.equal(syncState.lastSyncedBlockHeight);
  });

  it('should create empty sync state', () => {
    const empty = createEmptySyncState(mockDriveId, 'public');

    expect(empty.driveId.equals(mockDriveId)).to.be.true;
    expect(empty.drivePrivacy).to.equal('public');
    expect(empty.lastSyncedBlockHeight).to.equal(0);
    expect(empty.lastSyncedTimestamp.valueOf()).to.equal(0);
    expect(empty.entityStates.size).to.equal(0);
  });
});

// Run the tests
if (require.main === module) {
  const Mocha = require('mocha');
  const mocha = new Mocha();
  
  mocha.suite.emit('pre-require', global, null, mocha);
  
  // Add this file to mocha
  mocha.addFile(__filename);
  
  // Run the tests
  mocha.run(failures => {
    process.exitCode = failures ? 1 : 0;
  });
}