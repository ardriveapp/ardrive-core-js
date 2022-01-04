import { expect } from 'chai';
import {
	stubArweaveAddress,
	stubEntityID,
	stubEntityIDAlt,
	stubPrivateDrive,
	stubPublicDrive,
	stubPublicFile,
	stubPublicFolder
} from '../../tests/stubs';
import { ArweaveAddress, DriveID, EntityID } from '../types';
import { ArFSPublicDriveCacheKey, ArFSPublicFileCacheKey, ArFSPublicFolderCacheKey } from './arfsdao_anonymous';
import { ArFSPublicDrive, ArFSPublicFile, ArFSPublicFolder } from './arfs_entities';
import { ArFSEntityCache } from './arfs_entity_cache';

describe('ArFSEntityCache class', () => {
	it('constructor to take a capacity that is not exceeded by excessive puts', async () => {
		const cache = new ArFSEntityCache<string, string>(1);
		cache.put('1', Promise.resolve('one'));
		cache.put('2', Promise.resolve('two'));
		expect(cache.get('1')).to.be.undefined;
		expect(cache.get('2')).to.not.be.undefined;
		expect(await cache.get('2')).to.equal('two');
		expect(cache.size()).to.equal(1);
	});

	it('preserves most requested entries when over capacity', async () => {
		const cache = new ArFSEntityCache<string, string>(3);
		cache.put('1', Promise.resolve('one'));
		cache.put('2', Promise.resolve('two'));
		cache.put('3', Promise.resolve('three'));
		cache.get('1');
		cache.get('3');
		cache.put('4', Promise.resolve('four'));
		expect(cache.get('1')).to.not.be.undefined;
		expect(cache.get('2')).to.be.undefined;
		expect(cache.get('3')).to.not.be.undefined;
		expect(cache.get('4')).to.not.be.undefined;
		expect(await cache.get('1')).to.equal('one');
		expect(await cache.get('3')).to.equal('three');
		expect(await cache.get('4')).to.equal('four');
		expect(cache.size()).to.equal(3);
	});

	it('caches and retrieves new entries', async () => {
		const cache = new ArFSEntityCache<string, string>(1);
		cache.put('1', Promise.resolve('one'));
		expect(cache.get('1')).to.not.be.undefined;
		expect(await cache.get('1')).to.equal('one');
		expect(cache.size()).to.equal(1);
	});

	it('updates and retrieves existing entries', async () => {
		const cache = new ArFSEntityCache<string, string>(2);
		cache.put('1', Promise.resolve('one'));
		cache.put('1', Promise.resolve('uno'));
		expect(cache.get('1')).to.not.be.undefined;
		expect(await cache.get('1')).to.equal('uno');
		expect(cache.size()).to.equal(1);
	});

	it('caches and retrieves different object entries', async () => {
		const cache = new ArFSEntityCache<Record<string, string>, string>(2);
		const cacheKey1 = { foo: 'bar' };
		const cacheKey2 = { bar: 'foo' };
		cache.put(cacheKey1, Promise.resolve('foobar'));
		cache.put(cacheKey2, Promise.resolve('barfoo'));
		expect(cache.get(cacheKey1)).to.not.be.undefined;
		expect(await cache.get(cacheKey1)).to.equal('foobar');
		expect(cache.get(cacheKey2)).to.not.be.undefined;
		expect(await cache.get(cacheKey2)).to.equal('barfoo');
		expect(cache.size()).to.equal(2);
	});

	describe('remove function', () => {
		it('removes a single entry', async () => {
			const cache = new ArFSEntityCache<string, string>(2);
			cache.put('1', Promise.resolve('one'));
			cache.put('2', Promise.resolve('two'));
			expect(cache.get('1')).to.not.be.undefined;
			expect(cache.get('2')).to.not.be.undefined;
			cache.remove('2');
			expect(cache.get('2')).to.be.undefined;
			expect(cache.get('1')).to.not.undefined;
			expect(await cache.get('1')).to.equal('one');
			expect(cache.size()).to.equal(1);
		});
	});

	describe('clear function', () => {
		it('purges all entries', async () => {
			const cache = new ArFSEntityCache<string, string>(1);
			cache.put('1', Promise.resolve('one'));
			cache.clear();
			expect(cache.get('1')).to.be.undefined;
			expect(cache.size()).to.equal(0);
		});
	});

	describe('size function', () => {
		it('returns the correct entry count', async () => {
			const cache = new ArFSEntityCache<string, string>(2);
			cache.put('1', Promise.resolve('one'));
			cache.put('2', Promise.resolve('two'));
			expect(cache.size()).to.equal(2);
		});
	});

	describe('cacheKeyString function', () => {
		it('returns and input string as the same string', async () => {
			const cache = new ArFSEntityCache<string, string>(1);
			expect(cache.cacheKeyString('key')).to.equal('key');
			expect(cache.cacheKeyString('{ bad: "json"')).to.equal('{ bad: "json"');
		});

		it('returns an input number as a string', async () => {
			const cache = new ArFSEntityCache<number, string>(1);
			expect(cache.cacheKeyString(1)).to.equal('1');
		});

		it('returns an input object as its JSON representation', async () => {
			const cache = new ArFSEntityCache<Record<string, string>, string>(1);
			expect(cache.cacheKeyString({ foo: 'bar' })).to.equal('{"foo":"bar"}');
		});
	});

	describe('of ArweaveAddresses by DriveID', () => {
		it('caches and retrieves different entries', async () => {
			const cache = new ArFSEntityCache<DriveID, ArweaveAddress>(2);
			const id1 = stubEntityID;
			const id2 = stubEntityIDAlt;
			const addr1 = stubArweaveAddress();
			const addr2 = stubArweaveAddress('123456789ABCDEFGHabcdefghijklmnopqrxtuvwxyz');
			cache.put(id1, Promise.resolve(addr1));
			cache.put(id2, Promise.resolve(addr2));
			expect(cache.get(id1)).to.not.be.undefined;
			expect(await cache.get(id1)).equals(addr1);
			expect(cache.get(id2)).to.not.be.undefined;
			expect(await cache.get(id2)).equals(addr2);
			expect(cache.size()).to.equal(2);
		});
	});

	describe('of DriveID by EntityID', () => {
		it('caches and retrieves different entries', async () => {
			const cache = new ArFSEntityCache<EntityID, DriveID>(2);
			const id1 = stubEntityID;
			const id2 = stubEntityIDAlt;
			const driveID1 = stubEntityID;
			const driveID2 = stubEntityIDAlt;
			cache.put(id1, Promise.resolve(driveID1));
			cache.put(id2, Promise.resolve(driveID2));
			expect(cache.get(id1)).to.not.be.undefined;
			expect(await cache.get(id1)).equals(driveID1);
			expect(cache.get(id2)).to.not.be.undefined;
			expect(await cache.get(id2)).equals(driveID2);
			expect(cache.size()).to.equal(2);
		});
	});

	describe('of ArFSPublicDrive by ArFSPublicDriveCacheKey', () => {
		it('caches and retrieves different entries', async () => {
			const cache = new ArFSEntityCache<ArFSPublicDriveCacheKey, ArFSPublicDrive>(2);
			const id1 = { driveId: stubEntityID, owner: stubArweaveAddress() };
			const id2 = { driveId: stubEntityIDAlt, owner: stubArweaveAddress() };
			const drive1 = stubPublicDrive();
			const drive2 = stubPrivateDrive; // borrow this stub since it extends ArFSPublicDrive
			cache.put(id1, Promise.resolve(drive1));
			cache.put(id2, Promise.resolve(drive2));
			expect(cache.get(id1)).to.not.be.undefined;
			expect(await cache.get(id1)).equals(drive1);
			expect(cache.get(id2)).to.not.be.undefined;
			expect(await cache.get(id2)).equals(drive2);
			expect(cache.size()).to.equal(2);
		});
	});

	describe('of ArFSPublicFolder by ArFSPublicFolderCacheKey', () => {
		it('caches and retrieves different entries', async () => {
			const cache = new ArFSEntityCache<ArFSPublicFolderCacheKey, ArFSPublicFolder>(2);
			const id1 = { folderId: stubEntityID, owner: stubArweaveAddress() };
			const id2 = { folderId: stubEntityIDAlt, owner: stubArweaveAddress() };
			const folder1 = stubPublicFolder({});
			const folder2 = stubPublicFolder({ folderId: stubEntityIDAlt });
			cache.put(id1, Promise.resolve(folder1));
			cache.put(id2, Promise.resolve(folder2));
			expect(cache.get(id1)).to.not.be.undefined;
			expect(await cache.get(id1)).equals(folder1);
			expect(cache.get(id2)).to.not.be.undefined;
			expect(await cache.get(id2)).equals(folder2);
			expect(cache.size()).to.equal(2);
		});
	});

	describe('of ArFSPublicFile by ArFSPublicFileCacheKey', () => {
		it('caches and retrieves different entries', async () => {
			const cache = new ArFSEntityCache<ArFSPublicFileCacheKey, ArFSPublicFile>(2);
			const id1 = { fileId: stubEntityID, owner: stubArweaveAddress() };
			const id2 = { fileId: stubEntityIDAlt, owner: stubArweaveAddress() };
			const file1 = stubPublicFile({});
			const file2 = stubPublicFile({ fileId: stubEntityIDAlt });
			cache.put(id1, Promise.resolve(file1));
			cache.put(id2, Promise.resolve(file2));
			expect(cache.get(id1)).to.not.be.undefined;
			expect(await cache.get(id1)).equals(file1);
			expect(cache.get(id2)).to.not.be.undefined;
			expect(await cache.get(id2)).equals(file2);
			expect(cache.size()).to.equal(2);
		});
	});
});
