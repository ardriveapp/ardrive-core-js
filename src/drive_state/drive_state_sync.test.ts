/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stub } from 'sinon';
import { ArDrive } from '../ardrive';
import { ArFSDAO } from '../arfs/arfsdao';
import { ArFSDAOAnonymous } from '../arfs/arfsdao_anonymous';
import { CommunityOracle } from '../community/community_oracle';
import { JWKWallet } from '../jwk_wallet';
import { ARDataPriceEstimator } from '../pricing/ar_data_price_estimator';
import { stubPublicFile } from '../../tests/stubs';
import { ADDR, EID, IncrementalSyncResult, TxID, UnixTime } from '../types';
import { WalletDAO } from '../wallet_dao';
import { readDriveState } from './drive_state_reader';

const FIXTURES = join(__dirname, '../../tests/fixtures/drive_state');
const sidecar = JSON.parse(readFileSync(join(FIXTURES, 'public-gzip.json'), 'utf8'));
const OWNER = sidecar.reader.ownerAddress as string;
const DRIVE = sidecar.reader.driveId as string;

async function contents() {
	const tags: Record<string, string> = {};
	for (const tag of sidecar.transaction.tags) tags[tag.name] ??= tag.value;
	return readDriveState(
		{ txId: sidecar.transaction.id, ownerAddress: OWNER, tags },
		readFileSync(join(FIXTURES, sidecar.body)),
		{ expectedOwnerAddress: OWNER, protection: { kind: 'public' } }
	);
}

function result(entities: any[], highestBlockHeight: number): IncrementalSyncResult {
	return {
		entities,
		changes: { added: [], modified: [], unreachable: [] },
		newSyncState: {
			driveId: EID(DRIVE),
			drivePrivacy: 'public',
			lastSyncedBlockHeight: highestBlockHeight,
			lastSyncedTimestamp: new UnixTime(0),
			entityStates: new Map()
		},
		stats: {
			totalProcessed: entities.length,
			fromCache: 0,
			fromNetwork: entities.length,
			lowestBlockHeight: 0,
			highestBlockHeight
		}
	};
}

describe('a first incremental sync from drive state', () => {
	function arDriveWith(incSync: any): ArDrive {
		const arDrive = new ArDrive(
			new JWKWallet({ kty: 'RSA', n: 'n', e: 'AQAB', d: 'd', p: 'p', q: 'q', dp: 'dp', dq: 'dq', qi: 'qi' }),
			{} as WalletDAO,
			{} as ArFSDAO,
			{} as CommunityOracle,
			'test_app',
			'0.0',
			{} as ARDataPriceEstimator
		);
		(arDrive as any).arFsDao = { anonymousIncSync: incSync };
		return arDrive;
	}

	function incSyncReading(read: any, sync: any) {
		const dao = Object.create(ArFSDAOAnonymous.prototype);
		dao.readDriveState = stub().resolves(read);
		dao.isDriveStateEnabled = () => true;
		dao.getPublicDriveIncrementalSync = sync;
		return dao;
	}

	it('starts from the artifact and syncs only the blocks after it, without stopping early', async () => {
		const c = await contents();
		const report = c.files.find((f) => f.name === 'report.pdf')!;
		const renamed = stubPublicFile({
			fileId: EID(report.id),
			fileName: 'renamed.pdf',
			parentFolderId: EID(report.parentFolderId),
			driveId: EID(DRIVE),
			txId: TxID('R'.repeat(43))
		});
		(renamed as any).blockHeight = c.blockEnd + 10;
		const sync = stub().resolves(result([renamed], c.blockEnd + 10));

		const synced = await arDriveWith(
			incSyncReading({ outcome: 'used', contents: c, attempts: 1, detail: '' }, sync)
		).syncPublicDrive(EID(DRIVE), ADDR(OWNER));

		const passed = sync.firstCall.args[2];
		expect(passed.syncState.lastSyncedBlockHeight).to.equal(c.blockEnd);
		expect(passed.syncState.entityStates.size).to.equal(c.folders.length + c.files.length);
		expect(passed.stopAfterKnownCount).to.equal(Number.MAX_SAFE_INTEGER);

		expect(synced.entities).to.have.length(c.folders.length + c.files.length);
		expect(synced.entities.find((e) => `${e.entityId}` === report.id)!.name).to.equal('renamed.pdf');
		expect(synced.changes.added).to.have.length(c.folders.length + c.files.length);
		expect(synced.newSyncState.lastSyncedBlockHeight).to.equal(c.blockEnd + 10);
		expect(synced.driveState).to.deep.equal({ txId: c.txId, blockEnd: c.blockEnd });
	});

	it('keeps the artifact height when nothing came after it', async () => {
		const c = await contents();
		const sync = stub().resolves(result([], 0));

		const synced = await arDriveWith(
			incSyncReading({ outcome: 'used', contents: c, attempts: 1, detail: '' }, sync)
		).syncPublicDrive(EID(DRIVE), ADDR(OWNER));

		expect(synced.newSyncState.lastSyncedBlockHeight).to.equal(c.blockEnd);
	});

	it('syncs as before when the drive has no usable artifact', async () => {
		const sync = stub().resolves(result([], 5));

		const synced = await arDriveWith(
			incSyncReading({ outcome: 'none-found', attempts: 0, detail: '' }, sync)
		).syncPublicDrive(EID(DRIVE), ADDR(OWNER), { batchSize: 10 });

		expect(sync.firstCall.args[2]).to.deep.equal({ batchSize: 10 });
		expect(synced.driveState).to.equal(undefined);
	});

	it('never reads one when the caller already holds state', async () => {
		const sync = stub().resolves(result([], 5));
		const dao = incSyncReading({ outcome: 'used' }, sync);
		const state = {
			driveId: EID(DRIVE),
			drivePrivacy: 'public' as const,
			lastSyncedBlockHeight: 7,
			lastSyncedTimestamp: new UnixTime(0),
			entityStates: new Map()
		};

		await arDriveWith(dao).syncPublicDrive(EID(DRIVE), ADDR(OWNER), { syncState: state });

		expect(dao.readDriveState.called).to.equal(false);
		expect(sync.firstCall.args[2].syncState).to.equal(state);
	});
});
