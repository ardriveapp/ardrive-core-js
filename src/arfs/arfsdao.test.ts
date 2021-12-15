import Arweave from 'arweave';
import { stubArweaveAddress, stubEntityID, stubPrivateDrive } from '../../tests/stubs';
import {
	ArweaveAddress,
	ByteCount,
	DriveID,
	DriveKey,
	EntityID,
	FeeMultiple,
	stubTransactionID,
	UnixTime,
	W
} from '../types';
import { readJWKFile } from '../utils/common';
import {
	ArFSCache,
	ArFSDAO,
	ArFSPrivateDriveCacheKey,
	ArFSPrivateFileCacheKey,
	ArFSPrivateFolderCacheKey
} from './arfsdao';
import { ArFSPublicFileMetaDataPrototype } from './arfs_prototypes';
import { ArFSPublicFileMetadataTransactionData } from './arfs_trx_data_types';
import { expect } from 'chai';
import { Tag } from 'arweave/node/lib/transaction';
import { ArFSEntityCache } from './arfs_entity_cache';
import {
	ArFSPrivateDrive,
	ArFSPrivateFile,
	ArFSPrivateFolder,
	ArFSPublicDrive,
	ArFSPublicFile,
	ArFSPublicFolder
} from './arfs_entities';
import { ArFSPublicDriveCacheKey, ArFSPublicFileCacheKey, ArFSPublicFolderCacheKey } from './arfsdao_anonymous';
import { stub } from 'sinon';
import { deriveDriveKey, JWKWallet } from '../exports';

const wallet = readJWKFile('./test_wallet.json');
const getStubDriveKey = async (): Promise<DriveKey> => {
	return deriveDriveKey('stubPassword', `${stubEntityID}`, JSON.stringify((wallet as JWKWallet).getPrivateKey()));
};

describe('The ArFSDAO class', () => {
	const wallet = readJWKFile('./test_wallet.json');
	const fakeArweave = Arweave.init({
		host: 'localhost',
		port: 443,
		protocol: 'https',
		timeout: 600000
	});

	let caches: ArFSCache;
	const ownerCache = new ArFSEntityCache<DriveID, ArweaveAddress>(10);
	const driveIdCache = new ArFSEntityCache<EntityID, DriveID>(10);
	const publicDriveCache = new ArFSEntityCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>(10);
	const publicFolderCache = new ArFSEntityCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>(10);
	const publicFileCache = new ArFSEntityCache<ArFSPublicFileCacheKey, ArFSPublicFile>(10);
	const privateDriveCache = new ArFSEntityCache<ArFSPrivateDriveCacheKey, ArFSPrivateDrive>(10);
	const privateFolderCache = new ArFSEntityCache<ArFSPrivateFolderCacheKey, ArFSPrivateFolder>(10);
	const privateFileCache = new ArFSEntityCache<ArFSPrivateFileCacheKey, ArFSPrivateFile>(10);
	let arfsDao: ArFSDAO;
	let stubDriveKey: DriveKey;

	const stubFileMetaDataTrx = new ArFSPublicFileMetaDataPrototype(
		new ArFSPublicFileMetadataTransactionData(
			'Test Metadata',
			new ByteCount(10),
			new UnixTime(123456789),
			stubTransactionID,
			'text/plain'
		),
		stubEntityID,
		stubEntityID,
		stubEntityID
	);

	beforeEach(async () => {
		// Start each test with a newly wrapped file
		caches = {
			ownerCache,
			driveIdCache,
			publicDriveCache,
			publicFolderCache,
			publicFileCache,
			privateDriveCache,
			privateFolderCache,
			privateFileCache
		};
		arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'ArFSDAO-Test', '1.0', caches);
		stubDriveKey = await getStubDriveKey();
	});

	describe('prepareObjectTransaction function', () => {
		// Helper function to grab the decoded gql tags off of a Transaction
		const getDecodedTagName = (tag: Tag) => tag.get('name', { decode: true, string: true });

		it('includes the base ArFS tags by default', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10) }
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.exist;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Name')).to.exist;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Version')).to.exist;
			expect(transaction.tags.length).to.equal(9);
		});

		it('includes the boost tag when boosted', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) }
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'Boost')).to.exist;
			expect(transaction.tags.length).to.equal(10);
		});

		it('excludes the boost tag when boosted and boost tag is excluded', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) },
				excludedTagNames: ['Boost']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'Boost')).to.be.undefined;
			expect(transaction.tags.length).to.equal(9);
		});

		it('excludes ArFS tag if its within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.be.undefined;
			expect(transaction.tags.length).to.equal(8);
		});

		it('can exclude multiple tags if provided within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS', 'App-Version', 'App-Name']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.be.undefined;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Name')).to.be.undefined;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Version')).to.be.undefined;
			expect(transaction.tags.length).to.equal(6);
		});
	});

	describe('caching behaviors of', () => {
		describe('getPrivateDrive function', () => {
			it('returns a drive for a specified drive ID and owner from cache when cached entry is available', async () => {
				const cachedDrive = stubPrivateDrive;
				const promise = Promise.resolve(cachedDrive);
				stub(privateDriveCache, 'get').returns(promise);
				expect(await arfsDao.getPrivateDrive(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
					cachedDrive
				);
			});

			// // TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the drive ID on a cache miss', async () => {
			// 	const cachedDrive = stubPrivateDrive;
			// 	const promise = Promise.resolve(cachedDrive);
			// 	stub(privateDriveCache, 'put').returns(promise);
			// 	expect(await arfsDao.getPrivateDrive(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
			// 		cachedDrive
			// 	);
			// });
		});

		// describe('getPublicFolder function', () => {
		// 	it('returns a drive ID for a specified folder ID from cache when cached entry is available', async () => {
		// 		const cachedFolder = stubPublicFolder({});
		// 		const promise = Promise.resolve(cachedFolder);
		// 		stub(publicFolderCache, 'get').returns(promise);
		// 		expect(await arfsDaoAnonymous.getPublicFolder(stubEntityID, stubArweaveAddress())).to.equal(
		// 			cachedFolder
		// 		);
		// 	});

		// 	// // TODO: Implement once ArweaveService is implemented
		// 	// it('returns the cached promise to fetch the drive ID on a cache miss', async () => {
		// 	// 	const cachedFolder = stubPublicFolder({});
		// 	// 	const promise = Promise.resolve(cachedFolder);
		// 	// 	stub(publicFolderCache, 'put').returns(promise);
		// 	// 	expect(await arfsDaoAnonymous.getPublicFolder(stubEntityID, stubArweaveAddress())).to.equal(cachedFolder);
		// 	// });
		// });

		// describe('getPublicFile function', () => {
		// 	it('returns a drive ID for a specified folder ID from cache when cached entry is available', async () => {
		// 		const cachedFile = stubPublicFile({});
		// 		const promise = Promise.resolve(cachedFile);
		// 		stub(publicFileCache, 'get').returns(promise);
		// 		expect(await arfsDaoAnonymous.getPublicFile(stubEntityID, stubArweaveAddress())).to.equal(cachedFile);
		// 	});

		// 	// // TODO: Implement once ArweaveService is implemented
		// 	// it('returns the cached promise to fetch the drive ID on a cache miss', async () => {
		// 	// 	const cachedFile = stubPublicFile({});
		// 	// 	const promise = Promise.resolve(cachedFile);
		// 	// 	stub(publicFileCache, 'put').returns(promise);
		// 	// 	expect(await arfsDaoAnonymous.getPublicFile(stubEntityID, stubArweaveAddress())).to.equal(cachedFile);
		// 	// });
		// });
	});
});
