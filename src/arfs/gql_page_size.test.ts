/* eslint-disable @typescript-eslint/no-explicit-any */
import Arweave from 'arweave';
import { expect } from 'chai';
import { stub, SinonStub } from 'sinon';
import { stubArweaveAddress, stubEntityID, stubTxID, stubPublicDrive } from '../../tests/stubs';
import { DriveID, DriveSyncState, GQLEdgeInterface, GQLNodeInterface } from '../types';
import { ArFSDAOAnonymousIncrementalSync, ArFSIncrementalSyncCache } from './arfsdao_anonymous_incremental_sync';
import { GatewayAPI } from '../utils/gateway_api';
import { buildQuery } from '../utils/query';
import { GQL_PAGE_SIZE } from '../utils/constants';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

/**
 * CORE-7 (page size 100 -> 1000) safety + request-count tests.
 *
 * The load-bearing invariant these lock down: pagination is cursor +
 * `pageInfo.hasNextPage` driven, so a larger `first:` NEVER drops entities — even
 * against a gateway that silently returns FEWER than `first` for a page (all Arweave
 * gateways cap `first` at 1000). The request count drops ~10x, the entity SET does not
 * change.
 */
describe('GraphQL page size (CORE-7)', () => {
	describe('buildQuery default page size', () => {
		it('GQL_PAGE_SIZE is the 1000 gateway maximum', () => {
			expect(GQL_PAGE_SIZE).to.equal(1000);
		});

		it('defaults transactions(first: …) to GQL_PAGE_SIZE for paged (cursor) queries', () => {
			const { query } = buildQuery({ tags: [{ name: 'Drive-Id', value: 'x' }], cursor: 'CURSOR' });
			expect(query).to.contain('first: 1000');
		});

		it('still honors an explicit first override', () => {
			const { query } = buildQuery({ tags: [{ name: 'Drive-Id', value: 'x' }], cursor: 'CURSOR', first: 250 });
			expect(query).to.contain('first: 250');
			expect(query).to.not.contain('first: 1000');
		});
	});

	describe('incremental sync pagination', () => {
		let arfsDaoIncSync: ArFSDAOAnonymousIncrementalSync;
		let gatewayApiStub: SinonStub;
		let getTxDataStub: SinonStub;
		let caches: ArFSIncrementalSyncCache;

		const mockDriveId = stubEntityID;
		const mockOwner = stubArweaveAddress();

		// A distinct 8-4-4-4-12 hex entity id per index so every folder is a distinct entity.
		const folderIdForIndex = (i: number): string =>
			`${i.toString(16).padStart(8, '0')}-1111-1111-1111-111111111111`;

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

		/** Wires the folder query to serve `total` edges in pages of at most `pageCap`. */
		const serveFolderPagesCappedAt = (total: number, pageCap: number): { folderRequests: () => number } => {
			const edges = Array.from({ length: total }, (_, i) => makeFolderEdge(i));
			let folderRequests = 0;
			gatewayApiStub.callsFake(async (gqlQuery: { query: string }) => {
				const q = gqlQuery.query;
				if (q.includes('values: "folder"')) {
					const start = folderRequests * pageCap;
					folderRequests++;
					const pageEdges = edges.slice(start, start + pageCap);
					return { edges: pageEdges, pageInfo: { hasNextPage: start + pageCap < total } };
				}
				// Files query: empty in a single page.
				return { edges: [], pageInfo: { hasNextPage: false } };
			});
			return { folderRequests: () => folderRequests };
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
			getTxDataStub.resolves(Buffer.from(JSON.stringify({ name: 'Test Folder' })));

			arfsDaoIncSync = new ArFSDAOAnonymousIncrementalSync(fakeArweave, 'test_app', '0.0', caches, gatewayApi);
			stub(arfsDaoIncSync, 'getPublicDrive').resolves(await stubPublicDrive());
		});

		afterEach(() => {
			gatewayApiStub.restore();
			getTxDataStub.restore();
		});

		// (a) Capped-gateway safety: gateway caps pages at 100 even though we ask for 1000.
		// hasNextPage-driven pagination must still fetch EVERY entity — none dropped.
		it('fetches ALL entities when the gateway caps a 1000-page request at 100 (no drops)', async () => {
			const total = 250;
			const gatewayCap = 100; // gateway silently returns <= 100 despite first: 1000
			const counter = serveFolderPagesCappedAt(total, gatewayCap);

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner);

			// Every one of the 250 distinct folders survives to the result — nothing dropped.
			expect(result.stats.totalProcessed).to.equal(total);
			expect(result.entities).to.have.lengthOf(total);
			expect(result.changes.added).to.have.lengthOf(total);
			const distinctIds = new Set(result.entities.map((e) => `${e.entityId}`));
			expect(distinctIds.size).to.equal(total);

			// Pagination followed hasNextPage (ceil(250/100) = 3), NOT edges.length === first.
			expect(counter.folderRequests()).to.equal(3);

			// ...and every folder request still asked for the full 1000-entity page.
			const folderCalls = gatewayApiStub.getCalls().filter((c) => c.args[0].query.includes('values: "folder"'));
			folderCalls.forEach((c) => expect(c.args[0].query).to.contain('first: 1000'));
		});

		// (c) Request-count: N entities need ceil(N/1000) page requests, not ceil(N/100).
		it('needs ceil(N/1000) page requests for a gateway honoring the full page (~10x fewer than size 100)', async () => {
			const total = 1500;
			const counter = serveFolderPagesCappedAt(total, GQL_PAGE_SIZE); // 1000, 500

			const result = await arfsDaoIncSync.getPublicDriveIncrementalSync(mockDriveId, mockOwner);

			expect(result.stats.totalProcessed).to.equal(total);
			expect(result.entities).to.have.lengthOf(total);

			// ceil(1500/1000) = 2 requests, versus ceil(1500/100) = 15 under the old page size.
			expect(counter.folderRequests()).to.equal(2);
			expect(Math.ceil(total / 100)).to.equal(15); // documents the request count the old size 100 would have needed
		});
	});
});
