import { expect } from 'chai';
import { stubEntitiesWithPathsAndIndexInRoot, stubPublicEntitiesWithPaths } from '../../tests/stubs';
import { W } from '../types';
import { ArFSFileToUpload, ArFSManifestToUpload, wrapFileOrFolder } from './arfs_file_wrapper';

describe('ArFSManifestToUpload class', () => {
	it('will link to an index.html file in the root of the folder if it exists', () => {
		const manifest = new ArFSManifestToUpload(stubEntitiesWithPathsAndIndexInRoot, 'DriveManifest.json');

		// Ensure arweave required fields exist
		expect(manifest.manifest.manifest).to.equal('arweave/paths');
		expect(manifest.manifest.version).to.equal('0.1.0');

		// Expect index path to be the first file
		expect(manifest.manifest.index.path).to.equal('index.html');

		// Assert the structure is consistent with provided stub hierarchy
		expect(manifest.manifest.paths).to.deep.equal({
			'file-in-root': {
				id: '0000000000000000000000000000000000000000000'
			},
			'index.html': {
				id: '0000000000000000000000000000000000000000000'
			},
			'parent-folder/child-folder/file-in-child': {
				id: '0000000000000000000000000000000000000000000'
			},
			'parent-folder/file-in-parent': {
				id: '0000000000000000000000000000000000000000000'
			}
		});
	});

	it('constructs a manifest compatible with arweave gateways', () => {
		const manifest = new ArFSManifestToUpload(stubPublicEntitiesWithPaths, 'DriveManifest.json');

		// Ensure arweave required fields exist
		expect(manifest.manifest.manifest).to.equal('arweave/paths');
		expect(manifest.manifest.version).to.equal('0.1.0');

		// Expect index path to be the first file
		expect(manifest.manifest.index.path).to.equal('file-in-root');

		// Assert the structure is consistent with provided stub hierarchy
		expect(manifest.manifest.paths).to.deep.equal({
			'file-in-root': {
				id: '0000000000000000000000000000000000000000000'
			},
			'parent-folder/child-folder/file-in-child': {
				id: '0000000000000000000000000000000000000000000'
			},
			'parent-folder/file-in-parent': {
				id: '0000000000000000000000000000000000000000000'
			}
		});
	});

	it('getBaseFileName function returns the provided name', () => {
		const manifest = new ArFSManifestToUpload(stubPublicEntitiesWithPaths, 'NameTestManifest.json');

		expect(manifest.getBaseFileName()).to.equal('NameTestManifest.json');
	});

	it('gatherFileInfo function returns the expected results', () => {
		const currentUnixTimeMs = Math.round(Date.now() / 1000);
		const manifest = new ArFSManifestToUpload(stubPublicEntitiesWithPaths, 'TestManifest.json');

		const { dataContentType, lastModifiedDateMS, fileSize } = manifest.gatherFileInfo();

		expect(dataContentType).to.equal('application/x.arweave-manifest+json');
		expect(+lastModifiedDateMS).to.equal(currentUnixTimeMs);
		expect(+fileSize).to.equal(336);
	});

	it('getFileDataBuffer function returns a compatible Buffer we can use to upload', () => {
		const manifest = new ArFSManifestToUpload(stubPublicEntitiesWithPaths, 'TestManifest.json');

		expect(manifest.getFileDataBuffer() instanceof Buffer).to.be.true;
	});
});

describe('ArFSFileToUpload class', () => {
	let fileToUpload: ArFSFileToUpload;

	beforeEach(() => {
		// Start each test with a newly wrapped file
		fileToUpload = wrapFileOrFolder('./test_wallet.json') as ArFSFileToUpload;
	});

	it('throws an error on construction if file max size limit is exceeded', () => {
		expect(
			() => new ArFSFileToUpload('./test_wallet.json', { ...fileToUpload.fileStats, size: 2_147_483_646 })
		).to.throw(Error, 'Files greater than "2147483645" bytes are not yet supported!');
	});

	it('gatherFileInfo function returns the expected results', () => {
		const { dataContentType, fileSize, lastModifiedDateMS } = fileToUpload.gatherFileInfo();

		expect(dataContentType).to.equal('application/json');
		expect(+fileSize).to.equal(3204);

		// Last modified date varies between local dev environments and CI environment
		const expectedLastModifiedDate = fileToUpload.lastModifiedDate;
		expect(+lastModifiedDateMS).to.equal(+expectedLastModifiedDate);
	});

	it('getFileDataBuffer function returns a compatible Buffer we can use to upload', () => {
		expect(fileToUpload.getFileDataBuffer() instanceof Buffer).to.be.true;
	});

	it('getBaseFileName function returns the correct name', () => {
		expect(fileToUpload.getBaseFileName()).to.equal('test_wallet.json');
	});

	it('encryptedDataSize function returns the expected size', () => {
		expect(+fileToUpload.encryptedDataSize()).to.equal(3220);
	});

	it('getBaseCosts function throws an error if base costs are not set', () => {
		expect(() => fileToUpload.getBaseCosts()).to.throw(Error, 'Base costs on file were never set!');
	});

	it('getBaseCosts function returns any assigned base costs', () => {
		fileToUpload.baseCosts = { fileDataBaseReward: W(1), metaDataBaseReward: W(2) };

		expect(+fileToUpload.getBaseCosts().fileDataBaseReward).to.equal(1);
		expect(+fileToUpload.getBaseCosts().metaDataBaseReward).to.equal(2);
	});
});

// describe('ArFSFolderToUpload class');
