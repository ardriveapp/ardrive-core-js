import Arweave from 'arweave';
import { stubEntityID } from '../../tests/stubs';
import { ByteCount, FeeMultiple, stubTransactionID, UnixTime, W } from '../types';
import { readJWKFile } from '../utils/common';
import { ArFSDAO } from './arfsdao';
import { ArFSPublicFileMetaDataPrototype } from './arfs_prototypes';
import { ArFSPublicFileMetadataTransactionData } from './arfs_trx_data_types';
import { expect } from 'chai';
import { Tag } from 'arweave/node/lib/transaction';

describe('The ArFSDAO class', () => {
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
			'Test Metadata',
			new ByteCount(10),
			new UnixTime(123456789),
			stubTransactionID,
			'text/plain'
		),
		stubEntityID,
		stubEntityIDAlt,
		stubEntityIDAltTwo
	);

	describe('prepareObjectTransaction function', () => {
		const getDecodedTagName = (tag: Tag) => tag.get('name', { decode: true, string: true });

		// Helper function to grab the decoded gql tags off of a Transaction
		const getDecodedTags = (tags: Tag[]): GQLTagInterface[] =>
			tags.map((tag) => ({
				name: tag.get('name', { decode: true, string: true }),
				value: tag.get('value', { decode: true, string: true })
			}));

		it('produces an ArFS compliant public file transaction', async () => {
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
			expect(tags.find((t) => t.name === 'Unix-Time')?.value).to.equal(`${Math.round(Date.now() / 1000)}`);
			expect(tags.find((t) => t.name === 'Drive-Id')?.value).to.equal(`${stubEntityID}`);
			expect(tags.find((t) => t.name === 'File-Id')?.value).to.equal(`${stubEntityIDAlt}`);
			expect(tags.find((t) => t.name === 'Parent-Folder-Id')?.value).to.equal(`${stubEntityIDAltTwo}`);

			// Assert there are no other unexpected tags
			expect(tags.length).to.equal(9);
		});

		it('includes the base ArFS tags by default', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10) }
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.exist;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Name')).to.exist;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Version')).to.exist;
			expect(transaction.tags.length).to.equal(9);
		});

		it('includes the boost tag when boosted', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) }
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'Boost')).to.exist;
			expect(transaction.tags.length).to.equal(10);
		});

		it('excludes the boost tag when boosted and boost tag is excluded', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) },
				excludedTagNames: ['Boost']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'Boost')).to.be.undefined;
			expect(transaction.tags.length).to.equal(9);
		});

		it('excludes ArFS tag if its within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.be.undefined;
			expect(transaction.tags.length).to.equal(8);
		});

		it('can exclude multiple tags if provided within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubPublicFileMetaDataTrx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS', 'App-Version', 'App-Name']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.be.undefined;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Name')).to.be.undefined;
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'App-Version')).to.be.undefined;
			expect(transaction.tags.length).to.equal(6);
		});
	});
});
