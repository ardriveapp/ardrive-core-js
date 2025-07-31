/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { stub } from 'sinon';
import { ArDrive } from './ardrive';
import { ArDriveAnonymous } from './ardrive_anonymous';
import { stubArweaveAddress, stubEntityID, getStubDriveKey } from '../tests/stubs';
import { DriveSyncState, UnixTime, IncrementalSyncResult, DriveKey } from './types';
import { ArFSDAOAnonymousIncrementalSync, ArFSIncrementalSyncCache } from './arfs/arfsdao_anonymous_incremental_sync';
import { JWKWallet } from './jwk_wallet';
import { ArFSDAO } from './arfs/arfsdao';
import { WalletDAO } from './wallet_dao';
import { CommunityOracle } from './community/community_oracle';
import { GatewayAPI } from './utils/gateway_api';
import { ARDataPriceEstimator } from './pricing/ar_data_price_estimator';
import Arweave from 'arweave';

describe('ArDrive incremental sync methods', () => {
	let arDrive: ArDrive;
	let arDriveAnonymous: ArDriveAnonymous;
	let wallet: JWKWallet;
	let driveKey: DriveKey;
	let arFSDaoStub: ArFSDAO & {
		anonymousIncSync?: {
			getPublicDriveIncrementalSync: ReturnType<typeof stub>;
			getCachedSyncState?: ReturnType<typeof stub>;
			setCachedSyncState?: ReturnType<typeof stub>;
		};
		getPrivateDriveIncrementalSync?: ReturnType<typeof stub>;
		getCachedSyncState?: ReturnType<typeof stub>;
		setCachedSyncState?: ReturnType<typeof stub>;
	};

	const mockDriveId = stubEntityID;
	const mockOwner = stubArweaveAddress();

	const createMockSyncResult = (): IncrementalSyncResult => ({
		entities: [],
		changes: {
			added: [],
			modified: [],
			unreachable: []
		},
		newSyncState: {
			driveId: mockDriveId,
			drivePrivacy: 'public',
			lastSyncedBlockHeight: 1000000,
			lastSyncedTimestamp: new UnixTime(Date.now()),
			entityStates: new Map()
		},
		stats: {
			totalProcessed: 10,
			fromCache: 5,
			fromNetwork: 5,
			lowestBlockHeight: 999000,
			highestBlockHeight: 1000000
		}
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

		// Create ArDrive instances with proper mocking
		arDrive = new ArDrive(
			wallet,
			{} as WalletDAO,
			{} as ArFSDAO, // will be stubbed
			{} as CommunityOracle,
			'test_app',
			'0.0',
			{} as ARDataPriceEstimator
		);

		arDriveAnonymous = new ArDriveAnonymous({} as ArFSDAO);
	});

	describe('ArDrive.syncPublicDrive', () => {
		it('should sync public drive using anonymous incremental sync', async () => {
			// Create mock incremental sync DAO
			const mockIncSync = {
				getPublicDriveIncrementalSync: stub().resolves(createMockSyncResult())
			};

			// Mock the arFsDao to have anonymousIncSync
			arFSDaoStub = {
				anonymousIncSync: mockIncSync
			} as typeof arFSDaoStub;
			(arDrive as any).arFsDao = arFSDaoStub;

			const options = {
				batchSize: 50,
				onProgress: () => {}
			};

			const result = await arDrive.syncPublicDrive(mockDriveId, mockOwner, options);

			expect(mockIncSync.getPublicDriveIncrementalSync.calledOnce).to.be.true;
			expect(mockIncSync.getPublicDriveIncrementalSync.firstCall.args[0].equals(mockDriveId)).to.be.true;
			expect(mockIncSync.getPublicDriveIncrementalSync.firstCall.args[1].equals(mockOwner)).to.be.true;
			expect(mockIncSync.getPublicDriveIncrementalSync.firstCall.args[2]).to.deep.equal(options);
			expect(result.stats.totalProcessed).to.equal(10);
		});

		it('should use wallet address when owner not provided', async () => {
			const walletAddress = stubArweaveAddress('wallet123');
			stub(wallet, 'getAddress').resolves(walletAddress);

			const mockIncSync = {
				getPublicDriveIncrementalSync: stub().resolves(createMockSyncResult())
			};

			arFSDaoStub = {
				anonymousIncSync: mockIncSync
			} as typeof arFSDaoStub;
			(arDrive as any).arFsDao = arFSDaoStub;

			await arDrive.syncPublicDrive(mockDriveId);

			expect(mockIncSync.getPublicDriveIncrementalSync.firstCall.args[1].equals(walletAddress)).to.be.true;
		});

		it('should pass through sync state from options', async () => {
			const previousState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 999000,
				lastSyncedTimestamp: new UnixTime(1639000000000),
				entityStates: new Map()
			};

			const mockIncSync = {
				getPublicDriveIncrementalSync: stub().resolves(createMockSyncResult())
			};

			arFSDaoStub = {
				anonymousIncSync: mockIncSync
			} as typeof arFSDaoStub;
			(arDrive as any).arFsDao = arFSDaoStub;

			await arDrive.syncPublicDrive(mockDriveId, mockOwner, { syncState: previousState });

			const passedOptions = mockIncSync.getPublicDriveIncrementalSync.firstCall.args[2];
			expect(passedOptions.syncState).to.equal(previousState);
		});
	});

	describe('ArDrive.syncPrivateDrive', () => {
		it('should sync private drive using incremental sync DAO', async () => {
			// Mock ArFSDAOIncrementalSync
			const mockIncSyncDao = {
				getPrivateDriveIncrementalSync: stub().resolves(createMockSyncResult())
			} as typeof arFSDaoStub;

			(arDrive as any).arFsDao = mockIncSyncDao;

			const options = {
				includeRevisions: true,
				stopAfterKnownCount: 5
			};

			const result = await arDrive.syncPrivateDrive(mockDriveId, driveKey, mockOwner, options);

			expect(mockIncSyncDao.getPrivateDriveIncrementalSync!.calledOnce).to.be.true;
			const args = mockIncSyncDao.getPrivateDriveIncrementalSync!.firstCall.args;
			expect((args[0] as any).equals(mockDriveId)).to.be.true;
			expect(args[1]).to.equal(driveKey);
			expect((args[2] as any).equals(mockOwner)).to.be.true;
			expect(args[3]).to.deep.equal(options);
			expect(result.stats.totalProcessed).to.equal(10);
		});

		it('should throw error if DAO does not support incremental sync', async () => {
			// Mock regular ArFSDAO without incremental sync
			(arDrive as any).arFsDao = {};

			try {
				await arDrive.syncPrivateDrive(mockDriveId, driveKey, mockOwner);
				expect.fail('Should have thrown error');
			} catch (error) {
				expect((error as Error).message).to.equal('ArFS DAO does not support incremental sync');
			}
		});

		it('should track progress through callback', async () => {
			const progressUpdates: Array<{ processed: number; total: number }> = [];

			const mockIncSyncDao = {
				getPrivateDriveIncrementalSync: stub().callsFake(async (_driveId, _driveKey, _owner, options) => {
					// Simulate progress updates
					if (options.onProgress) {
						options.onProgress(5, -1);
						options.onProgress(10, -1);
					}
					return createMockSyncResult();
				})
			} as typeof arFSDaoStub;

			(arDrive as any).arFsDao = mockIncSyncDao;

			await arDrive.syncPrivateDrive(mockDriveId, driveKey, mockOwner, {
				onProgress: (processed, total) => {
					progressUpdates.push({ processed, total });
				}
			});

			expect(progressUpdates).to.have.lengthOf(2);
			expect(progressUpdates[0].processed).to.equal(5);
			expect(progressUpdates[1].processed).to.equal(10);
		});
	});

	describe('ArDrive.getCachedSyncState', () => {
		it('should get cached sync state from incremental sync DAO', async () => {
			const cachedState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'private',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			const mockIncSyncDao = {
				getCachedSyncState: stub().resolves(cachedState)
			} as typeof arFSDaoStub;

			(arDrive as any).arFsDao = mockIncSyncDao;

			const result = await arDrive.getCachedSyncState(mockDriveId);

			expect(mockIncSyncDao.getCachedSyncState!.calledWith(mockDriveId)).to.be.true;
			expect(result).to.equal(cachedState);
		});

		it('should fallback to anonymous incremental sync for non-incremental DAO', async () => {
			const cachedState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			const mockAnonymousIncSync = {
				getCachedSyncState: stub().resolves(cachedState)
			};

			// Regular DAO with anonymous incremental sync
			arFSDaoStub = {
				anonymousIncSync: mockAnonymousIncSync
			} as typeof arFSDaoStub;
			(arDrive as any).arFsDao = arFSDaoStub;

			const result = await arDrive.getCachedSyncState(mockDriveId);

			expect(mockAnonymousIncSync.getCachedSyncState.calledWith(mockDriveId)).to.be.true;
			expect(result).to.equal(cachedState);
		});

		it('should return undefined when no cached state exists', async () => {
			const mockIncSyncDao = {
				getCachedSyncState: stub().resolves(undefined)
			} as typeof arFSDaoStub;

			(arDrive as any).arFsDao = mockIncSyncDao;

			const result = await arDrive.getCachedSyncState(mockDriveId);

			expect(result).to.be.undefined;
		});
	});

	describe('ArDrive.setCachedSyncState', () => {
		it('should set cached sync state on incremental sync DAO', () => {
			const syncState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'private',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			const mockIncSyncDao = {
				setCachedSyncState: stub()
			} as typeof arFSDaoStub;

			(arDrive as any).arFsDao = mockIncSyncDao;

			arDrive.setCachedSyncState(mockDriveId, syncState);

			expect(mockIncSyncDao.setCachedSyncState!.calledWith(mockDriveId, syncState)).to.be.true;
		});

		it('should fallback to anonymous incremental sync for non-incremental DAO', () => {
			const syncState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			const mockAnonymousIncSync = {
				setCachedSyncState: stub()
			};

			// Regular DAO with anonymous incremental sync
			arFSDaoStub = {
				anonymousIncSync: mockAnonymousIncSync
			} as typeof arFSDaoStub;
			(arDrive as any).arFsDao = arFSDaoStub;

			arDrive.setCachedSyncState(mockDriveId, syncState);

			expect(mockAnonymousIncSync.setCachedSyncState.calledWith(mockDriveId, syncState)).to.be.true;
		});

		it('should handle missing setCachedSyncState method gracefully', () => {
			const syncState: DriveSyncState = {
				driveId: mockDriveId,
				drivePrivacy: 'public',
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: new UnixTime(Date.now()),
				entityStates: new Map()
			};

			// DAO without any incremental sync support
			arFSDaoStub = {
				anonymousIncSync: {} // No setCachedSyncState method
			} as typeof arFSDaoStub;
			(arDrive as any).arFsDao = arFSDaoStub;

			// Should not throw
			expect(() => arDrive.setCachedSyncState(mockDriveId, syncState)).to.not.throw();
		});
	});

	describe('ArDriveAnonymous incremental sync support', () => {
		it('should have incremental sync available on anonymous ArDrive', () => {
			// Create mock anonymous DAO with incremental sync
			const mockAnonymousDao = new ArFSDAOAnonymousIncrementalSync(
				{} as Arweave,
				'test_app',
				'0.0',
				{} as ArFSIncrementalSyncCache,
				{} as GatewayAPI
			);

			(arDriveAnonymous as any).arFsDao = mockAnonymousDao;

			// Verify methods are available
			expect((arDriveAnonymous as any).arFsDao.getPublicDriveIncrementalSync).to.be.a('function');
			expect((arDriveAnonymous as any).arFsDao.getCachedSyncState).to.be.a('function');
			expect((arDriveAnonymous as any).arFsDao.setCachedSyncState).to.be.a('function');
		});
	});
});
