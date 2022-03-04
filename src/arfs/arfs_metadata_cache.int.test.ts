import { expect } from 'chai';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TxID } from '../exports';
import { v4 } from 'uuid';
import { ArFSMetadataCache } from '../arfs/arfs_metadata_cache';

describe('ArFSMetadataCache class -- integrated', () => {
	const cacheBaseFolder = process.env['XDG_CACHE_HOME'] ?? os.homedir();
	const metadataCacheDir =
		os.platform() === 'win32'
			? path.join(cacheBaseFolder, 'ardrive-caches', 'metadata')
			: path.join(cacheBaseFolder, '.ardrive', 'caches', 'metadata');
	const randomTxID = v4().toString().repeat(2).split('-').join('').substring(0, 43);
	const cachedTxId = TxID(randomTxID);
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
		expect(fs.existsSync(cachedTxFilePath), 'Disk cache should not contain file').to.be.false;
		expect(await ArFSMetadataCache.get(cachedTxId), 'Cache should not contain data').to.be.undefined;

		// Given that there's data in the cache...
		await ArFSMetadataCache.put(cachedTxId, expectedRandomBuffer);
		expect(fs.existsSync(cachedTxFilePath), 'Disk cache should contain file').to.be.true;
		expect(await ArFSMetadataCache.get(cachedTxId), 'Cache should return expected data').to.deep.equal(
			expectedRandomBuffer
		);
	});
});
