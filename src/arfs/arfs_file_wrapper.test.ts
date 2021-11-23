import { expect } from 'chai';
import { stubPublicEntitiesWithPaths } from '../../tests/stubs';
import { ArFSManifestToUpload } from './arfs_file_wrapper';

describe('ArFSManifestToUpload class', () => {
	it('will link to an index.html file in the root of the folder if it exists');

	it('constructs a manifest compatible with arweave gateways', () => {
		const manifest = new ArFSManifestToUpload(stubPublicEntitiesWithPaths);

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

describe('ArFSFileToUpload class');

describe('ArFSFolderToUpload class');
