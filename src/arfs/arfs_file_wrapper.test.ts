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
});

// describe('ArFSFileToUpload class');

// describe('ArFSFolderToUpload class');
