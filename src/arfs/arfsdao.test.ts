/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Arweave from 'arweave';
import {
	getStubDriveKey,
	stubEntityID,
	stubArweaveAddress,
	stubPrivateDrive,
	stubPrivateFile,
	stubPrivateFolder,
	stubFolderUploadStats,
	stubFileUploadStats,
	stubCommunityTipSettings,
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
	stubTxID,
	stubSmallFileToUpload,
	stubSignedTransaction
} from '../../tests/stubs';
import { DriveKey, FeeMultiple, FileID, FileKey, FolderID, W } from '../types';
import { readJWKFile, Utf8ArrayToStr } from '../utils/common';
import {
	ArFSCache,
	ArFSDAO,
	ArFSPrivateDriveCacheKey,
	ArFSPrivateFileCacheKey,
	ArFSPrivateFolderCacheKey
} from './arfsdao';
import { ArFSEntityCache } from './arfs_entity_cache';
import { ArFSPrivateDrive, ArFSPrivateFile, ArFSPrivateFolder } from './arfs_entities';
import { ArFSPublicFolderCacheKey, defaultArFSAnonymousCache } from './arfsdao_anonymous';
import { stub } from 'sinon';
import { expect } from 'chai';
import { expectAsyncErrorThrow, getDecodedTags } from '../../tests/test_helpers';
import { deriveFileKey, driveDecrypt, fileDecrypt } from '../utils/crypto';
import { DataItem } from '@dha-team/arbundles';
import { ArFSTagSettings } from './arfs_tag_settings';
import { BundleResult, FileResult, FolderResult } from './arfs_entity_result_factory';
import { NameConflictInfo } from '../utils/mapper_functions';
import { emptyV2TxPlans } from '../types/upload_planner_types';
import { GatewayAPI } from '../utils/gateway_api';
import Transaction from 'arweave/node/lib/transaction';

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
	const privateConflictCache = new ArFSEntityCache<ArFSPrivateFolderCacheKey, NameConflictInfo>(10);
	const privateFileCache = new ArFSEntityCache<ArFSPrivateFileCacheKey, ArFSPrivateFile>(10);
	const publicConflictCache = new ArFSEntityCache<ArFSPublicFolderCacheKey, NameConflictInfo>(10);

	const fakeGatewayApi = new GatewayAPI({ gatewayUrl: new URL('http://test.net:1337') });

	let stubDriveKey: DriveKey;

	const arFSTagSettings = new ArFSTagSettings({ appName: 'ArFSDAO-Test', appVersion: '1.0' });

	beforeEach(async () => {
		// Start each test with a newly wrapped file
		caches = {
			...defaultArFSAnonymousCache,
			privateDriveCache,
			privateFolderCache,
			privateFileCache,
			privateConflictCache,
			publicConflictCache
		};
		arfsDao = new ArFSDAO(
			wallet,
			fakeArweave,
			true,
			'ArFSDAO-Test',
			'1.0',
			arFSTagSettings,
			caches,
			fakeGatewayApi
		);
		stubDriveKey = await getStubDriveKey();
	});

	// TODO: Move this test to the TxPreparer and TagAssembler classes when fully deprecated. Keeping here for backwards compatibility
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
			const stubbedKey = await getStubDriveKey();
			const decryptedBuffer: Buffer = await driveDecrypt(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				stubbedKey,
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
			const stubbedKey = await getStubDriveKey();
			const decryptedBuffer: Buffer = await fileDecrypt(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				stubbedKey,
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
			const stubbedKey = await getStubDriveKey();
			const fileKey: FileKey = await deriveFileKey(`${stubEntityID}`, stubbedKey);
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

		// TODO: Move this test to TagAssembler class, where we test this against the `customTags` on the tag settings
		it.skip('throws an error error if provided otherTags collide with protected tags from an ArFS object prototypes', async () => {
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

	// TODO: Move this test to the TxPreparer and TagAssembler classes when fully deprecated. Keeping here for backwards compatibility
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
	});

	// TODO: Move this test to the TxPreparer and TagAssembler classes when fully deprecated. Keeping here for backwards compatibility
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

		// disabled: upgrading to @dha-team/arbundles version of createData now causes an
		// exception to be thrown for tag size being too large prior to running the test.
		// it('throws an error when bundle cannot be verified', async () => {
		// 	const signer = new ArweaveSigner((wallet as JWKWallet).getPrivateKey());

		// 	// Create data item with a tag that exceeds ANS 104 Limits
		// 	const dataItemWithHugeTagValue = createData(
		// 		stubPublicFileMetaDataTx.objectData.asTransactionData(),
		// 		signer,
		// 		{
		// 			tags: [{ name: stub3073CharString, value: stub3073CharString }]
		// 		}
		// 	);
		// 	await dataItemWithHugeTagValue.sign(signer);

		// 	await expectAsyncErrorThrow({
		// 		promiseToError: arfsDao.prepareArFSObjectBundle({
		// 			dataItems: [dataItemWithHugeTagValue],
		// 			rewardSettings: { reward: W(10) }
		// 		}),
		// 		errorMessage: 'Bundle format could not be verified!'
		// 	});
		// });
	});

	describe('caching behaviors of', () => {
		describe('getPrivateDrive function', () => {
			it('returns a drive for a specified drive ID and owner from cache when cached entry is available', async () => {
				const cachedDrive = await stubPrivateDrive();
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
				const cachedFolder = await stubPrivateFolder({});
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
				const cachedFile = await stubPrivateFile({});
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
		it('returns the expected result for an upload plan with a single file as v2 transactions', async () => {
			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileAndMetaDataPlans: [
						{
							uploadStats: stubFileUploadStats(),
							dataTxRewardSettings: { reward: W(20) },
							metaDataRewardSettings: { reward: W(5) },
							communityTipSettings: stubCommunityTipSettings
						}
					]
				}
			});

			expect(fileResults.length).to.equal(1);
			expect(bundleResults.length).to.equal(0);
			expect(folderResults.length).to.equal(0);

			assertFileResult(fileResults[0], 20, 5);
		});

		it('returns the expected result for an upload plan with a private file as v2 transactions', async () => {
			// Use an expected id so we can expect an exact file key
			const fileWithExistingId = stubFileUploadStats();
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			fileWithExistingId.wrappedEntity.existingId = stubEntityID;

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileAndMetaDataPlans: [
						{
							uploadStats: { ...fileWithExistingId, driveKey: await getStubDriveKey() },
							dataTxRewardSettings: { reward: W(12) },
							metaDataRewardSettings: { reward: W(4) },
							communityTipSettings: stubCommunityTipSettings
						}
					]
				}
			});

			expect(fileResults.length).to.equal(1);
			expect(bundleResults.length).to.equal(0);
			expect(folderResults.length).to.equal(0);

			assertFileResult(fileResults[0], 12, 4, true, stubEntityID);
		});

		it('returns the expected result for an upload plan with a private folder as v2 transactions', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					folderMetaDataPlans: [
						{
							uploadStats: { ...stubFolderUploadStats(), driveKey: await getStubDriveKey() },
							metaDataRewardSettings: { reward: W(2) }
						}
					]
				}
			});

			expect(fileResults.length).to.equal(0);
			expect(bundleResults.length).to.equal(0);
			expect(folderResults.length).to.equal(1);

			assertFolderResult(folderResults[0], 2, true);
		});

		it('returns the expected result for an upload plan with a public folder that has an expected folder id sent as a v2 transaction', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const folderWithExpectedId = stubFolderUploadStats();
			folderWithExpectedId.wrappedEntity.existingId = stubEntityID;

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					folderMetaDataPlans: [
						{
							uploadStats: folderWithExpectedId,
							metaDataRewardSettings: { reward: W(8) }
						}
					]
				}
			});

			expect(fileResults.length).to.equal(0);
			expect(bundleResults.length).to.equal(0);
			expect(folderResults.length).to.equal(1);

			assertFolderResult(folderResults[0], 8, false, stubEntityID);
		});

		it('returns the expected result for an upload plan with a private folder that has an expected folder id sent as a v2 transaction', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const folderWithExpectedId = stubFolderUploadStats();
			folderWithExpectedId.wrappedEntity.existingId = stubEntityID;

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [],
				v2TxPlans: {
					...emptyV2TxPlans,
					folderMetaDataPlans: [
						{
							uploadStats: { ...folderWithExpectedId, driveKey: await getStubDriveKey() },
							metaDataRewardSettings: { reward: W(13) }
						}
					]
				}
			});

			expect(fileResults.length).to.equal(0);
			expect(bundleResults.length).to.equal(0);
			expect(folderResults.length).to.equal(1);

			assertFolderResult(folderResults[0], 13, true, stubEntityID);
		});

		it('returns the expected result for an upload plan with a folder and a file as v2 transactions', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [],
				v2TxPlans: {
					fileDataOnlyPlans: [],
					folderMetaDataPlans: [
						{
							uploadStats: stubFolderUploadStats(),
							metaDataRewardSettings: { reward: W(5) }
						}
					],
					fileAndMetaDataPlans: [
						{
							uploadStats: stubFileUploadStats(),
							metaDataRewardSettings: { reward: W(10) },
							dataTxRewardSettings: { reward: W(50) },
							communityTipSettings: stubCommunityTipSettings
						}
					]
				}
			});

			expect(fileResults.length).to.equal(1);
			expect(bundleResults.length).to.equal(0);
			expect(folderResults.length).to.equal(1);

			assertFileResult(fileResults[0], 50, 10);
			assertFolderResult(folderResults[0], 5);
		});

		it('returns the expected result for an upload plan with a single file as a bundled transaction', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [
					{
						bundleRewardSettings: { reward: W(20) },
						metaDataDataItems: [],
						uploadStats: [stubFileUploadStats()],
						communityTipSettings: stubCommunityTipSettings
					}
				],
				v2TxPlans: emptyV2TxPlans
			});

			expect(fileResults.length).to.equal(1);
			expect(bundleResults.length).to.equal(1);
			expect(folderResults.length).to.equal(0);

			assertBundleResult(bundleResults[0], 20, true);
			assertFileResult(fileResults[0]);
		});

		it('returns the expected result for an upload plan with a two folders as a bundled transaction', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [
					{
						bundleRewardSettings: { reward: W(10) },
						metaDataDataItems: [],
						uploadStats: [stubFolderUploadStats(), stubFolderUploadStats()]
					}
				],
				v2TxPlans: emptyV2TxPlans
			});

			expect(fileResults.length).to.equal(0);
			expect(bundleResults.length).to.equal(1);
			expect(folderResults.length).to.equal(2);

			assertBundleResult(bundleResults[0], 10, false);

			for (const res of folderResults) {
				assertFolderResult(res);
			}
		});

		it('returns the expected result for an upload plan with a folder and a file as a bundled transaction', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [
					{
						bundleRewardSettings: { reward: W(100) },
						metaDataDataItems: [],
						uploadStats: [stubFolderUploadStats(), stubFileUploadStats()],
						communityTipSettings: stubCommunityTipSettings
					}
				],
				v2TxPlans: emptyV2TxPlans
			});

			expect(bundleResults.length).to.equal(1);
			expect(fileResults.length).to.equal(1);
			expect(folderResults.length).to.equal(1);

			assertBundleResult(bundleResults[0], 100, true);
			assertFileResult(fileResults[0]);
			assertFolderResult(folderResults[0]);
		});

		it('returns the expected result for an upload plan with many files and folders sent as multiple bundled transactions', async () => {
			stub(arfsDao, 'assertDrivePrivacy').resolves();

			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [
					{
						bundleRewardSettings: { reward: W(500) },
						metaDataDataItems: [],
						uploadStats: [
							// 1 Folder and 2 Files
							stubFolderUploadStats(),
							stubFileUploadStats(),
							stubFileUploadStats()
						],
						communityTipSettings: stubCommunityTipSettings
					},
					{
						bundleRewardSettings: { reward: W(2000) },
						metaDataDataItems: [],
						uploadStats: [
							// 4 Files
							stubFileUploadStats(),
							stubFileUploadStats(),
							stubFileUploadStats(),
							stubFileUploadStats()
						],
						communityTipSettings: stubCommunityTipSettings
					},
					{
						bundleRewardSettings: { reward: W(200) },
						metaDataDataItems: [],
						uploadStats: [
							// 3 Folders
							stubFolderUploadStats(),
							stubFolderUploadStats(),
							stubFolderUploadStats()
						]
					}
				],
				v2TxPlans: emptyV2TxPlans
			});

			expect(bundleResults.length).to.equal(3);
			expect(fileResults.length).to.equal(6);
			expect(folderResults.length).to.equal(4);

			assertBundleResult(bundleResults[0], 500, true);
			assertBundleResult(bundleResults[1], 2000, true);
			assertBundleResult(bundleResults[2], 200, false);

			for (const res of fileResults) {
				assertFileResult(res);
			}
			for (const res of folderResults) {
				assertFolderResult(res);
			}
		});

		it('returns the expected result for an upload plan with many files and folders split into both a bundled transaction and v2 transactions', async () => {
			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [
					{
						bundleRewardSettings: { reward: W(1337) },
						metaDataDataItems: [],
						uploadStats: [
							stubFileUploadStats(),
							stubFileUploadStats(),
							stubFileUploadStats(),
							stubFolderUploadStats()
						],
						communityTipSettings: stubCommunityTipSettings
					}
				],
				v2TxPlans: {
					fileDataOnlyPlans: [],
					fileAndMetaDataPlans: [
						{
							uploadStats: stubFileUploadStats(),
							dataTxRewardSettings: { reward: W(20) },
							metaDataRewardSettings: { reward: W(5) },
							communityTipSettings: stubCommunityTipSettings
						}
					],
					folderMetaDataPlans: [
						{
							uploadStats: stubFolderUploadStats(),
							metaDataRewardSettings: { reward: W(2) }
						}
					]
				}
			});

			expect(bundleResults.length).to.equal(1);
			expect(fileResults.length).to.equal(4);
			expect(folderResults.length).to.equal(2);

			assertBundleResult(bundleResults[0], 1337, true);

			// Expect first file to be the v2 tx
			assertFileResult(fileResults[0], 20, 5);

			// Others files are from bundle results with no rewards of their own
			assertFileResult(fileResults[1]);
			assertFileResult(fileResults[2]);
			assertFileResult(fileResults[3]);

			// Expect first folder to be the v2 tx with a reward
			assertFolderResult(folderResults[0], 2);

			// Expect other folder from bundle results with no reward
			assertFolderResult(folderResults[1]);
		});

		it('returns the expected results for an upload plan that has 2 over-sized planned files with metaDataBundleIndex', async () => {
			const { fileResults, bundleResults, folderResults } = await arfsDao.uploadAllEntities({
				bundlePlans: [
					{
						bundleRewardSettings: { reward: W(420) },
						metaDataDataItems: [],
						uploadStats: []
					}
				],
				v2TxPlans: {
					...emptyV2TxPlans,
					fileDataOnlyPlans: [
						{
							uploadStats: stubFileUploadStats(),
							dataTxRewardSettings: { reward: W(59) },
							communityTipSettings: stubCommunityTipSettings,
							metaDataBundleIndex: 0
						},
						{
							uploadStats: stubFileUploadStats(),
							dataTxRewardSettings: { reward: W(42) },
							communityTipSettings: stubCommunityTipSettings,
							metaDataBundleIndex: 0
						}
					]
				}
			});

			expect(bundleResults.length).to.equal(1);
			expect(fileResults.length).to.equal(2);
			expect(folderResults.length).to.equal(0);

			assertBundleResult(bundleResults[0], 420, false);

			assertFileResult(fileResults[0], 59);
			assertFileResult(fileResults[1], 42);
		});

		it('throws an error if a provided bundle plan has only a single folder entity', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arfsDao.uploadAllEntities({
					bundlePlans: [
						{
							bundleRewardSettings: { reward: W(20) },
							metaDataDataItems: [],
							uploadStats: [stubFolderUploadStats()]
						}
					],
					v2TxPlans: emptyV2TxPlans
				}),
				errorMessage: 'Invalid bundle plan, a single metadata transaction can not be bundled alone!'
			});
		});
	});

	describe('retryV2ArFSPublicFileTransaction public method', () => {
		let stubTx: Transaction;
		before(async () => {
			stubTx = await stubSignedTransaction();
		});

		beforeEach(() => {
			stub(fakeGatewayApi, 'getTransaction').resolves(stubTx);
			stub(arfsDao, 'getDriveIDForEntityId').resolves(stubEntityID);
		});

		it('returns the expected result when a createMetaDataPlan exists', async () => {
			// prettier-ignore
			const { communityTipSettings, fileDataReward, newMetaDataInfo } =
				await arfsDao.retryV2ArFSPublicFileTransaction({
					wrappedFile: stubSmallFileToUpload('Retry Test File'),
					arFSDataTxId: stubTxID,
					createMetaDataPlan: {
						destinationFolderId: stubEntityID,
						rewardSettings: { reward: W(10) }
					}
				});

			const { communityTipTarget, communityWinstonTip } = communityTipSettings;

			expect(`${communityTipTarget}`).to.equal(`${stubArweaveAddress()}`);
			expect(+communityWinstonTip).to.equal(5);
			expect(+fileDataReward).to.equal(10);

			const { fileId, fileMetaDataReward, metaDataTxId } = newMetaDataInfo!;

			expect(`${fileId}`).to.match(entityIdRegex);
			expect(+fileMetaDataReward).to.equal(10);
			expect(`${metaDataTxId}`).to.match(txIdRegex);
		});

		it('returns the expected result when a createMetaDataPlan exists and an existing file ID is provided', async () => {
			// prettier-ignore
			const { communityTipSettings, fileDataReward, newMetaDataInfo } =
				await arfsDao.retryV2ArFSPublicFileTransaction({
					wrappedFile: stubSmallFileToUpload('Retry Test File'),
					arFSDataTxId: stubTxID,
					createMetaDataPlan: {
						destinationFolderId: stubEntityID,
						rewardSettings: { reward: W(10) },
						fileId: stubEntityID
					}
				});

			const { communityTipTarget, communityWinstonTip } = communityTipSettings;

			expect(`${communityTipTarget}`).to.equal(`${stubArweaveAddress()}`);
			expect(+communityWinstonTip).to.equal(5);
			expect(+fileDataReward).to.equal(10);

			const { fileId, fileMetaDataReward, metaDataTxId } = newMetaDataInfo!;

			expect(`${fileId}`).to.equal(`${stubEntityID}`);
			expect(+fileMetaDataReward).to.equal(10);
			expect(`${metaDataTxId}`).to.match(txIdRegex);
		});

		it('returns the expected result when a createMetaDataPlan does not exist', async () => {
			// prettier-ignore
			const { communityTipSettings, fileDataReward, newMetaDataInfo } =
				await arfsDao.retryV2ArFSPublicFileTransaction({
					wrappedFile: stubSmallFileToUpload('Retry Test File'),
					arFSDataTxId: stubTxID,
				});

			const { communityTipTarget, communityWinstonTip } = communityTipSettings;

			expect(`${communityTipTarget}`).to.equal(`${stubArweaveAddress()}`);
			expect(+communityWinstonTip).to.equal(5);
			expect(+fileDataReward).to.equal(10);

			expect(newMetaDataInfo).to.be.undefined;
		});
	});
});

