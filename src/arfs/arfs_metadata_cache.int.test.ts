import { expect } from 'chai';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TxID } from '../exports';
import { v4 } from 'uuid';
import { ArFSMetadataCache } from '../arfs/arfs_metadata_cache';

describe('ArFSMetadataCache class -- integrated', () => {
	const homeDir = os.homedir();
	const metadataCacheDir = path.join(homeDir, '.ardrive', 'caches', 'metadata');
	const cachedTxId = TxID('ThisIsAFakeTransactionIDThatIReallyWillFake');
	const cachedTxFilePath = path.join(metadataCacheDir, `${cachedTxId}`);

	beforeEach(() => {
		// clean up specific cache files
		if (fs.existsSync(cachedTxFilePath)) {
			fs.rmSync(cachedTxFilePath);
		}
	});

	afterEach(() => {
		// clean up specific cache files
		if (fs.existsSync(cachedTxFilePath)) {
			fs.rmSync(cachedTxFilePath);
		}
	});

	it('returns expected cached data dependent on cached data availability', async () => {
		// Use randomized text between tests to ensure that stale data doesn't affect the test
		const expectedRandomBuffer = Buffer.from(v4());

		// Given that there's nothing in the cache...
		expect(fs.existsSync(cachedTxFilePath)).to.be.false;
		expect(await ArFSMetadataCache.get(cachedTxId)).to.be.undefined;

		// Given that there's data in the cache...
		await ArFSMetadataCache.put(cachedTxId, expectedRandomBuffer);
		expect(fs.existsSync(cachedTxFilePath)).to.be.true;
		expect(await ArFSMetadataCache.get(cachedTxId)).to.deep.equal(expectedRandomBuffer);
	});
});
