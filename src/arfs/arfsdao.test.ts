import Arweave from 'arweave';
import {
	getStubDriveKey,
	stubEntityID,
	stubEntityIDAlt,
	stubEntityIDAltTwo,
	stubPrivateDriveMetaDataTx,
	stubPrivateFileDataTx,
	stubPrivateFileMetaDataTx,
	stubPrivateFolderMetaDataTx,
	stubPublicDriveMetaDataTx,
	stubPublicFileDataTx,
	stubPublicFileMetaDataTx,
	stubPublicFolderMetaDataTx,
	stubRootFolderMetaData,
	stubArweaveAddress,
	stubPrivateDrive,
	stubPrivateFile,
	stubPrivateFolder,
	newStubPlanFolderUploadStats,
	newStubPlanFileUploadStats
} from '../../tests/stubs';
import { DriveKey, FeeMultiple, FileKey, W } from '../types';
import { readJWKFile, Utf8ArrayToStr } from '../utils/common';
import {
	ArFSCache,
	ArFSDAO,
	ArFSPrivateDriveCacheKey,
	ArFSPrivateFileCacheKey,
	ArFSPrivateFolderCacheKey
} from './arfsdao';
// import { ArFSPublicFileMetaDataPrototype } from './arfs_prototypes';
// import { ArFSPublicFileMetadataTransactionData } from './arfs_tx_data_types';
import { ArFSEntityCache } from './arfs_entity_cache';
import { ArFSPrivateDrive, ArFSPrivateFile, ArFSPrivateFolder } from './arfs_entities';
import { defaultArFSAnonymousCache } from './arfsdao_anonymous';
import { stub } from 'sinon';
//import { deriveDriveKey, JWKWallet } from '../exports';
import { expect } from 'chai';
import { expectAsyncErrorThrow, getDecodedTags } from '../../tests/test_helpers';
import { deriveFileKey, driveDecrypt, fileDecrypt } from '../utils/crypto';
import { DataItem } from 'arbundles';
import { ArFSTagSettings } from './arfs_tag_settings';

// const wallet = readJWKFile('./test_wallet.json');
// const getStubDriveKey = async (): Promise<DriveKey> => {
// 	return deriveDriveKey('stubPassword', `${stubEntityID}`, JSON.stringify((wallet as JWKWallet).getPrivateKey()));
// };

