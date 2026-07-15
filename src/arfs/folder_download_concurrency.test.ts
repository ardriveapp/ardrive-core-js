/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Arweave from 'arweave';
import { expect } from 'chai';
import { stub, SinonStub } from 'sinon';
import { Readable } from 'stream';
import {
	getStubDriveKey,
	stubArweaveAddress,
	stubPublicFile,
	stubPublicFolder,
	stubPrivateFile,
	stubPrivateFolder,
	stubTxID
} from '../../tests/stubs';
import { DriveKey, EID, FolderID } from '../types';
import { RootFolderID } from './arfs_builders/arfs_folder_builders';
import { ArFSDAOAnonymous } from './arfsdao_anonymous';
import { ArFSDAO } from './arfsdao';
import { ArFSPublicFile, ArFSPrivateFile } from './arfs_entities';
import { FolderHierarchy } from './folder_hierarchy';
import { ArFSFolderToDownload, ArFSPublicFileToDownload, ArFSPrivateFileToDownload } from './arfs_file_wrapper';
import { DEFAULT_DOWNLOAD_CONCURRENCY } from '../utils/constants';
import { readJWKFile } from '../utils/common';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Deterministic, unique entity IDs derived from an index. Uses a valid v4 UUID
// layout (version nibble 4, variant nibble 8) so uuid.parse in deriveFileKey accepts it.
const idFromIndex = (i: number): FolderID => EID(`00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`);

const ROOT_FOLDER_ID = idFromIndex(1);
const FILE_COUNT = 12; // > DEFAULT_DOWNLOAD_CONCURRENCY so the pool can saturate

/**
 * A concurrency tracker used to prove the download pool is truly bounded: every
 * mocked data-stream fetch bumps a live in-flight counter, holds it for an
 * artificial delay so tasks overlap, then releases it.
 */
class ConcurrencyTracker {
	inFlight = 0;
	maxInFlight = 0;
	totalCalls = 0;

	async track<T>(fn: () => Promise<T>): Promise<T> {
		this.inFlight++;
		this.totalCalls++;
		this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
		try {
			await delay(20);
			return await fn();
		} finally {
			this.inFlight--;
		}
	}
}

