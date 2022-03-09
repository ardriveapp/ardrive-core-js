import { expect } from 'chai';
import { fakeArweave } from '../../tests/stubs';
import { getDataForTxID } from './get_tx_data';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TxID } from '../exports';
import { v4 } from 'uuid';
import { stub } from 'sinon';
import axios, { AxiosResponse } from 'axios';
import { ArFSMetadataCache } from '../arfs/arfs_metadata_cache';

describe('getDataForTxID function -- integrated', () => {
	const homeDir = os.homedir();
	const metadataCacheDir =
		os.platform() === 'win32'
			? path.join(homeDir, 'ardrive-caches', 'metadata')
			: path.join(homeDir, '.ardrive', 'caches', 'metadata');

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

	it('returns expected cached data when cache data is available', async () => {
		// Use randomized text between tests to ensure that stale data doesn't affect the test
		const expectedRandomBuffer = Buffer.from(v4());
		fs.writeFileSync(cachedTxFilePath, expectedRandomBuffer);
		expect(await getDataForTxID(cachedTxId, fakeArweave)).to.deep.equal(expectedRandomBuffer);
		expect(await ArFSMetadataCache.get(cachedTxId)).to.deep.equal(expectedRandomBuffer);
	});

	it('returns expected network data when cache data is unavailable and that the cache is then hydrated', async () => {
		// Use randomized text between tests to ensure that stale data doesn't affect the test
		const expectedRandomBuffer = Buffer.from(v4());
		const mockAxiosInstance = axios.create();
		stub(mockAxiosInstance, 'get').resolves({
			data: expectedRandomBuffer
		} as AxiosResponse<unknown>);

		// Inspect disk and cache for absence of cached data
		expect(fs.existsSync(cachedTxFilePath), 'Disk cache should not contain file').to.be.false;
		expect(await ArFSMetadataCache.get(cachedTxId), 'Cache should not contain file').to.be.undefined;

		expect(await getDataForTxID(cachedTxId, fakeArweave, mockAxiosInstance)).to.deep.equal(expectedRandomBuffer);

		// Inspect disk and cache for presence of cached data
		expect(fs.readFileSync(cachedTxFilePath), 'Disk cache should contain correct file data').to.deep.equal(
			expectedRandomBuffer
		);
		expect(await ArFSMetadataCache.get(cachedTxId), 'Cache should return correct file data').to.deep.equal(
			expectedRandomBuffer
		);
	});
});