describe('The ArFSDAO class', () => {
	const wallet = readJWKFile('./test_wallet.json');

	const fakeArweave = Arweave.init({
		host: 'localhost',
		port: 443,
		protocol: 'https',
		timeout: 600000
	});

	let arfsDao: ArFSDAO;
	let caches: ArFSCache;
	const privateDriveCache = new ArFSEntityCache<ArFSPrivateDriveCacheKey, ArFSPrivateDrive>(10);
	const privateFolderCache = new ArFSEntityCache<ArFSPrivateFolderCacheKey, ArFSPrivateFolder>(10);
	const privateFileCache = new ArFSEntityCache<ArFSPrivateFileCacheKey, ArFSPrivateFile>(10);

	let stubDriveKey: DriveKey;

	// const stubFileMetaDataTrx = new ArFSPublicFileMetaDataPrototype(
	// 	new ArFSPublicFileMetadataTransactionData(
	// 		'Test Metadata',
	// 		new ByteCount(10),
	// 		new UnixTime(123456789),
	// 		stubTransactionID,
	// 		'text/plain'
	// 	),
	// 	stubEntityID,
	// 	stubEntityID,
	// 	stubEntityID
	// );

	const arFSTagSettings = new ArFSTagSettings({ appName: 'ArFSDAO-Test', appVersion: '1.0' });

	beforeEach(async () => {
		// Start each test with a newly wrapped file
		caches = {
			...defaultArFSAnonymousCache,
			privateDriveCache,
			privateFolderCache,
			privateFileCache
		};
		arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'ArFSDAO-Test', '1.0', arFSTagSettings, caches);
		stubDriveKey = await getStubDriveKey();
	});

	describe('prepareObjectTransaction function', () => {
		it('produces an ArFS compliant public drive metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicDriveMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Public Drive Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/json');
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'Drive-Privacy')?.value).to.equal('public');

			expect(tags.length).to.equal(8);

			// Assert that the data JSON of the metadata tx is ArFS compliant
			const txData = JSON.parse(new TextDecoder().decode(transaction.data));
			expect(txData).to.deep.equal({
				name: 'Test Public Drive Metadata',
				rootFolderId: '00000000-0000-0000-0000-000000000000'
			});
		});

		it('produces an ArFS compliant private drive metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: await stubPrivateDriveMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Private Drive Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/octet-stream');
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'Drive-Privacy')?.value).to.equal('private');
			expect(tags.find((t) => t.name === 'Cipher')?.value).to.equal('AES256-GCM');
			expect(tags.find((t) => t.name === 'Cipher-IV')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Auth-Mode')?.value).to.equal('password');

			expect(tags.length).to.equal(11);

			const dataBuffer = Buffer.from(transaction.data);
			const decryptedBuffer: Buffer = await driveDecrypt(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				await getStubDriveKey(),
				dataBuffer
			);
			const decryptedString: string = await Utf8ArrayToStr(decryptedBuffer);
			const decryptedJSON = await JSON.parse(decryptedString);

			expect(decryptedJSON).to.deep.equal({
				name: 'Test Private Drive Metadata',
				rootFolderId: '00000000-0000-0000-0000-000000000000'
			});
		});

		it('produces an ArFS compliant public folder metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFolderMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Public Folder Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/json');
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'Folder-Id')?.value).to.equal(`${stubEntityIDAlt}`);
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')?.value).to.equal(`${stubEntityIDAltTwo}`);

			expect(tags.length).to.equal(9);

			// Assert that the data JSON of the metadata tx is ArFS compliant
			const txData = JSON.parse(new TextDecoder().decode(transaction.data));
			expect(txData).to.deep.equal({
				name: 'Test Public Folder Metadata'
			});
		});

		it('produces an ArFS compliant private folder metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: await stubPrivateFolderMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Private Folder Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/octet-stream');
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'Folder-Id')?.value).to.equal(`${stubEntityIDAlt}`);
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')?.value).to.equal(`${stubEntityIDAltTwo}`);
			expect(tags.find((t) => t.name === 'Cipher')?.value).to.equal('AES256-GCM');
			expect(tags.find((t) => t.name === 'Cipher-IV')?.value).to.exist;

			expect(tags.length).to.equal(11);

			const dataBuffer = Buffer.from(transaction.data);
			const decryptedBuffer: Buffer = await fileDecrypt(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				await getStubDriveKey(),
				dataBuffer
			);
			const decryptedString: string = await Utf8ArrayToStr(decryptedBuffer);
			const decryptedJSON = await JSON.parse(decryptedString);

			// Assert that the data JSON of the metadata tx is ArFS compliant
			expect(decryptedJSON).to.deep.equal({
				name: 'Test Private Folder Metadata'
			});
		});

		it('will produce an ArFS compliant root folder transaction without a parent folder id', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubRootFolderMetaData,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert tha parent folder id does not exist
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')?.value).to.be.undefined;
			expect(tags.length).to.equal(8);
		});

		it('produces an ArFS compliant public file metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Public File Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/json');
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'File-Id')?.value).to.equal(`${stubEntityIDAlt}`);
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')?.value).to.equal(`${stubEntityIDAltTwo}`);

			expect(tags.length).to.equal(9);

			// Assert that the data JSON of the metadata tx is ArFS compliant
			const txData = JSON.parse(new TextDecoder().decode(transaction.data));
			expect(txData).to.deep.equal({
				dataContentType: 'text/plain',
				dataTxId: '0000000000000000000000000000000000000000000',
				lastModifiedDate: 123456789,
				name: 'Test Public File Metadata',
				size: 10
			});
		});

		it('produces an ArFS compliant private file metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: await stubPrivateFileMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Private File Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/octet-stream');
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.exist;
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'File-Id')?.value).to.equal(`${stubEntityIDAlt}`);
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')?.value).to.equal(`${stubEntityIDAltTwo}`);
			expect(tags.find((t) => t.name === 'Cipher')?.value).to.equal('AES256-GCM');
			expect(tags.find((t) => t.name === 'Cipher-IV')?.value).to.exist;

			expect(tags.length).to.equal(11);

			const dataBuffer = Buffer.from(transaction.data);
			const fileKey: FileKey = await deriveFileKey(`${stubEntityID}`, await getStubDriveKey());
			const decryptedBuffer: Buffer = await fileDecrypt(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				fileKey,
				dataBuffer
			);
			const decryptedString: string = await Utf8ArrayToStr(decryptedBuffer);
			const decryptedJSON = await JSON.parse(decryptedString);

			// Assert that the data JSON of the metadata tx is ArFS compliant
			expect(decryptedJSON).to.deep.equal({
				dataContentType: 'text/plain',
				dataTxId: '0000000000000000000000000000000000000000000',
				lastModifiedDate: 123456789,
				name: 'Test Private File Metadata',
				size: 10
			});
		});

		it('produces an ArFS compliant public file data transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileDataTx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Public File Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/json');

			expect(tags.length).to.equal(3);
		});

		it('produces an ArFS compliant private file data transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: await stubPrivateFileDataTx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			const tags = getDecodedTags(transaction.tags);

			// Assert that tags are ArFS 0.11 compliant and include all ArFS Private File Metadata tags
			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'Content-Type')?.value).to.equal('application/octet-stream');
			expect(tags.find((t) => t.name === 'Cipher')?.value).to.equal('AES256-GCM');
			expect(tags.find((t) => t.name === 'Cipher-IV')?.value).to.exist;

			expect(tags.length).to.equal(5);
		});

		it('includes the base ArFS tags by default', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');

			expect(tags.length).to.equal(9);
		});

		it('includes the boost tag when boosted', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) }
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'Boost')?.value).to.equal('1.5');
			expect(tags.length).to.equal(10);
		});

		it('excludes the boost tag when boosted and boost tag is excluded', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) },
				excludedTagNames: ['Boost']
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'Boost')).to.be.undefined;
			expect(tags.length).to.equal(9);
		});

		it('excludes ArFS tag if its within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'ArFS')).to.be.undefined;
			expect(tags.length).to.equal(8);
		});

		it('can exclude multiple tags if provided within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS', 'App-Version', 'App-Name']
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'ArFS')).to.be.undefined;
			expect(tags.find((t) => t.name === 'App-Name')).to.be.undefined;
			expect(tags.find((t) => t.name === 'App-Version')).to.be.undefined;

			expect(tags.length).to.equal(6);
		});

		it('can exclude tags from an ArFS object prototypes', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['Drive-Id', 'Content-Type', 'Parent-Folder-Id']
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'Drive-Id')).to.be.undefined;
			expect(tags.find((t) => t.name === 'Content-Type')).to.be.undefined;
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')).to.be.undefined;

			expect(tags.length).to.equal(6);
		});

		it('throws an error error if provided otherTags collide with protected tags from an ArFS object prototypes', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arfsDao.prepareArFSObjectTransaction({
					objectMetaData: stubPublicFileMetaDataTx,
					rewardSettings: { reward: W(10) },
					otherTags: [{ name: 'Drive-Id', value: 'ultimate drive ID of awesome' }]
				}),
				errorMessage: 'Tag Drive-Id is protected and cannot be used in this context!'
			});
		});
	});

	describe('prepareDataItems function', () => {
		it('includes the base ArFS tags by default', async () => {
			const dataItem = await arfsDao.prepareArFSDataItem({
				objectMetaData: stubPublicFileMetaDataTx
			});
			const tags = dataItem.tags;

			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.equal('0.11');

			expect(tags.length).to.equal(9);
		});

		it('can exclude tags from data item', async () => {
			const dataItem = await arfsDao.prepareArFSDataItem({
				objectMetaData: stubPublicFileMetaDataTx,
				excludedTagNames: ['ArFS', 'App-Name']
			});
			const tags = dataItem.tags;

			expect(tags.find((t) => t.name === 'App-Name')?.value).to.not.exist;
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'ArFS')?.value).to.not.exist;

			expect(tags.length).to.equal(7);
		});
	});

	describe('prepareArFSObjectBundle function', async () => {
		let dataItems: DataItem[];

		beforeEach(async () => {
			// Start each test with fresh data items
			dataItems = [
				await arfsDao.prepareArFSDataItem({
					objectMetaData: stubPublicFileMetaDataTx
				}),
				await arfsDao.prepareArFSDataItem({
					objectMetaData: stubPublicFileDataTx
				})
			];
		});

		it('includes the base ArFS tags, excluding "ArFS" tag, and bundle format tags by default', async () => {
			const bundleTransaction = await arfsDao.prepareArFSObjectBundle({
				dataItems,
				rewardSettings: { reward: W(10) }
			});
			const tags = getDecodedTags(bundleTransaction.tags);

			expect(tags.find((t) => t.name === 'App-Name')?.value).to.equal('ArFSDAO-Test');
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'Bundle-Format')?.value).to.equal('binary');
			expect(tags.find((t) => t.name === 'Bundle-Version')?.value).to.equal('2.0.0');

			expect(tags.find((t) => t.name === 'ArFS')?.value).to.not.exist;

			expect(tags.length).to.equal(4);
		});

		it('can exclude tags from bundled transaction', async () => {
			const bundleTransaction = await arfsDao.prepareArFSObjectBundle({
				dataItems,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['Bundle-Format', 'App-Name']
			});
			const tags = getDecodedTags(bundleTransaction.tags);

			expect(tags.find((t) => t.name === 'App-Name')?.value).to.not.exist;
			expect(tags.find((t) => t.name === 'App-Version')?.value).to.equal('1.0');
			expect(tags.find((t) => t.name === 'Bundle-Format')?.value).to.not.exist;
			expect(tags.find((t) => t.name === 'Bundle-Version')?.value).to.equal('2.0.0');

			expect(tags.length).to.equal(2);
		});

		it('will include a boost tag and correctly multiply reward', async () => {
			const bundleTransaction = await arfsDao.prepareArFSObjectBundle({
				dataItems,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(2) }
			});
			const tags = getDecodedTags(bundleTransaction.tags);

			expect(tags.find((t) => t.name === 'Boost')?.value).to.equal('2');

			expect(tags.length).to.equal(5);

			expect(bundleTransaction.reward).to.equal('20');
		});

		it('throws an error when bundle cannot be verified', async () => {
			dataItems[0].id = 'fake ID so verify will return false';

			await expectAsyncErrorThrow({
				promiseToError: arfsDao.prepareArFSObjectBundle({
					dataItems,
					rewardSettings: { reward: W(10) }
				}),
				errorMessage: 'Bundle format could not be verified!'
			});
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

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the drive on a cache miss', async () => {
			// 	const cachedDrive = stubPrivateDrive;
			// 	const promise = Promise.resolve(cachedDrive);
			// 	stub(privateDriveCache, 'put').returns(promise);
			// 	expect(await arfsDao.getPrivateDrive(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
			// 		cachedDrive
			// 	);
			// });
		});

		describe('getPrivateFolder function', () => {
			it('returns a drive ID for a specified folder ID from cache when cached entry is available', async () => {
				const cachedFolder = stubPrivateFolder({});
				const promise = Promise.resolve(cachedFolder);
				stub(privateFolderCache, 'get').returns(promise);
				expect(await arfsDao.getPrivateFolder(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
					cachedFolder
				);
			});

			// TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the folder on a cache miss', async () => {
			// 	const cachedFolder = stubPrivateFolder({});
			// 	const promise = Promise.resolve(cachedFolder);
			// 	stub(privateFolderCache, 'put').returns(promise);
			// 	expect(await arfsDao.getPrivateFolder(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
			// 		cachedFolder
			// 	);
			// });
		});

		describe('getPrivateFile function', () => {
			it('returns a file for a specified file ID from cache when cached entry is available', async () => {
				const cachedFile = stubPrivateFile({});
				const promise = Promise.resolve(cachedFile);
				stub(privateFileCache, 'get').returns(promise);
				expect(await arfsDao.getPrivateFile(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
					cachedFile
				);
			});

			// // TODO: Implement once ArweaveService is implemented
			// it('returns the cached promise to fetch the file on a cache miss', async () => {
			// 	const cachedFile = stubPrivateFile({});
			// 	const promise = Promise.resolve(cachedFile);
			// 	stub(privateFileCache, 'put').returns(promise);
			// 	expect(await arfsDao.getPrivateFile(stubEntityID, stubDriveKey, stubArweaveAddress())).to.equal(
			// 		cachedFile
			// 	);
			// });
		});
	});

	describe('uploadAllEntities method', () => {
		it('returns the expected result for an upload plan with a single file as v2 transactions');
		it('returns the expected result for an upload plan with a bulk folder as v2 transactions');

		it('returns the expected result for an upload plan with a single file as a bundled transaction');
		it('returns the expected result for an upload plan with a bulk folder as a bundled transaction');

		it('throws an error if a provided v2 tx plan has a dataTxRewardSettings but no file entity to upload', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arfsDao.uploadAllEntities({
					bundlePlans: [],
					v2TxPlans: [
						{
							uploadStats: newStubPlanFolderUploadStats(),
							rewardSettings: {
								dataTxRewardSettings: { reward: W(5) },
								metaDataRewardSettings: { reward: W(1) }
							}
						}
					]
				}),
				errorMessage: 'Error: Invalid v2 tx plan, only files can have dataTxRewardSettings!'
			});
		});

		it(
			'returns the expected results for an upload plan that has 2 over-sized planned files with metaDataBundleIndex'
		);

		it('throws an error if a provided v2 tx plan has a file entity to upload, but no metaDataRewardSettings nor a metaDataBundleIndex', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arfsDao.uploadAllEntities({
					bundlePlans: [],
					v2TxPlans: [
						{
							uploadStats: newStubPlanFileUploadStats(),
							rewardSettings: { dataTxRewardSettings: { reward: W(5) } }
						}
					]
				}),
				errorMessage: 'Error: Invalid v2 tx plan, file upload must include a plan for the metadata!'
			});
		});

		it('throws an error if a provided v2 tx plan has a file entity that has no dataTxRewardSettings', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arfsDao.uploadAllEntities({
					bundlePlans: [],
					v2TxPlans: [
						{
							uploadStats: newStubPlanFileUploadStats(),
							rewardSettings: { metaDataRewardSettings: { reward: W(55) } }
						}
					]
				}),
				errorMessage: 'Error: Invalid v2 tx plan, file uploads must have file data reward settings!'
			});
		});
	});
});
