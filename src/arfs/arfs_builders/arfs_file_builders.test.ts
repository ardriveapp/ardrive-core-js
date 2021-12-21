import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave, stubTxID } from '../../../tests/stubs';
import { GQLNodeInterface } from '../../types';
import { ArFSPublicFileBuilder } from './arfs_file_builders';

// TODO: Add private file builder test
// TODO: Add builder tests for folders/drives

describe('ArFSPublicFileBuilder', () => {
	const stubPublicFileGQLNode: Partial<GQLNodeInterface> = {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.11' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Unix-Time', value: '1639073846' },
			{ name: 'Parent-Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
			{ name: 'File-Id', value: '9f7038c7-26bd-4856-a843-8de24b828d4e' }
		]
	};

	// prettier-ignore
	const stubPublicFileGetDataResult = Uint8Array.from([
		123, 34, 110, 97, 109, 101, 34, 58, 34, 50, 34, 44, 34, 115, 105, 122, 101, 34, 58, 50, 48, 52, 56, 44, 34, 108,
		97, 115, 116, 77, 111, 100, 105, 102, 105, 101, 100, 68, 97, 116, 101, 34, 58, 49, 54, 51, 57, 48, 55, 51, 54,
		51, 52, 50, 54, 57, 44, 34, 100, 97, 116, 97, 84, 120, 73, 100, 34, 58, 34, 121, 65, 111, 103, 97, 71, 87, 87,
		89, 103, 87, 79, 53, 120, 87, 90, 101, 118, 98, 52, 53, 89, 55, 89, 82, 112, 55, 69, 57, 105, 68, 115, 118, 107,
		74, 118, 102, 82, 55, 84, 111, 57, 99, 34, 44, 34, 100, 97, 116, 97, 67, 111, 110, 116, 101, 110, 116, 84, 121,
		112, 101, 34, 58, 34, 117, 110, 107, 110, 111, 119, 110, 34, 125
	]);

	it('constructs expected file from node', async () => {
		stub(fakeArweave.transactions, 'getData').resolves(stubPublicFileGetDataResult);

		const builder = ArFSPublicFileBuilder.fromArweaveNode(stubPublicFileGQLNode as GQLNodeInterface, fakeArweave);
		const fileMetaData = await builder.build(stubPublicFileGQLNode as GQLNodeInterface);

		// Ensure GQL tags on metadata are consistent
		expect(fileMetaData.appName).to.equal('ArDrive-CLI');
		expect(fileMetaData.appVersion).to.equal('1.2.0');
		expect(fileMetaData.arFS).to.equal('0.11');
		expect(fileMetaData.contentType).to.equal('application/json');
		expect(`${fileMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
		expect(fileMetaData.entityType).to.equal('file');
		expect(`${fileMetaData.fileId}`).to.equal('9f7038c7-26bd-4856-a843-8de24b828d4e');
		expect(+fileMetaData.unixTime).to.equal(1639073846);

		// Expect stubbed transaction ID
		expect(`${fileMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field were successfully parsed
		expect(fileMetaData.name).to.equal('2');
		expect(+fileMetaData.size).to.equal(2048);
		expect(+fileMetaData.lastModifiedDate).to.equal(1639073634269);
		expect(fileMetaData.dataContentType).to.equal('unknown');
		expect(`${fileMetaData.parentFolderId}`).to.equal('6c312b3e-4778-4a18-8243-f2b346f5e7cb');
	});
});
