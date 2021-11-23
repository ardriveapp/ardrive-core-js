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

	const arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'ArFSDao-Test', '1.0');

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
		});

		it('includes the boost tag when boosted', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) }
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'Boost')).to.exist;
		});

		it('excludes the boost tag when boosted and boost tag is excluded', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10), feeMultiple: new FeeMultiple(1.5) },
				excludedTagNames: ['Boost']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'Boost')).to.be.undefined;
		});

		it('excludes ArFS tag if its within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction({
				objectMetaData: stubFileMetaDataTrx,
				rewardSettings: { reward: W(10) },
				excludedTagNames: ['ArFS']
			});
			expect(transaction.tags.find((tag) => getDecodedTagName(tag) === 'ArFS')).to.be.undefined;
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
		});
	});
});
