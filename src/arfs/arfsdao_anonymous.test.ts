import Arweave from 'arweave';
import { expect } from 'chai';
import { stub } from 'sinon';
import {
	stubArweaveAddress,
	stubEntityID,
	stubEntityIDAlt,
	stubPublicDrive,
	stubPublicFile,
	stubPublicFolder
} from '../../tests/stubs';
import { ArweaveAddress, DriveID, EntityID } from '../types';
import {
	ArFSAnonymousCache,
	ArFSDAOAnonymous,
	ArFSPublicDriveCacheKey,
	ArFSPublicFileCacheKey,
	ArFSPublicFolderCacheKey
} from './arfsdao_anonymous';
import { ArFSPublicDrive, ArFSPublicFile, ArFSPublicFolder } from './arfs_entities';
import { ArFSEntityCache } from './arfs_entity_cache';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

describe('ArFSDAOAnonymous class', () => {
	let caches: ArFSAnonymousCache;
	let arfsDaoAnonymous: ArFSDAOAnonymous;
	const ownerCache = new ArFSEntityCache<DriveID, ArweaveAddress>(10);
	const driveIdCache = new ArFSEntityCache<EntityID, DriveID>(10);
	const publicDriveCache = new ArFSEntityCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>(10);
	const publicFolderCache = new ArFSEntityCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>(10);
	const publicFileCache = new ArFSEntityCache<ArFSPublicFileCacheKey, ArFSPublicFile>(10);

	beforeEach(() => {
		// Start each test with a newly wrapped file
		caches = {
			ownerCache,
			driveIdCache,
			publicDriveCache,
			publicFolderCache,
			publicFileCache
		};
		arfsDaoAnonymous = new ArFSDAOAnonymous(fakeArweave, 'test_app', '0.0', caches);
	});

	describe('caching behaviors of', () => {
		describe('getOwnerForDriveId function', () => {
			it('returns an owner for a specified driveId from cache when cached entry is available', async () => {
				const cachedAddress = stubArweaveAddress();
				const promise = Promise.resolve(cachedAddress);
				stub(ownerCache, 'get').returns(promise);
				expect((await arfsDaoAnonymous.getOwnerForDriveId(stubEntityID)).equals(cachedAddress)).to.be.true;
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the owner for a driveId on a cache miss', async () => {
			// 	const cachedAddress = stubArweaveAddress();
			// 	const promise = Promise.resolve(cachedAddress);
			// 	stub(ownerCache, 'put').returns(promise);
			// 	expect((await arfsDaoAnonymous.getOwnerForDriveId(stubEntityID)).equals(cachedAddress)).to.be.true;
			// });
		});

		describe('getDriveIDForEntityId function', () => {
			it('returns a drive ID for a specified entity ID from cache when cached entry is available', async () => {
				const cachedDriveId = stubEntityID;
				const promise = Promise.resolve(cachedDriveId);
				stub(driveIdCache, 'get').returns(promise);
				expect((await arfsDaoAnonymous.getDriveIDForEntityId(stubEntityIDAlt, 'File-Id')).equals(cachedDriveId))
					.to.be.true;
				expect(
					(await arfsDaoAnonymous.getDriveIDForEntityId(stubEntityIDAlt, 'Folder-Id')).equals(cachedDriveId)
				).to.be.true;
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the drive ID on a cache miss', async () => {
			// 	const cachedDriveId = stubEntityID;
			// 	const promise = Promise.resolve(cachedDriveId);
			// 	stub(driveIdCache, 'put').returns(promise);
			// 	expect((await arfsDaoAnonymous.getDriveIDForEntityId(stubEntityIDAlt, 'File-Id')).equals(cachedDriveId)).to
			// 		.be.true;
			// 	expect((await arfsDaoAnonymous.getDriveIDForEntityId(stubEntityIDAlt, 'Folder-Id')).equals(cachedDriveId))
			// 		.to.be.true;
			// });
		});

		describe('getDriveOwnerForFolderId function', () => {
			it('returns an owner for a specified folderId from cache when cached entry is available', async () => {
				const cachedDriveId = stubEntityID;
				const driveIdPromise = Promise.resolve(cachedDriveId);
				stub(driveIdCache, 'get').returns(driveIdPromise);
				const cachedAddress = stubArweaveAddress();
				const addressPromise = Promise.resolve(cachedAddress);
				stub(ownerCache, 'get').returns(addressPromise);
				expect((await arfsDaoAnonymous.getDriveOwnerForFolderId(stubEntityIDAlt)).equals(cachedAddress)).to.be
					.true;
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the owner ID on a cache miss', async () => {
			// 	const cachedDriveId = stubEntityID;
			// 	const driveIdPromise = Promise.resolve(cachedDriveId);
			// 	stub(driveIdCache, 'get').returns(driveIdPromise);
			// 	const cachedAddress = stubArweaveAddress();
			// 	const addressPromise = Promise.resolve(cachedAddress);
			// 	stub(ownerCache, 'put').returns(addressPromise);
			// 	expect((await arfsDaoAnonymous.getDriveOwnerForFolderId(stubEntityIDAlt)).equals(cachedAddress)).to.be.true;
			// });
		});

		describe('getDriveOwnerForFileId function', () => {
			it('returns an owner for a specified folderId from cache when cached entry is available', async () => {
				const cachedDriveId = stubEntityID;
				const driveIdPromise = Promise.resolve(cachedDriveId);
				stub(driveIdCache, 'get').returns(driveIdPromise);
				const cachedAddress = stubArweaveAddress();
				const addressPromise = Promise.resolve(cachedAddress);
				stub(ownerCache, 'get').returns(addressPromise);
				expect((await arfsDaoAnonymous.getDriveOwnerForFileId(stubEntityIDAlt)).equals(cachedAddress)).to.be
					.true;
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the owner ID on a cache miss', async () => {
			// 	const cachedDriveId = stubEntityID;
			// 	const driveIdPromise = Promise.resolve(cachedDriveId);
			// 	stub(driveIdCache, 'get').returns(driveIdPromise);
			// 	const cachedAddress = stubArweaveAddress();
			// 	const addressPromise = Promise.resolve(cachedAddress);
			// 	stub(ownerCache, 'put').returns(addressPromise);
			// 	expect((await arfsDaoAnonymous.getDriveOwnerForFileId(stubEntityIDAlt)).equals(cachedAddress)).to.be.true;
			// });
		});

		describe('getDriveIdForFileId function', () => {
			it('returns a drive ID for a specified file ID from cache when cached entry is available', async () => {
				const cachedDriveId = stubEntityID;
				const promise = Promise.resolve(cachedDriveId);
				stub(driveIdCache, 'get').returns(promise);
				expect((await arfsDaoAnonymous.getDriveIdForFileId(stubEntityIDAlt)).equals(cachedDriveId)).to.be.true;
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the drive ID on a cache miss', async () => {
			// 	const cachedDriveId = stubEntityID;
			// 	const promise = Promise.resolve(cachedDriveId);
			// 	stub(driveIdCache, 'put').returns(promise);
			// 	expect((await arfsDaoAnonymous.getDriveIdForFileId(stubEntityIDAlt)).equals(cachedDriveId)).to.be.true;
			// });
		});

		describe('getDriveIdForFolderId function', () => {
			it('returns a drive ID for a specified folder ID from cache when cached entry is available', async () => {
				const cachedDriveId = stubEntityID;
				const promise = Promise.resolve(cachedDriveId);
				stub(driveIdCache, 'get').returns(promise);
				expect((await arfsDaoAnonymous.getDriveIdForFolderId(stubEntityIDAlt)).equals(cachedDriveId)).to.be
					.true;
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the drive ID on a cache miss', async () => {
			// 	const cachedDriveId = stubEntityID;
			// 	const promise = Promise.resolve(cachedDriveId);
			// 	stub(driveIdCache, 'put').returns(promise);
			// 	expect((await arfsDaoAnonymous.getDriveIdForFolderId(stubEntityIDAlt)).equals(cachedDriveId)).to.be.true;
			// });
		});

		describe('getPublicDrive function', () => {
			it('returns a drive for a specified folder ID and owner from cache when cached entry is available', async () => {
				const cachedDrive = stubPublicDrive();
				const promise = Promise.resolve(cachedDrive);
				stub(publicDriveCache, 'get').returns(promise);
				expect(await arfsDaoAnonymous.getPublicDrive(stubEntityID, stubArweaveAddress())).to.equal(cachedDrive);
			});

			// // TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the drive on a cache miss', async () => {
			// 	const cachedDrive = stubPublicDrive();
			// 	const promise = Promise.resolve(cachedDrive);
			// 	stub(publicDriveCache, 'put').returns(promise);
			// 	expect(await arfsDaoAnonymous.getPublicDrive(stubEntityID, stubArweaveAddress())).to.equal(cachedDrive);
			// });
		});

		describe('getPublicFolder function', () => {
			it('returns a folder for a specified folder ID and owner from cache when cached entry is available', async () => {
				const cachedFolder = stubPublicFolder({});
				const promise = Promise.resolve(cachedFolder);
				stub(publicFolderCache, 'get').returns(promise);
				expect(await arfsDaoAnonymous.getPublicFolder(stubEntityID, stubArweaveAddress())).to.equal(
					cachedFolder
				);
			});

			// // TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the folder on a cache miss', async () => {
			// 	const cachedFolder = stubPublicFolder({});
			// 	const promise = Promise.resolve(cachedFolder);
			// 	stub(publicFolderCache, 'put').returns(promise);
			// 	expect(await arfsDaoAnonymous.getPublicFolder(stubEntityID, stubArweaveAddress())).to.equal(cachedFolder);
			// });
		});

		describe('getPublicFile function', () => {
			it('returns a file for a specified file ID and owner from cache when cached entry is available', async () => {
				const cachedFile = stubPublicFile({});
				const promise = Promise.resolve(cachedFile);
				stub(publicFileCache, 'get').returns(promise);
				expect(await arfsDaoAnonymous.getPublicFile(stubEntityID, stubArweaveAddress())).to.equal(cachedFile);
			});

			// // TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the file on a cache miss', async () => {
			// 	const cachedFile = stubPublicFile({});
			// 	const promise = Promise.resolve(cachedFile);
			// 	stub(publicFileCache, 'put').returns(promise);
			// 	expect(await arfsDaoAnonymous.getPublicFile(stubEntityID, stubArweaveAddress())).to.equal(cachedFile);
			// });
		});
	});
});
