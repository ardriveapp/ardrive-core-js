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
	stubRootFolderMetaData
} from '../../tests/stubs';
import { FeeMultiple, FileKey, W } from '../types';
import { readJWKFile, Utf8ArrayToStr } from '../utils/common';
import { ArFSDAO } from './arfsdao';

import { expect } from 'chai';
import { expectAsyncErrorThrow, getDecodedTags } from '../../tests/test_helpers';
import { deriveFileKey, driveDecrypt, fileDecrypt } from '../utils/crypto';
import { DataItem } from 'arbundles';

describe('The ArFSDAO class', async () => {
	const wallet = readJWKFile('./test_wallet.json');

	const fakeArweave = Arweave.init({
		host: 'localhost',
		port: 443,
		protocol: 'https',
		timeout: 600000
	});

	const arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'ArFSDAO-Test', '1.0');

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

			// Assert that the data JSON of the metadata trx is ArFS compliant
			const trxData = JSON.parse(new TextDecoder().decode(transaction.data));
			expect(trxData).to.deep.equal({
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

			// Assert that the data JSON of the metadata trx is ArFS compliant
			const trxData = JSON.parse(new TextDecoder().decode(transaction.data));
			expect(trxData).to.deep.equal({
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

			// Assert that the data JSON of the metadata trx is ArFS compliant
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

			// Assert that the data JSON of the metadata trx is ArFS compliant
			const trxData = JSON.parse(new TextDecoder().decode(transaction.data));
			expect(trxData).to.deep.equal({
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

			// Assert that the data JSON of the metadata trx is ArFS compliant
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
});
