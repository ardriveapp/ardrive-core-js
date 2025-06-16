/* eslint-disable prettier/prettier */
import Arweave from 'arweave';
import { expect } from 'chai';
import { stub, SinonStub } from 'sinon';
import {
	stubArweaveAddress,
	stubEntityID,
	stubEntityIDAlt,
	stubPublicDrive,
	stubPublicFile,
	stubPublicFolder,
	stubTxID,
	stubTxIDAlt,
	stubTxIDAltTwo
} from '../../tests/stubs';
import { ADDR, ArweaveAddress, DriveID, EID, EntityID } from '../types';
import {
	ArFSAnonymousCache,
	ArFSDAOAnonymous,
	ArFSPublicDriveCacheKey,
	ArFSPublicFileCacheKey,
	ArFSPublicFolderCacheKey,
	defaultCacheParams
} from './arfsdao_anonymous';
import { ArFSPublicDrive, ArFSPublicFile, ArFSPublicFolder } from './arfs_entities';
import { PromiseCache } from '@ardrive/ardrive-promise-cache';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

describe('ArFSDAOAnonymous class', () => {
	let caches: ArFSAnonymousCache;
	let arfsDaoAnonymous: ArFSDAOAnonymous;
	const ownerCache = new PromiseCache<DriveID, ArweaveAddress>(defaultCacheParams);
	const driveIdCache = new PromiseCache<EntityID, DriveID>(defaultCacheParams);
	const publicDriveCache = new PromiseCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>(defaultCacheParams);
	const publicFolderCache = new PromiseCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>(defaultCacheParams);
	const publicFileCache = new PromiseCache<ArFSPublicFileCacheKey, ArFSPublicFile>(defaultCacheParams);

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

	describe('getPublicFilesWithParentFolderIds', () => {
		let dao: ArFSDAOAnonymous;
		let gqlRequestStub: SinonStub;
		let ArFSPublicFileBuilderStub: SinonStub;

		beforeEach(() => {
			dao = new ArFSDAOAnonymous(fakeArweave);
			gqlRequestStub = stub(dao['gatewayApi'], 'gqlRequest');
			ArFSPublicFileBuilderStub = stub(ArFSPublicFileBuilder.prototype, 'getDataForTxID');
		});

		afterEach(() => {
			gqlRequestStub.restore();
			ArFSPublicFileBuilderStub.restore();
		});

		it('returns expected files for given folder IDs', async () => {
			// Mock GQL response
			const mockGQLResponse = {
				edges: [
					{
						cursor: 'cursor1',
						node: {
							id: `${stubTxID}`,
							tags: [
								{ name: 'App-Name', value: 'ArDrive-CLI' },
								{ name: 'App-Version', value: '1.2.0' },
								{ name: 'ArFS', value: '0.15' },
								{ name: 'Content-Type', value: 'application/json' },
								{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
								{ name: 'Entity-Type', value: 'file' },
								{ name: 'Unix-Time', value: '1639073846' },
								{ name: 'Parent-Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
								{ name: 'File-Id', value: '9f7038c7-26bd-4856-a843-8de24b828d4e' }
							],
							owner: { address: 'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI' }
						}
					}
				],
				pageInfo: {
					hasNextPage: false
				}
			};

			gqlRequestStub.resolves(mockGQLResponse);

			// Add stub for getDataForTxID
			const stubFileGetDataResult = Buffer.from(
				JSON.stringify({
					name: '2',
					size: 2048,
					lastModifiedDate: 1639073634269,
					dataTxId: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c',
					dataContentType: 'unknown'
				})
			);

			// Stub the getDataForTxID method on the builder
			ArFSPublicFileBuilderStub.resolves(stubFileGetDataResult);

			const folderIds = [EID('6c312b3e-4778-4a18-8243-f2b346f5e7cb')];
			const owner = ADDR('vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI');
			const driveId = EID('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');

			const files = await dao.getPublicFilesWithParentFolderIds(folderIds, owner, driveId, true);

			expect(files).to.have.lengthOf(1);
			expect(`${files[0].fileId}`).to.equal('9f7038c7-26bd-4856-a843-8de24b828d4e');
			expect(`${files[0].driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
			expect(`${files[0].parentFolderId}`).to.equal('6c312b3e-4778-4a18-8243-f2b346f5e7cb');
		});

		it('handles pagination correctly', async () => {
			const fileId1 = '9f7038c7-26bd-4856-a843-8de24b828d4e';
			const fileId2 = '1f7038c7-26bd-4856-a843-8de24b828d4e';

			// Mock two pages of GQL responses
			const mockGQLResponse1 = {
				edges: [
					{
						cursor: 'cursor1',
						node: {
							id: `${stubTxID}`,
							tags: [
								{ name: 'App-Name', value: 'ArDrive-CLI' },
								{ name: 'App-Version', value: '1.2.0' },
								{ name: 'ArFS', value: '0.15' },
								{ name: 'Content-Type', value: 'application/json' },
								{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
								{ name: 'Entity-Type', value: 'file' },
								{ name: 'Unix-Time', value: '1639073846' },
								{ name: 'Parent-Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
								{ name: 'File-Id', value: fileId1 }
							],
							owner: { address: 'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI' }
						}
					}
				],
				pageInfo: {
					hasNextPage: true
				}
			};

			const mockGQLResponse2 = {
				edges: [
					{
						cursor: 'cursor2',
						node: {
							id: `${stubTxIDAlt}`,
							tags: [
								{ name: 'App-Name', value: 'ArDrive-CLI' },
								{ name: 'App-Version', value: '1.2.0' },
								{ name: 'ArFS', value: '0.15' },
								{ name: 'Content-Type', value: 'application/json' },
								{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
								{ name: 'Entity-Type', value: 'file' },
								{ name: 'Unix-Time', value: '1639073846' },
								{ name: 'Parent-Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
								{ name: 'File-Id', value: fileId2 }
							],
							owner: { address: 'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI' }
						}
					}
				],
				pageInfo: {
					hasNextPage: false
				}
			};

			gqlRequestStub.onFirstCall().resolves(mockGQLResponse1);
			gqlRequestStub.onSecondCall().resolves(mockGQLResponse2);

			const folderIds = [EID('6c312b3e-4778-4a18-8243-f2b346f5e7cb')];
			const owner = ADDR('vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI');
			const driveId = EID('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');

			// Add stub for getDataForTxID
			const stubFileGetDataResult = Buffer.from(
				JSON.stringify({
					name: '2',
					size: 2048,
					lastModifiedDate: 1639073634269,
					dataTxId: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c',
					dataContentType: 'unknown'
				})
			);

			ArFSPublicFileBuilderStub.withArgs(stubTxID).resolves(stubFileGetDataResult);
			ArFSPublicFileBuilderStub.withArgs(stubTxIDAlt).resolves(stubFileGetDataResult);

			const files = await dao.getPublicFilesWithParentFolderIds(folderIds, owner, driveId, true);

			expect(files).to.have.lengthOf(2);
			expect(`${files[0].fileId}`).to.equal(fileId1);
			expect(`${files[1].fileId}`).to.equal(fileId2);
			expect(gqlRequestStub.callCount).to.equal(2);
		});

		it('skips invalid files and continues processing', async () => {
			const fileId1 = '9f7038c7-26bd-4856-a843-8de24b828d4e';
			const fileId2 = '1f7038c7-26bd-4856-a843-8de24b828d4e';
			const fileId3 = '2f7038c7-26bd-4856-a843-8de24b828d4e';

			const mockGQLResponse = {
				edges: [
					{
						cursor: 'cursor1',
						node: {
							id: `${stubTxID}`,
							tags: [
								{ name: 'App-Name', value: 'ArDrive-CLI' },
								{ name: 'App-Version', value: '1.2.0' },
								{ name: 'ArFS', value: '0.15' },
								{ name: 'Content-Type', value: 'application/json' },
								{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
								{ name: 'Entity-Type', value: 'file' },
								{ name: 'Unix-Time', value: '1639073846' },
								{ name: 'Parent-Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
								{ name: 'File-Id', value: fileId1 }
							],
							owner: { address: 'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI' }
						}
					},
					{
						cursor: 'cursor2',
						node: {
							id: `${stubTxIDAlt}`,
							tags: [
								{ name: 'App-Name', value: 'ArDrive-CLI' },
								{ name: 'App-Version', value: '1.2.0' },
								{ name: 'ArFS', value: '0.15' },
								{ name: 'Content-Type', value: 'application/json' },
								{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
								{ name: 'Entity-Type', value: 'file' },
								{ name: 'Unix-Time', value: '1639073846' },
								{ name: 'Parent-Folder-Id', value: '1c312b3e-4778-4a18-8243-f2b346f5e7cb' },
								{ name: 'File-Id', value: fileId2 }
							],
							owner: { address: 'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI' }
						}
					},
					{
						cursor: 'cursor3',
						node: {
							id: `${stubTxIDAltTwo}`,
							tags: [
								{ name: 'App-Name', value: 'ArDrive-CLI' },
								{ name: 'App-Version', value: '1.2.0' },
								{ name: 'ArFS', value: '0.15' },
								{ name: 'Content-Type', value: 'application/json' },
								{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
								{ name: 'Entity-Type', value: 'file' },
								{ name: 'Unix-Time', value: '1639073846' },
								{ name: 'Parent-Folder-Id', value: '1c312b3e-4778-4a18-8243-f2b346f5e7cb' },
								{ name: 'File-Id', value: fileId3 }
							],
							owner: { address: 'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI' }
						}
					}
				],
				pageInfo: {
					hasNextPage: false
				}
			};
			gqlRequestStub.resolves(mockGQLResponse);
			// Mock the getDataForTxID method to return valid metadata for the second file
			const stubFileGetDataResultValid1 = Buffer.from(
				JSON.stringify({
					name: '2',
					size: 2048,
					lastModifiedDate: 1639073634269,
					dataTxId: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c',
					dataContentType: 'application/json'
				})
			);
			// Invalid file metadata missing dataContentType
			const stubFileGetDataResultWithEmptyContentType = Buffer.from(
				JSON.stringify({
					name: '2',
					size: 2048,
					lastModifiedDate: 1639073634269,
					dataTxId: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c',
					dataContentType: ''
				})
			);
			// Valid file metadata
			const stubFileGetDataResultValid2 = Buffer.from(
				JSON.stringify({
					name: '2',
					size: 2048,
					lastModifiedDate: 1639073634269,
					dataTxId: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c',
					dataContentType: 'text/plain'
				})
			);

			// Valid file metadata
			ArFSPublicFileBuilderStub.withArgs(stubTxID).resolves(stubFileGetDataResultValid1);
			// Invalid file metadata missing dataContentType
			ArFSPublicFileBuilderStub.withArgs(stubTxIDAlt).resolves(stubFileGetDataResultWithEmptyContentType);
			// Valid file metadata
			ArFSPublicFileBuilderStub.withArgs(stubTxIDAltTwo).resolves(stubFileGetDataResultValid2);

			const folderIds = [EID('6c312b3e-4778-4a18-8243-f2b346f5e7cb')];
			const owner = ADDR('vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI');
			const driveId = EID('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');

			const files = await dao.getPublicFilesWithParentFolderIds(folderIds, owner, driveId, true);

			// Verify that the invalid file was skipped
			expect(files).to.have.lengthOf(2);
			expect(`${files[0].fileId}`).to.equal(fileId1);
			expect(`${files[1].fileId}`).to.equal(fileId3);
		});
	});
});