const entityIdRegex = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
const txIdRegex = /^(\w|-){43}$/;

function assertFileResult(
	{
		fileDataTxId,
		entityId,
		metaDataTxId,
		communityTipSettings,
		fileDataReward,
		fileMetaDataReward,
		fileKey
	}: FileResult,
	fileReward?: number,
	metaDataReward?: number,
	expectFileKey = false,
	expectedFileId?: FileID
): void {
	expect(fileDataTxId).to.match(txIdRegex);
	expect(metaDataTxId).to.match(txIdRegex);
	expect(entityId).to.match(entityIdRegex);

	if (expectedFileId) {
		expect(`${entityId}`).to.equal(`${expectedFileId}`);
	}

	if (fileReward) {
		expect(+fileDataReward!).to.equal(fileReward);
		expect(communityTipSettings).to.deep.equal(stubCommunityTipSettings);
	} else {
		expect(fileDataReward).to.be.undefined;
		expect(communityTipSettings).to.be.undefined;
	}

	if (metaDataReward) {
		expect(+fileMetaDataReward!).to.equal(metaDataReward);
	} else {
		expect(fileMetaDataReward).to.be.undefined;
	}

	if (expectFileKey) {
		// Expected file key of stubDriveKey + stubEntityId
		expect(fileKey?.toString()).to.equal('UYCAFLlG4DuYgfOIh+qtEReZdQxWiznwekDa2ulSRd4');
	} else {
		expect(fileKey).to.be.undefined;
	}
}

