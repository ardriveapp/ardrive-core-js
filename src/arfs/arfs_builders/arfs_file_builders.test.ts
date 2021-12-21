import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave } from '../../../tests/stubs';
import { GQLNodeInterface } from '../../types';
import { fakeTxID } from '../../utils/constants';
import { ArFSPublicFileBuilder } from './arfs_file_builders';

describe('ArFSPublicFileBuilder', () => {
	const stubPublicFileGQLNode: Partial<GQLNodeInterface> = {
		id: `${fakeTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.11' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Tx-Id', value: 'mqOJloNlsItu0d5vyQBHhTZE4xAiezNsGiNIxoKPIVU' },
			{ name: 'Unix-Time', value: '1639073846' },
			{ name: 'Parent-Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
			{ name: 'File-Id', value: '9f7038c7-26bd-4856-a843-8de24b828d4e' }
		]
	};

	// Data JSON
	// [
	// 	{ name: 'name', value: '2' },
	// 	{ name: 'size', value: 2048 },
	// 	{ name: 'lastModifiedDate', value: 1639073634269 },
	// 	{ name: 'dataTxId', value: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c' },
	// 	{ name: 'dataContentType', value: 'unknown' }
	// ];

	it('constructs a a file from node', async () => {
		stub(fakeArweave.transactions, 'getData').resolves(
			// prettier-ignore
			// getData result for stubPublicFileGQLNode
			Uint8Array.from([
				123, 34, 110, 97, 109, 101, 34, 58, 34, 50, 34, 44, 34, 115, 105, 122, 101, 34, 58, 50, 48, 52, 56, 44,
				34, 108, 97, 115, 116, 77, 111, 100, 105, 102, 105, 101, 100, 68, 97, 116, 101, 34, 58, 49, 54, 51, 57,
				48, 55, 51, 54, 51, 52, 50, 54, 57, 44, 34, 100, 97, 116, 97, 84, 120, 73, 100, 34, 58, 34, 121, 65,
				111, 103, 97, 71, 87, 87, 89, 103, 87, 79, 53, 120, 87, 90, 101, 118, 98, 52, 53, 89, 55, 89, 82, 112,
				55, 69, 57, 105, 68, 115, 118, 107, 74, 118, 102, 82, 55, 84, 111, 57, 99, 34, 44, 34, 100, 97, 116, 97,
				67, 111, 110, 116, 101, 110, 116, 84, 121, 112, 101, 34, 58, 34, 117, 110, 107, 110, 111, 119, 110, 34,
				125
			])
		);
		const builder = ArFSPublicFileBuilder.fromArweaveNode(stubPublicFileGQLNode as GQLNodeInterface, fakeArweave);
		const fileMetaData = await builder.build(stubPublicFileGQLNode as GQLNodeInterface);
		console.log('fileMetaData', fileMetaData);

		expect(fileMetaData).to.exist;

		// TODO: Assert this information to be consistent
		// fileMetaData ArFSPublicFile {
		// 	appName: 'ArDrive-CLI',
		// 	appVersion: '1.2.0',
		// 	arFS: '0.11',
		// 	contentType: 'application/json',
		// 	driveId: EntityID { entityId: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
		// 	entityType: 'file',
		// 	name: '2',
		// 	txId: TransactionID {
		// 	  transactionId: '0000000000000000000000000000000000000000000'
		// 	},
		// 	unixTime: UnixTime { unixTime: 1639073846 },
		// 	size: ByteCount { byteCount: 2048 },
		// 	lastModifiedDate: UnixTime { unixTime: 1639073634269 },
		// 	dataTxId: TransactionID {
		// 	  transactionId: 'yAogaGWWYgWO5xWZevb45Y7YRp7E9iDsvkJvfR7To9c'
		// 	},
		// 	dataContentType: 'unknown',
		// 	parentFolderId: EntityID { entityId: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
		// 	entityId: EntityID { entityId: '9f7038c7-26bd-4856-a843-8de24b828d4e' },
		// 	fileId: EntityID { entityId: '9f7038c7-26bd-4856-a843-8de24b828d4e' }
		//   }
	});
});
