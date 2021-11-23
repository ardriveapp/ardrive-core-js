import { expect } from 'chai';
import { stubEntitiesWithPathsAndIndexInRoot, stubPublicEntitiesWithPaths } from '../../tests/stubs';
import { ArFSManifestToUpload } from './arfs_file_wrapper';

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

// describe('ArFSFileToUpload class');

// describe('ArFSFolderToUpload class');
