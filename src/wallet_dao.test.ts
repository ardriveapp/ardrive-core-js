import { expect } from 'chai';
import { fakeArweave } from '../tests/stubs';
import { SeedPhrase } from './exports';
import { WalletDAO } from './wallet_dao';

describe('Wallet DAO', function () {
	this.timeout(90_000);
	const walletDAO = new WalletDAO(fakeArweave);
	it('generateWallet from seedphrase function', async () => {
		const seedPhrase = new SeedPhrase(
			'slender during cost problem tortoise extra deal walnut great oblige planet kid'
		);
		const wallet = await walletDAO.generateJWKWallet2(seedPhrase);
		const address = await wallet.getAddress();
		expect(address.toString()).to.equal('FOKCJ1sz9XfFGy8KwVQczDPdavCEu6c5GkzTNfEbRI8');
	});
});
