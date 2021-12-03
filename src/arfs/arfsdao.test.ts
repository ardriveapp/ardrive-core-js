import Arweave from 'arweave';
import { getStubDriveKey, stubEntityID, stubEntityIDAlt, stubEntityIDAltTwo } from '../../tests/stubs';
import { ByteCount, FeeMultiple, FileKey, GQLTagInterface, stubTransactionID, UnixTime, W } from '../types';
import { readJWKFile, Utf8ArrayToStr } from '../utils/common';
import { ArFSDAO } from './arfsdao';
import {
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPrivateFileDataPrototype,
	ArFSPrivateFileMetaDataPrototype,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPublicDriveMetaDataPrototype,
	ArFSPublicFileDataPrototype,
	ArFSPublicFileMetaDataPrototype,
	ArFSPublicFolderMetaDataPrototype
} from './arfs_prototypes';
import {
	ArFSPrivateDriveTransactionData,
	ArFSPrivateFileDataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPublicDriveTransactionData,
	ArFSPublicFileDataTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPublicFolderTransactionData
} from './arfs_trx_data_types';
import { expect } from 'chai';
import { Tag } from 'arweave/node/lib/transaction';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { readFileSync } from 'fs';
import { deriveFileKey, driveDecrypt, fileDecrypt } from '../utils/crypto';

describe('The ArFSDAO class', async () => {
	const wallet = readJWKFile('./test_wallet.json');

	const fakeArweave = Arweave.init({
		host: 'localhost',
		port: 443,
		protocol: 'https',
		timeout: 600000
	});

	const arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'ArFSDAO-Test', '1.0');

	const stubPublicFileMetaDataTrx = new ArFSPublicFileMetaDataPrototype(
		new ArFSPublicFileMetadataTransactionData(
			'Test Public File Metadata',
			new ByteCount(10),
			new UnixTime(123456789),
			stubTransactionID,
			'text/plain'
		),
		stubEntityID,
		stubEntityIDAlt,
		stubEntityIDAltTwo
	);

	const stubDriveKey = await getStubDriveKey();

	const stubPrivateFileMetaDataTrx = await (async () =>
		new ArFSPrivateFileMetaDataPrototype(
			await ArFSPrivateFileMetadataTransactionData.from(
				'Test Private File Metadata',
				new ByteCount(10),
				new UnixTime(123456789),
				stubTransactionID,
				'text/plain',
				stubEntityID,
				stubDriveKey
			),
			stubEntityID,
			stubEntityIDAlt,
			stubEntityIDAltTwo
		))();

	const stubPublicDriveMetaDataTrx = new ArFSPublicDriveMetaDataPrototype(
		new ArFSPublicDriveTransactionData('Test Public Drive Metadata', stubEntityID),
		stubEntityID
	);

	const stubPrivateDriveMetaDataTrx = await (async () =>
		new ArFSPrivateDriveMetaDataPrototype(
			stubEntityID,
			await ArFSPrivateDriveTransactionData.from('Test Private Drive Metadata', stubEntityID, stubDriveKey)
		))();

	const stubPublicFolderMetaDataTrx = new ArFSPublicFolderMetaDataPrototype(
		new ArFSPublicFolderTransactionData('Test Public Folder Metadata'),
		stubEntityID,
		stubEntityIDAlt,
		stubEntityIDAltTwo
	);

	const stubRootFolderMetaData = new ArFSPublicFolderMetaDataPrototype(
		new ArFSPublicFolderTransactionData('Test Root Folder Metadata'),
		stubEntityID,
		stubEntityIDAlt
	);

	const stubPrivateFolderMetaDataTrx = await (async () =>
		new ArFSPrivateFolderMetaDataPrototype(
			stubEntityID,
			stubEntityIDAlt,
			await ArFSPrivateFolderTransactionData.from('Test Private Folder Metadata', stubDriveKey),
			stubEntityIDAltTwo
		))();

	const stubPublicFileDataTrx = new ArFSPublicFileDataPrototype(
		new ArFSPublicFileDataTransactionData(readFileSync('./test_wallet.json')),
		'application/json'
	);

	const stubPrivateFileDataTrx = await (async () =>
		new ArFSPrivateFileDataPrototype(
			await ArFSPrivateFileDataTransactionData.from(
				readFileSync('./test_wallet.json'),
				stubEntityID,
				stubDriveKey
			)
		))();

	describe('prepareObjectTransaction function', () => {
		// Helper function to grab the decoded gql tags off of a Transaction
		const getDecodedTags = (tags: Tag[]): GQLTagInterface[] =>
			tags.map((tag) => ({
				name: tag.get('name', { decode: true, string: true }),
				value: tag.get('value', { decode: true, string: true })
			}));

		it('produces an ArFS compliant public drive metadata transaction', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicDriveMetaDataTrx,
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
				objectMetaData: stubPrivateDriveMetaDataTrx,
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
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				stubDriveKey,
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
				objectMetaData: stubPublicFolderMetaDataTrx,
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
				objectMetaData: stubPrivateFolderMetaDataTrx,
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
				tags.find((t) => t.name === 'Cipher-IV')!.value,
				stubDriveKey,
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
				objectMetaData: stubPublicFileMetaDataTrx,
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
				objectMetaData: stubPrivateFileMetaDataTrx,
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
			const fileKey: FileKey = await deriveFileKey(`${stubEntityID}`, stubDriveKey);
			const decryptedBuffer: Buffer = await fileDecrypt(
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
				objectMetaData: stubPublicFileDataTrx,
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
				objectMetaData: stubPrivateFileDataTrx,
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
				objectMetaData: stubPublicFileMetaDataTrx,
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
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) }
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'Boost')?.value).to.equal('1.5');
			expect(tags.length).to.equal(10);
		});

		it('excludes the boost tag when boosted and boost tag is excluded', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) },
				excludedTagNames: ['Boost']
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'Boost')).to.be.undefined;
			expect(tags.length).to.equal(9);
		});

		it('excludes ArFS tag if its within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			const tags = getDecodedTags(transaction.tags);

			expect(tags.find((t) => t.name === 'ArFS')).to.be.undefined;
			expect(tags.length).to.equal(8);
		});

		it('can exclude multiple tags if provided within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
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
				objectMetaData: stubPublicFileMetaDataTrx,
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
					objectMetaData: stubPublicFileMetaDataTrx,
					rewardSettings: { reward: W(10) },
					otherTags: [{ name: 'Drive-Id', value: 'ultimate drive ID of awesome' }]
				}),
				errorMessage: 'Tag Drive-Id is protected and cannot be used in this context!'
			});
		});
	});
});