describe('bounded-concurrency folder downloads', () => {
	describe('ArFSDAOAnonymous.downloadPublicFolder', () => {
		let dao: ArFSDAOAnonymous;
		let ensureFolderStub: SinonStub;
		let writeStub: SinonStub;

		const owner = stubArweaveAddress();
		const rootFolder = stubPublicFolder({
			folderId: ROOT_FOLDER_ID,
			parentFolderId: new RootFolderID(),
			folderName: 'root'
		});

		const files: ArFSPublicFile[] = Array.from({ length: FILE_COUNT }, (_, i) =>
			stubPublicFile({
				fileId: idFromIndex(100 + i),
				parentFolderId: ROOT_FOLDER_ID,
				fileName: `file-${i}.txt`,
				dataTxId: stubTxID
			})
		);

		beforeEach(() => {
			dao = new ArFSDAOAnonymous(fakeArweave);
			stub(dao, 'getPublicFolder').resolves(rootFolder);
			stub(dao, 'getAllFoldersOfPublicDrive').resolves([rootFolder]);
			stub(dao, 'getPublicFilesWithParentFolderIds').resolves(files);
			// Never touch the real filesystem.
			ensureFolderStub = stub(ArFSFolderToDownload.prototype, 'ensureFolderExistence').returns(undefined);
			writeStub = stub(ArFSPublicFileToDownload.prototype, 'write').resolves();
		});

		afterEach(() => {
			ensureFolderStub.restore();
			writeStub.restore();
		});

		it('writes every file and never exceeds DEFAULT_DOWNLOAD_CONCURRENCY in-flight downloads', async () => {
			const tracker = new ConcurrencyTracker();
			const getStreamStub = stub(dao, 'getPublicDataStream').callsFake(async () =>
				tracker.track(async () => Readable.from(Buffer.from('data')))
			);

			await dao.downloadPublicFolder({
				folderId: ROOT_FOLDER_ID,
				destFolderPath: '/tmp/ardrive-test-dl',
				maxDepth: 1,
				owner
			});

			// (a) all files written
			expect(writeStub.callCount).to.equal(FILE_COUNT);
			expect(getStreamStub.callCount).to.equal(FILE_COUNT);
			expect(tracker.totalCalls).to.equal(FILE_COUNT);
			// (b) concurrency truly bounded, and the pool saturates to the limit
			expect(tracker.maxInFlight).to.be.at.most(DEFAULT_DOWNLOAD_CONCURRENCY);
			expect(tracker.maxInFlight).to.equal(DEFAULT_DOWNLOAD_CONCURRENCY);
			expect(tracker.inFlight).to.equal(0);
		});

		it('rejects the whole operation if any file download fails', async () => {
			let callCount = 0;
			stub(dao, 'getPublicDataStream').callsFake(async () => {
				callCount++;
				if (callCount === 3) {
					throw new Error('network exploded');
				}
				return Readable.from(Buffer.from('data'));
			});

			let error: Error | undefined;
			try {
				await dao.downloadPublicFolder({
					folderId: ROOT_FOLDER_ID,
					destFolderPath: '/tmp/ardrive-test-dl',
					maxDepth: 1,
					owner
				});
			} catch (e) {
				error = e as Error;
			}
			expect(error).to.be.instanceOf(Error);
			expect(error?.message).to.equal('network exploded');
		});
	});

	describe('ArFSDAO.downloadPrivateFolder', () => {
		const wallet = readJWKFile('./test_wallet.json');
		let dao: ArFSDAO;
		let driveKey: DriveKey;
		let ensureFolderStub: SinonStub;
		let writeStub: SinonStub;
		let rootFolder: Awaited<ReturnType<typeof stubPrivateFolder>>;
		let files: ArFSPrivateFile[];

		const owner = stubArweaveAddress();
		// 16 zero-bytes base64 — a structurally valid Cipher-IV for StreamDecrypt construction.
		const validCipherIV = Buffer.alloc(16).toString('base64');

		beforeEach(async () => {
			driveKey = await getStubDriveKey();
			rootFolder = await stubPrivateFolder({
				folderId: ROOT_FOLDER_ID,
				parentFolderId: new RootFolderID(),
				folderName: 'root'
			});
			files = [];
			for (let i = 0; i < FILE_COUNT; i++) {
				files.push(
					await stubPrivateFile({
						fileId: idFromIndex(100 + i),
						parentFolderId: ROOT_FOLDER_ID,
						fileName: `file-${i}.txt`,
						dataTxId: stubTxID
					})
				);
			}

			dao = new ArFSDAO(wallet, fakeArweave, true, 'ArFSDAO-Test', '1.0');
			const hierarchy = FolderHierarchy.newFromEntities([rootFolder]);
			stub(dao, 'getPrivateFolder').resolves(rootFolder);
			stub(dao, 'separatedHierarchyOfFolder').resolves({
				hierarchy,
				childFiles: files,
				childFolders: []
			});
			stub(dao, 'getCipherIVOfPrivateTransactionIDs').resolves(
				files.map((file) => ({ txId: file.dataTxId, cipherIV: validCipherIV }))
			);
			stub(dao, 'getAuthTagForPrivateFile').resolves(Buffer.alloc(16));
			ensureFolderStub = stub(ArFSFolderToDownload.prototype, 'ensureFolderExistence').returns(undefined);
			writeStub = stub(ArFSPrivateFileToDownload.prototype, 'write').resolves();
		});

		afterEach(() => {
			ensureFolderStub.restore();
			writeStub.restore();
		});

		it('writes every file and never exceeds DEFAULT_DOWNLOAD_CONCURRENCY in-flight downloads', async () => {
			const tracker = new ConcurrencyTracker();
			const getStreamStub = stub(dao, 'getPrivateDataStream').callsFake(async () =>
				tracker.track(async () => Readable.from(Buffer.from('data')))
			);

			await dao.downloadPrivateFolder({
				folderId: ROOT_FOLDER_ID,
				destFolderPath: '/tmp/ardrive-test-dl-priv',
				maxDepth: 1,
				driveKey,
				owner
			});

			expect(writeStub.callCount).to.equal(FILE_COUNT);
			expect(getStreamStub.callCount).to.equal(FILE_COUNT);
			expect(tracker.totalCalls).to.equal(FILE_COUNT);
			expect(tracker.maxInFlight).to.be.at.most(DEFAULT_DOWNLOAD_CONCURRENCY);
			expect(tracker.maxInFlight).to.equal(DEFAULT_DOWNLOAD_CONCURRENCY);
			expect(tracker.inFlight).to.equal(0);
		});

		it('rejects the whole operation if any file download fails', async () => {
			let callCount = 0;
			stub(dao, 'getPrivateDataStream').callsFake(async () => {
				callCount++;
				if (callCount === 3) {
					throw new Error('private network exploded');
				}
				return Readable.from(Buffer.from('data'));
			});

			let error: Error | undefined;
			try {
				await dao.downloadPrivateFolder({
					folderId: ROOT_FOLDER_ID,
					destFolderPath: '/tmp/ardrive-test-dl-priv',
					maxDepth: 1,
					driveKey,
					owner
				});
			} catch (e) {
				error = e as Error;
			}
			expect(error).to.be.instanceOf(Error);
			expect(error?.message).to.equal('private network exploded');
		});
	});
});
