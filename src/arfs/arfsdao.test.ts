import Arweave from 'arweave';
import { stubEntityID } from '../../tests/stubs';
import { ByteCount, stubTransactionID, UnixTime, W } from '../types';
import { readJWKFile } from '../utils/common';
import { ArFSDAO } from './arfsdao';
import { ArFSPublicFileMetaDataPrototype } from './arfs_prototypes';
import { ArFSPublicFileMetadataTransactionData } from './arfs_trx_data_types';
import { expect } from 'chai';

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
		it('includes ArFS tag by default', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction(stubFileMetaDataTrx, { reward: W(10) });
			expect(transaction.tags.find((tag) => tag.get('name', { decode: true, string: true }) === 'ArFS')).to.be
				.undefined;
		});

		it('excludes ArFS tag if its within the exclusion array', async () => {
			const transaction = await arfsDao.prepareArFSObjectTransaction(stubFileMetaDataTrx, { reward: W(10) }, [
				'ArFS'
			]);
			expect(transaction.tags.find((tag) => tag.get('name', { decode: true, string: true }) === 'ArFS')).to.exist;
		});
	});
});
