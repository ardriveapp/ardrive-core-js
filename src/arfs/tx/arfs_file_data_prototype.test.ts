import { expect } from 'chai';
import { getStubDriveKey, stubEntityID } from '../../../tests/stubs';
import { ArFSPrivateFileDataPrototype, ArFSPublicFileDataPrototype } from './arfs_prototypes';
import { ArFSPrivateFileDataTransactionData, ArFSPublicFileDataTransactionData } from './arfs_tx_data_types';

describe('ArFSFileDataPrototype', () => {
	const unixTimeOf = (tags: { name: string; value: string }[]) => tags.filter((t) => t.name === 'Unix-Time');

	it('dates public file data with one Unix-Time tag, in seconds', () => {
		const before = Math.floor(Date.now() / 1000);
		const prototype = new ArFSPublicFileDataPrototype(
			new ArFSPublicFileDataTransactionData(Buffer.from('file data')),
			'text/plain'
		);
		const after = Math.floor(Date.now() / 1000);
		const tags = prototype.gqlTags;

		expect(unixTimeOf(tags)).to.have.length(1);
		const stamped = +unixTimeOf(tags)[0].value;
		expect(stamped).to.be.within(before, after);
		expect(`${prototype.unixTime}`).to.equal(`${stamped}`);
		expect(tags).to.deep.include({ name: 'Content-Type', value: 'text/plain' });
	});

	it('dates private file data too, beside its cipher tags', async () => {
		const prototype = new ArFSPrivateFileDataPrototype(
			await ArFSPrivateFileDataTransactionData.from(
				Buffer.from('file data'),
				stubEntityID,
				await getStubDriveKey()
			)
		);
		const names = prototype.gqlTags.map((t) => t.name);

		expect(names).to.include.members(['Content-Type', 'Cipher', 'Cipher-IV', 'Unix-Time']);
		expect(unixTimeOf(prototype.gqlTags)).to.have.length(1);
		expect(unixTimeOf(prototype.gqlTags)[0].value).to.match(/^\d{10}$/);
	});

	it('keeps custom data tags beside the date, which they cannot replace', () => {
		const prototype = new ArFSPublicFileDataPrototype(
			new ArFSPublicFileDataTransactionData(Buffer.from('file data')),
			'text/plain',
			{ 'My-Tag': 'mine' }
		);

		expect(prototype.gqlTags).to.deep.include({ name: 'My-Tag', value: 'mine' });
		expect(unixTimeOf(prototype.gqlTags)).to.have.length(1);
	});
});
