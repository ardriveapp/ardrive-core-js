/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import { expect } from 'chai';
import { stub, SinonStub } from 'sinon';
import { stubArweaveAddress, stubEntityID, stubTxID, stubPublicDrive } from '../../tests/stubs';
import { DriveID, DriveSyncState, GQLEdgeInterface, GQLNodeInterface } from '../types';
import { ArFSDAOAnonymousIncrementalSync, ArFSIncrementalSyncCache } from './arfsdao_anonymous_incremental_sync';
import { GatewayAPI } from '../utils/gateway_api';
import { MAX_CONCURRENT_ENTITY_FETCHES } from '../utils/constants';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

/**
 * CORE-9: with CORE-7 raising the page size 100 -> 1000, a single batch of edges can carry
 * up to 1000 entities, each of which is built with a per-entity metadata GET. This test
 * drives the REAL incremental-sync fan-out (processFolderBatch) against a page far larger
 * than the concurrency cap and asserts, via a counter over the actual metadata fetches,
 * that:
 *   - every entity in the page is still processed — NONE dropped (result set unchanged),
 *   - the peak number of simultaneously in-flight metadata fetches never exceeds
 *     MAX_CONCURRENT_ENTITY_FETCHES (parallelism is decoupled from page size).
 */
describe('per-batch entity-fetch concurrency cap (CORE-9)', () => {
	let arfsDaoIncSync: ArFSDAOAnonymousIncrementalSync;
	let gatewayApiStub: SinonStub;
	let getTxDataStub: SinonStub;
	let caches: ArFSIncrementalSyncCache;

	const mockDriveId = stubEntityID;
	const mockOwner = stubArweaveAddress();

	// A distinct 8-4-4-4-12 hex entity id per index so every folder is a distinct entity.
	const folderIdForIndex = (i: number): string => `${i.toString(16).padStart(8, '0')}-1111-1111-1111-111111111111`;

	const makeFolderEdge = (i: number): GQLEdgeInterface => ({
		cursor: `cursor-${i}`,
		node: {
			id: stubTxID.toString(),
			anchor: 'test-anchor',
			signature: 'test-signature',
			recipient: 'test-recipient',
			owner: { address: mockOwner.toString(), key: 'test-owner-key' },
			fee: { winston: '0', ar: '0' },
			quantity: { winston: '0', ar: '0' },
			data: { size: 0, type: 'application/json' },
			block: { id: 'test-block-id', height: 1_000_000 + i, timestamp: 1_640_000_000, previous: 'prev' },
			parent: { id: 'test-parent' },
			tags: [
				{ name: 'App-Name', value: 'ArDrive-Core' },
				{ name: 'App-Version', value: '0.0.1' },
				{ name: 'Content-Type', value: 'application/json' },
				{ name: 'Drive-Id', value: mockDriveId.toString() },
				{ name: 'Entity-Type', value: 'folder' },
				{ name: 'Folder-Id', value: folderIdForIndex(i) },
				{ name: 'Parent-Folder-Id', value: mockDriveId.toString() },
				{ name: 'ArFS', value: '0.13' },
				{ name: 'Unix-Time', value: '1640000000' }
			]
		} as GQLNodeInterface
	});

	/** Serves the whole folder set in a SINGLE page (files query resolves empty). */
	const serveFolderPage = (total: number): void => {
		const edges = Array.from({ length: total }, (_, i) => makeFolderEdge(i));
		gatewayApiStub.callsFake(async (gqlQuery: { query: string }) => {
			if (gqlQuery.query.includes('values: "folder"')) {
				return { edges, pageInfo: { hasNextPage: false } };
			}
			// Files query: empty in a single page.
			return { edges: [], pageInfo: { hasNextPage: false } };
		});
	};

	beforeEach(async () => {
		const { PromiseCache } = await import('@ardrive/ardrive-promise-cache');
		const { defaultCacheParams } = await import('./arfsdao_anonymous');

		caches = {
			ownerCache: new PromiseCache(defaultCacheParams),
			driveIdCache: new PromiseCache(defaultCacheParams),
			publicDriveCache: new PromiseCache(defaultCacheParams),
			publicFolderCache: new PromiseCache(defaultCacheParams),
			publicFileCache: new PromiseCache(defaultCacheParams),
			syncStateCache: new PromiseCache<DriveID, DriveSyncState>({
				cacheCapacity: 100,
				cacheTTL: 1000 * 60 * 5
			})
		};

		const gatewayApi = new GatewayAPI({ gatewayUrl: new URL('https://arweave.net') });
		gatewayApiStub = stub(gatewayApi, 'gqlRequest');
		getTxDataStub = stub(gatewayApi, 'getTxData');

		arfsDaoIncSync = new ArFSDAOAnonymousIncrementalSync(fakeArweave, 'test_app', '0.0', caches, gatewayApi);
		stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());
	});

	afterEach(() => {
		gatewayApiStub.restore();
		getTxDataStub.restore();
	});

	it('processes a page far larger than the cap with peak in-flight fetches <= the cap (none dropped)', async () => {
		// A page ~8x the cap: enough to reveal any unbounded fan-out.
		const total = MAX_CONCURRENT_ENTITY_FETCHES * 8 + 7; // 247
		serveFolderPage(total);

		// Instrument the per-entity metadata fetch to record peak concurrent in-flight count.
		let inFlight = 0;
		let peakInFlight = 0;
		const folderMetadata = Buffer.from(JSON.stringify({ name: 'Test Folder' }));
		getTxDataStub.callsFake(async () => {
			inFlight++;
			peakInFlight = Math.max(peakInFlight, inFlight);
			// Hold the fetch open briefly so overlapping fetches actually overlap in time.
			await new Promise((resolve) => setTimeout(resolve, 3));
			inFlight--;
			return folderMetadata;
		});

		const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner);

		// Every distinct folder was processed — nothing dropped by the concurrency bounding.
		expect(result.stats.totalProcessed).to.equal(total);
		expect(result.entities).to.have.lengthOf(total);
		expect(new Set(result.entities.map((e) => `${e.entityId}`)).size).to.equal(total);
		expect(result.stats.failedEntities ?? 0).to.equal(0);

		// One metadata fetch per entity, all of them made...
		expect(getTxDataStub.callCount).to.equal(total);
		// ...but never more than the cap were ever in flight at once...
		expect(peakInFlight).to.be.at.most(MAX_CONCURRENT_ENTITY_FETCHES);
		// ...and the cap was actually reached (the fan-out is genuinely parallel, just bounded).
		expect(peakInFlight).to.equal(MAX_CONCURRENT_ENTITY_FETCHES);
	});
});