function assertFolderResult(
	{ folderMetaDataReward, entityId, folderTxId, driveKey }: FolderResult,
	folderReward?: number,
	expectDriveKey = false,
	expectedFolderId?: FolderID
): void {
	expect(folderTxId).to.match(txIdRegex);
	expect(entityId).to.match(entityIdRegex);

	if (expectedFolderId) {
		expect(`${entityId}`).to.equal(`${expectedFolderId}`);
	}

	if (folderReward) {
		expect(+folderMetaDataReward!).to.equal(folderReward);
	} else {
		expect(folderMetaDataReward).to.be.undefined;
	}

	if (expectDriveKey) {
		// Output of stubDriveKey
		expect(driveKey?.toString()).to.equal('nxTl2ki5hWjyYE0SjOg2FV3PE7EBKMe9E6kD8uOvm6w');
	} else {
		expect(driveKey).to.be.undefined;
	}
}

function assertBundleResult(
	{ bundleReward, bundleTxId, communityTipSettings }: BundleResult,
	expectedReward: number,
	expectTip?: boolean
): void {
	expect(bundleTxId).to.match(txIdRegex);
	expect(+bundleReward!).to.equal(expectedReward);

	if (expectTip) {
		expect(communityTipSettings).to.deep.equal(stubCommunityTipSettings);
	} else {
		expect(communityTipSettings).to.be.undefined;
	}
}
