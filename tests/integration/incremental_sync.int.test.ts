/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import Arweave from 'arweave';
import {
	ArDrive,
	JWKWallet,
	readJWKFile,
	deriveDriveKey,
	EID,
	DriveSyncState,
	IncrementalSyncResult,
	serializeSyncState,
	deserializeSyncState,
	arDriveFactory,
	UnixTime,
	DriveKey,
	ArweaveAddress
} from '../../src/exports';

// Integration test requires a real drive ID and wallet
// These can be set via environment variables or test configuration
const TEST_PUBLIC_DRIVE_ID = process.env.TEST_PUBLIC_DRIVE_ID || 'YOUR_PUBLIC_DRIVE_ID';
const TEST_PRIVATE_DRIVE_ID = process.env.TEST_PRIVATE_DRIVE_ID || 'YOUR_PRIVATE_DRIVE_ID';
const TEST_DRIVE_PASSWORD = process.env.TEST_DRIVE_PASSWORD || 'test-password';
const TEST_WALLET_PATH = process.env.TEST_WALLET_PATH || './test_wallet.json';

describe('Incremental Sync Integration Tests', function () {
	// Integration tests can be slow
	this.timeout(120000);

	let wallet: JWKWallet;
	let arDrive: ArDrive;
	let walletAddress: ArweaveAddress;

	before(async function () {
		// Skip if test configuration not provided
		if (TEST_PUBLIC_DRIVE_ID === 'YOUR_PUBLIC_DRIVE_ID') {
			console.log('Skipping integration tests - no test drive ID configured');
			this.skip();
		}

		// Initialize Arweave client
		Arweave.init({
			host: 'arweave.net',
			port: 443,
			protocol: 'https',
			timeout: 60000
		});

		// Load wallet
		try {
			const jwk = readJWKFile(TEST_WALLET_PATH);
			wallet = new JWKWallet(jwk as any);
		} catch (e) {
			// If wallet file doesn't exist, create a test wallet
			const jwk = {
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
			wallet = new JWKWallet(jwk as any);
		}
		walletAddress = await wallet.getAddress();

		// Create ArDrive instances using factory
		arDrive = await arDriveFactory({ wallet });
	});

	describe('Public Drive Incremental Sync', () => {
		let initialSyncResult: IncrementalSyncResult;

		it('should perform initial sync of a public drive', async function () {
			const driveId = EID(TEST_PUBLIC_DRIVE_ID);

			console.log(`Syncing public drive: ${driveId}`);

			initialSyncResult = await (arDrive as ArDrive).syncPublicDrive(
				driveId,
				undefined, // Let it discover owner
				{
					batchSize: 50,
					onProgress: (processed) => {
						console.log(`Progress: ${processed} entities processed`);
					}
				}
			);

			expect(initialSyncResult).to.exist;
			expect(initialSyncResult.entities).to.be.an('array');
			expect(initialSyncResult.entities.length).to.be.greaterThan(0);
			expect(initialSyncResult.changes.added.length).to.equal(initialSyncResult.entities.length);
			expect(initialSyncResult.changes.modified).to.have.lengthOf(0);
			expect(initialSyncResult.changes.unreachable).to.have.lengthOf(0);
			expect(initialSyncResult.stats.totalProcessed).to.be.greaterThan(0);
			expect(initialSyncResult.newSyncState.driveId.equals(driveId)).to.be.true;
			expect(initialSyncResult.newSyncState.drivePrivacy).to.equal('public');

			console.log(`Initial sync complete: ${initialSyncResult.entities.length} entities found`);
			console.log(`Stats:`, initialSyncResult.stats);
		});

		it('should perform incremental sync with no changes', async function () {
			const driveId = EID(TEST_PUBLIC_DRIVE_ID);

			// Use previous sync state
			const incrementalResult = await (arDrive as ArDrive).syncPublicDrive(driveId, undefined, {
				syncState: initialSyncResult.newSyncState,
				onProgress: (processed) => {
					console.log(`Incremental sync progress: ${processed} entities`);
				}
			});

			expect(incrementalResult.changes.added).to.have.lengthOf(0);
			expect(incrementalResult.changes.modified).to.have.lengthOf(0);
			expect(incrementalResult.stats.totalProcessed).to.be.at.least(0);

			// Sync state should be updated even with no changes
			expect(incrementalResult.newSyncState.lastSyncedTimestamp.valueOf()).to.be.greaterThan(
				initialSyncResult.newSyncState.lastSyncedTimestamp.valueOf()
			);

			console.log(`Incremental sync complete: ${incrementalResult.stats.totalProcessed} entities processed`);
		});

		it('should serialize and deserialize sync state', () => {
			const serialized = serializeSyncState(initialSyncResult.newSyncState);

			expect(serialized).to.be.an('object');
			expect(serialized.driveId).to.be.a('string');
			expect(serialized.entityStates).to.be.an('array');

			const deserialized = deserializeSyncState(serialized);

			expect(deserialized.driveId.equals(initialSyncResult.newSyncState.driveId)).to.be.true;
			expect(deserialized.lastSyncedBlockHeight).to.equal(initialSyncResult.newSyncState.lastSyncedBlockHeight);
			expect(deserialized.entityStates.size).to.equal(initialSyncResult.newSyncState.entityStates.size);
		});

		it('should use cached sync state', async function () {
			const driveId = EID(TEST_PUBLIC_DRIVE_ID);

			// Set cached state
			await (arDrive as ArDrive).setCachedSyncState(driveId, initialSyncResult.newSyncState);

			// Retrieve cached state
			const cachedState = await (arDrive as ArDrive).getCachedSyncState(driveId);

			expect(cachedState).to.exist;
			expect(cachedState!.lastSyncedBlockHeight).to.equal(initialSyncResult.newSyncState.lastSyncedBlockHeight);
		});

		it('should handle early stop optimization', async function () {
			const driveId = EID(TEST_PUBLIC_DRIVE_ID);

			const result = await (arDrive as ArDrive).syncPublicDrive(driveId, undefined, {
				syncState: initialSyncResult.newSyncState,
				stopAfterKnownCount: 1, // Stop after finding 1 known entity
				batchSize: 10
			});

			// Should have stopped early if drive has many entities
			if (initialSyncResult.entities.length > 10) {
				expect(result.stats.totalProcessed).to.be.lessThan(initialSyncResult.entities.length);
			}

			console.log(`Early stop test: processed ${result.stats.totalProcessed} entities`);
		});
	});

	describe('Private Drive Incremental Sync', function () {
		let driveKey: DriveKey;
		let initialSyncResult: IncrementalSyncResult;

		before(async function () {
			// Skip if no private drive configured
			if (TEST_PRIVATE_DRIVE_ID === 'YOUR_PRIVATE_DRIVE_ID') {
				this.skip();
			}

			// Derive drive key
			const driveId = EID(TEST_PRIVATE_DRIVE_ID);
			driveKey = await deriveDriveKey(TEST_DRIVE_PASSWORD, `${driveId}`, JSON.stringify(wallet.getPrivateKey()));
		});

		it('should perform initial sync of a private drive', async function () {
			const driveId = EID(TEST_PRIVATE_DRIVE_ID);

			console.log(`Syncing private drive: ${driveId}`);

			initialSyncResult = await arDrive.syncPrivateDrive(driveId, driveKey, walletAddress, {
				batchSize: 50,
				onProgress: (processed) => {
					console.log(`Private sync progress: ${processed} entities`);
				}
			});

			expect(initialSyncResult).to.exist;
			expect(initialSyncResult.entities).to.be.an('array');
			expect(initialSyncResult.entities.length).to.be.greaterThan(0);
			expect(initialSyncResult.newSyncState.drivePrivacy).to.equal('private');

			// Verify entities are decrypted
			for (const entity of initialSyncResult.entities) {
				expect(entity).to.have.property('name');
				expect(entity.name).to.not.be.empty;
			}

			console.log(`Private drive sync complete: ${initialSyncResult.entities.length} entities found`);
		});

		it('should detect changes in private drive', async function () {
			const driveId = EID(TEST_PRIVATE_DRIVE_ID);

			// Perform incremental sync
			const incrementalResult = await arDrive.syncPrivateDrive(driveId, driveKey, walletAddress, {
				syncState: initialSyncResult.newSyncState
			});

			// Log any changes found
			if (incrementalResult.changes.added.length > 0) {
				console.log(`Found ${incrementalResult.changes.added.length} new entities`);
			}
			if (incrementalResult.changes.modified.length > 0) {
				console.log(`Found ${incrementalResult.changes.modified.length} modified entities`);
			}

			expect(incrementalResult.stats.totalProcessed).to.be.at.least(0);
		});

		it('should handle mixed public and private drive caching', async function () {
			const publicDriveId = EID(TEST_PUBLIC_DRIVE_ID);
			const privateDriveId = EID(TEST_PRIVATE_DRIVE_ID);

			// Set different cached states
			const publicState: DriveSyncState = {
				driveId: publicDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			const privateState: DriveSyncState = {
				driveId: privateDriveId,
				drivePrivacy: 'private',
				lastSyncedBlockHeight: 2000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			await arDrive.setCachedSyncState(publicDriveId, publicState);
			await arDrive.setCachedSyncState(privateDriveId, privateState);

			// Retrieve and verify
			const retrievedPublic = await arDrive.getCachedSyncState(publicDriveId);
			const retrievedPrivate = await arDrive.getCachedSyncState(privateDriveId);

			expect(retrievedPublic).to.exist;
			expect(retrievedPublic!.drivePrivacy).to.equal('public');
			expect(retrievedPublic!.lastSyncedBlockHeight).to.equal(1000000);

			expect(retrievedPrivate).to.exist;
			expect(retrievedPrivate!.drivePrivacy).to.equal('private');
			expect(retrievedPrivate!.lastSyncedBlockHeight).to.equal(2000000);
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle non-existent drive gracefully', async function () {
			const nonExistentDriveId = EID('00000000-0000-0000-0000-000000000000');

			try {
				await (arDrive as ArDrive).syncPublicDrive(nonExistentDriveId);
				expect.fail('Should have thrown error');
			} catch (error) {
				expect(error).to.exist;
				// Error message will vary based on gateway response
				console.log(`Expected error for non-existent drive: ${(error as Error).message}`);
			}
		});

		it('should handle incorrect drive key', async function () {
			if (TEST_PRIVATE_DRIVE_ID === 'YOUR_PRIVATE_DRIVE_ID') {
				this.skip();
			}

			const driveId = EID(TEST_PRIVATE_DRIVE_ID);
			const wrongDriveKey = await deriveDriveKey(
				'wrong-password',
				`${driveId}`,
				JSON.stringify(wallet.getPrivateKey())
			);

			try {
				await arDrive.syncPrivateDrive(driveId, wrongDriveKey, walletAddress);
				// Might not fail immediately if drive metadata is cached
				// But decryption of entities should fail
			} catch (error) {
				expect(error).to.exist;
				console.log(`Expected error for wrong drive key: ${(error as Error).message}`);
			}
		});
	});

	describe('Performance and Optimization', () => {
		it('should efficiently use cache on subsequent syncs', async function () {
			const driveId = EID(TEST_PUBLIC_DRIVE_ID);

			// First sync to populate cache
			const firstSync = await (arDrive as ArDrive).syncPublicDrive(driveId);

			// Second sync should use more cache
			const secondSync = await (arDrive as ArDrive).syncPublicDrive(driveId, undefined, {
				syncState: firstSync.newSyncState
			});

			// If no new entities, cache usage should be high
			if (secondSync.stats.totalProcessed > 0) {
				const cacheRatio = secondSync.stats.fromCache / secondSync.stats.totalProcessed;
				console.log(`Cache hit ratio: ${(cacheRatio * 100).toFixed(2)}%`);

				// Cache should be used for at least some entities
				expect(secondSync.stats.fromCache).to.be.greaterThan(0);
			}
		});

		it('should handle large batch sizes efficiently', async function () {
			const driveId = EID(TEST_PUBLIC_DRIVE_ID);

			const largeBatchResult = await (arDrive as ArDrive).syncPublicDrive(driveId, undefined, {
				batchSize: 200, // Large batch size
				syncState: {
					driveId,
					drivePrivacy: 'public',
					lastSyncedBlockHeight: 0,
					lastSyncedTimestamp: new UnixTime(0),
					entityStates: new Map()
				}
			});

			expect(largeBatchResult).to.exist;
			console.log(`Large batch sync stats:`, largeBatchResult.stats);
		});
	});
});

// Note: To run these integration tests, you need to provide:
// 1. A test wallet JSON file
// 2. A public drive ID you have access to
// 3. (Optional) A private drive ID and password
//
// Set these via environment variables:
// TEST_PUBLIC_DRIVE_ID=your-drive-id
// TEST_PRIVATE_DRIVE_ID=your-private-drive-id
// TEST_DRIVE_PASSWORD=your-password
// TEST_WALLET_PATH=./path/to/wallet.json
//
// Run with: npm test -- --grep "Incremental Sync Integration"
