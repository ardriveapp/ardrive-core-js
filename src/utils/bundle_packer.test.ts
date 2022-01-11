import { expect } from 'chai';
import { stubEntityID } from '../../tests/stubs';
import { ArFSFileToUpload, ArFSFolderToUpload, wrapFileOrFolder } from '../arfs/arfs_file_wrapper';
import { ByteCount, UploadStats } from '../types';
import { BundlePacker, LowestIndexBundlePacker } from './bundle_packer';

describe('LowestIndexBundlePacker class', () => {
	let bundlePacker: BundlePacker;

	beforeEach(() => {
		// Construct a fresh bundle packer for each with
		// max bundle size 100 and data item limit of 10
		bundlePacker = new LowestIndexBundlePacker(new ByteCount(100), 10);
	});

	const partialUploadStats = { destDriveId: stubEntityID, destFolderId: stubEntityID };

	const wrappedFile = wrapFileOrFolder('test_wallet.json') as ArFSFileToUpload;
	const wrappedFolder = wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;

	const fileUploadStats: UploadStats = { ...partialUploadStats, wrappedEntity: wrappedFile };
	const folderUploadStats: UploadStats = {
		...partialUploadStats,
		wrappedEntity: wrappedFolder
	};

	it('packs a provided file entity into bundle', () => {
		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(10),
			numberOfDataItems: 2
		});

		expect(bundlePacker.bundles.length).to.equal(1);
		expect(bundlePacker.bundles[0].totalSize).to.equal(10);
		expect(bundlePacker.bundles[0].totalDataItems).to.equal(2);
	});

	it('packs a provided folder entity into bundle', () => {
		bundlePacker.packIntoBundle({
			uploadStats: folderUploadStats,
			byteCountAsDataItem: new ByteCount(10),
			numberOfDataItems: 1
		});

		expect(bundlePacker.bundles.length).to.equal(1);
	});

	it('packs an entity that would exceed the max size of the first bundle into a second bundle', () => {
		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(50),
			numberOfDataItems: 2
		});

		expect(bundlePacker.bundles.length).to.equal(1);
		expect(bundlePacker.bundles[0].totalSize).to.equal(50);
		expect(bundlePacker.bundles[0].totalDataItems).to.equal(2);

		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(51),
			numberOfDataItems: 2
		});

		expect(bundlePacker.bundles.length).to.equal(2);
		expect(bundlePacker.bundles[1].totalSize).to.equal(51);
		expect(bundlePacker.bundles[1].totalDataItems).to.equal(2);
	});

	it('packs an entity that would exceed the max data item limit of the first bundle into a second bundle', () => {
		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(10),
			numberOfDataItems: 8
		});

		expect(bundlePacker.bundles.length).to.equal(1);
		expect(bundlePacker.bundles[0].totalSize).to.equal(10);
		expect(bundlePacker.bundles[0].totalDataItems).to.equal(8);

		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(15),
			numberOfDataItems: 3
		});

		expect(bundlePacker.bundles.length).to.equal(2);
		expect(bundlePacker.bundles[1].totalSize).to.equal(15);
		expect(bundlePacker.bundles[1].totalDataItems).to.equal(3);
	});

	it('packs an entity that would exceed the limits of the first bundle into a second bundle, but will pack the third entity into the first bundle if it fits', () => {
		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(20),
			numberOfDataItems: 2
		});

		expect(bundlePacker.bundles.length).to.equal(1);
		expect(bundlePacker.bundles[0].totalSize).to.equal(20);

		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(90),
			numberOfDataItems: 2
		});

		expect(bundlePacker.bundles.length).to.equal(2);
		expect(bundlePacker.bundles[1].totalSize).to.equal(90);

		bundlePacker.packIntoBundle({
			uploadStats: fileUploadStats,
			byteCountAsDataItem: new ByteCount(50),
			numberOfDataItems: 2
		});

		expect(bundlePacker.bundles.length).to.equal(2);
		expect(bundlePacker.bundles[0].totalSize).to.equal(70);
	});

	it('throws an error if the provided byteCount is larger than the maximum bundle size', () => {
		expect(() =>
			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItem: new ByteCount(101),
				numberOfDataItems: 1
			})
		).to.throw(Error, 'Data item is too large to be packed into a bundle!');
	});

	it('throws an error if the provided data item count is larger than the maximum data item limit', () => {
		expect(() =>
			bundlePacker.packIntoBundle({
				uploadStats: fileUploadStats,
				byteCountAsDataItem: new ByteCount(10),
				numberOfDataItems: 11
			})
		).to.throw(Error, 'Data item count is too high to be packed into a bundle!');
	});
});
