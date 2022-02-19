import { expect } from 'chai';
import { getStubDriveKey } from '../../tests/stubs';
import { EntityKey } from './entity_key';

describe('EntityKey class', () => {
	let key: EntityKey;

	before(async () => {
		key = await getStubDriveKey();
	});

	it('throws if a non-buffer is given', () => {
		// eslint-disable-next-line prettier/prettier
		const nonBuffer: Buffer = ('non buffer type' as unknown) as Buffer;
		expect(() => new EntityKey(nonBuffer)).to.throw('The argument must be of type Buffer, got string');
	});

	it('the original buffer contains the correct data', async () => {
		expect(key.keyData).to.deep.equal(
			Buffer.from([
				// eslint-disable-next-line prettier/prettier
				159,
				20,
				229,
				218,
				72,
				185,
				133,
				104,
				242,
				96,
				77,
				18,
				140,
				232,
				54,
				21,
				93,
				207,
				19,
				177,
				1,
				40,
				199,
				// eslint-disable-next-line prettier/prettier
				189,
				19,
				169,
				3,
				242,
				227,
				175,
				155,
				172
			])
		);
	});

	it('toJSON returns the urlEncodedHash string', () => {
		expect(`${key}`).to.equal('nxTl2ki5hWjyYE0SjOg2FV3PE7EBKMe9E6kD8uOvm6w');
	});

	it('toString returns the urlEncodedHash string', () => {
		expect(key.toString()).to.equal('nxTl2ki5hWjyYE0SjOg2FV3PE7EBKMe9E6kD8uOvm6w');
	});
});
