import { expect } from 'chai';
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
});
