import { expect } from 'chai';
import { stubFileUploadStats, stubFolderUploadStats } from '../../tests/stubs';
import { ByteCount, UploadStats } from '../types';
import { BundlePacker, LowestIndexBundlePacker } from './bundle_packer';

describe('LowestIndexBundlePacker class', () => {
	const fileUploadStats: UploadStats = stubFileUploadStats();
	const folderUploadStats: UploadStats = stubFolderUploadStats();

	describe('constructor', () => {
		it('throws an error with a max data item limit of less than 2', () => {
			expect(() => new LowestIndexBundlePacker(new ByteCount(1337), 1)).to.throw(
				Error,
				'Maximum data item limit must be an integer value of 2 or more!'
			);
		});
		it('throws an error with a non-integer decimal value as the max data item limit', () => {
			expect(() => new LowestIndexBundlePacker(new ByteCount(1337), 5.5)).to.throw(
				Error,
				'Maximum data item limit must be an integer value of 2 or more!'
			);
		});
	});

	describe('packIntoBundle method', () => {
		let bundlePacker: BundlePacker;

		beforeEach(() => {
			// Construct a fresh bundle packer for each test with
			// max bundle size 100 and data item limit of 10
			bundlePacker = new LowestIndexBundlePacker(new ByteCount(100), 10);
		});

		it('packs a provided file entity into bundle', () => {
			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(10),
				numberOfDataItems: 2
			});

			expect(bundlePacker.bundles.length).to.equal(1);
			expect(bundlePacker.bundles[0].totalSize).to.equal(10);
			expect(bundlePacker.bundles[0].totalDataItems).to.equal(2);
		});

		it('packs a provided folder entity into bundle', () => {
			bundlePacker.packIntoBundle({
				uploadStats: folderUploadStats,
				byteCountAsDataItems: new ByteCount(10),
				numberOfDataItems: 1
			});

			expect(bundlePacker.bundles.length).to.equal(1);
		});

		it('packs an entity that would exceed the max size of the first bundle into a second bundle', () => {
			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(50),
				numberOfDataItems: 2
			});

			expect(bundlePacker.bundles.length).to.equal(1);
			expect(bundlePacker.bundles[0].totalSize).to.equal(50);
			expect(bundlePacker.bundles[0].totalDataItems).to.equal(2);

			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(51),
				numberOfDataItems: 2
			});

			expect(bundlePacker.bundles.length).to.equal(2);
			expect(bundlePacker.bundles[1].totalSize).to.equal(51);
			expect(bundlePacker.bundles[1].totalDataItems).to.equal(2);
		});

		it('packs an entity that would exceed the max data item limit of the first bundle into a second bundle', () => {
			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(10),
				numberOfDataItems: 8
			});

			expect(bundlePacker.bundles.length).to.equal(1);
			expect(bundlePacker.bundles[0].totalSize).to.equal(10);
			expect(bundlePacker.bundles[0].totalDataItems).to.equal(8);

			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(15),
				numberOfDataItems: 3
			});

			expect(bundlePacker.bundles.length).to.equal(2);
			expect(bundlePacker.bundles[1].totalSize).to.equal(15);
			expect(bundlePacker.bundles[1].totalDataItems).to.equal(3);
		});

		it('packs an entity that would exceed the limits of the first bundle into a second bundle, but will pack the third entity into the first bundle if it fits', () => {
			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(20),
				numberOfDataItems: 2
			});

			expect(bundlePacker.bundles.length).to.equal(1);
			expect(bundlePacker.bundles[0].totalSize).to.equal(20);

			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(90),
				numberOfDataItems: 2
			});

			expect(bundlePacker.bundles.length).to.equal(2);
			expect(bundlePacker.bundles[1].totalSize).to.equal(90);

			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItems: new ByteCount(50),
				numberOfDataItems: 2
			});

			expect(bundlePacker.bundles.length).to.equal(2);
			expect(bundlePacker.bundles[0].totalSize).to.equal(70);
		});
	});

	describe('canPackDataItemsWithByteCounts method', () => {
		const bundlePacker = new LowestIndexBundlePacker(new ByteCount(50), 3);

		it('throws an error if the provided byteCount is larger than the maximum bundle size', () => {
			expect(
				bundlePacker.canPackDataItemsWithByteCounts([new ByteCount(25), new ByteCount(25), new ByteCount(1)])
			).to.be.false;
		});

		it('throws an error if the provided data item count is larger than the maximum data item limit', () => {
			expect(
				bundlePacker.canPackDataItemsWithByteCounts([
					new ByteCount(1),
					new ByteCount(2),
					new ByteCount(3),
					new ByteCount(4)
				])
			).to.be.false;
		});

		it('returns true if the byte counts can be packed into bundles within the given limits', () => {
			expect(
				bundlePacker.canPackDataItemsWithByteCounts([new ByteCount(25), new ByteCount(20), new ByteCount(5)])
			).to.be.true;
		});
	});
});
