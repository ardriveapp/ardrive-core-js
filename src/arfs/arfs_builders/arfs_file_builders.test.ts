import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave, stubTxID } from '../../../tests/stubs';
import { expectAsyncErrorThrow } from '../../../tests/test_helpers';
import { GQLNodeInterface } from '../../types';
import { ArFSPrivateFileBuilder, ArFSPublicFileBuilder } from './arfs_file_builders';

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
			{ name: 'File-Id', value: '9f7038c7-26bd-4856-a843-8de24b828d4e' },
			{ name: 'Extra-Tag', value: 'for coverage' }
		]
	};

	// prettier-ignore
	const stubPublicFileGetDataResult = Buffer.from(Uint8Array.from([
		123, 34, 110, 97, 109, 101, 34, 58, 34, 50, 34, 44, 34, 115, 105, 122, 101, 34, 58, 50, 48, 52, 56, 44, 34, 108,
		97, 115, 116, 77, 111, 100, 105, 102, 105, 101, 100, 68, 97, 116, 101, 34, 58, 49, 54, 51, 57, 48, 55, 51, 54,
		51, 52, 50, 54, 57, 44, 34, 100, 97, 116, 97, 84, 120, 73, 100, 34, 58, 34, 121, 65, 111, 103, 97, 71, 87, 87,
		89, 103, 87, 79, 53, 120, 87, 90, 101, 118, 98, 52, 53, 89, 55, 89, 82, 112, 55, 69, 57, 105, 68, 115, 118, 107,
		74, 118, 102, 82, 55, 84, 111, 57, 99, 34, 44, 34, 100, 97, 116, 97, 67, 111, 110, 116, 101, 110, 116, 84, 121,
		112, 101, 34, 58, 34, 117, 110, 107, 110, 111, 119, 110, 34, 125
	]));

	it('constructs expected file from node', async () => {
		const builder = ArFSPublicFileBuilder.fromArweaveNode(stubPublicFileGQLNode as GQLNodeInterface, fakeArweave);
		stub(builder, 'getDataForTxID').resolves(stubPublicFileGetDataResult);

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

	it('returns the expected gql tags', () => {
		const builder = ArFSPublicFileBuilder.fromArweaveNode(stubPublicFileGQLNode as GQLNodeInterface, fakeArweave);
		expect(builder.getGqlQueryParameters()).to.deep.equal([
			{ name: 'File-Id', value: '9f7038c7-26bd-4856-a843-8de24b828d4e' },
			{ name: 'Entity-Type', value: 'file' }
		]);
	});

	it('fromArweaveNode method throws an error File-Id tag is missing', () => {
		const stubNodeWithoutFileId = {
			...stubPublicFileGQLNode,
			tags: stubPublicFileGQLNode.tags?.filter((t) => t.name !== 'File-Id')
		};

		expect(() =>
			ArFSPublicFileBuilder.fromArweaveNode(stubNodeWithoutFileId as GQLNodeInterface, fakeArweave)
		).to.throw(Error, 'File-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPublicFileGQLNode,
			tags: stubPublicFileGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = ArFSPublicFileBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			fakeArweave
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid file state'
		});
	});
});

describe('ArFSPrivateFileBuilder', () => {
	const stubPrivateFileGQLNode: Partial<GQLNodeInterface> = {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.2.0' },
			{ name: 'ArFS', value: '0.11' },
			{ name: 'Content-Type', value: 'application/octet-stream' },
			{ name: 'Drive-Id', value: '5ca7ddfe-effa-4fc5-8796-8f3e0502854a' },
			{ name: 'Entity-Type', value: 'file' },
			{ name: 'Unix-Time', value: '1639073649' },
			{ name: 'Parent-Folder-Id', value: 'dde0a0ef-6cd2-45d1-a9b0-97350d9fec21' },
			{ name: 'File-Id', value: '238e50a9-937b-4160-a3ac-5f8bb0325b70' },
			{ name: 'Cipher', value: 'AES256-GCM' },
			{ name: 'Cipher-IV', value: 'OqFPdYxI144JrO66' },
			{ name: 'Extra-Tag', value: 'for coverage' }
		]
	};

	const driveKeyForStubPrivateFile = Buffer.from('VTAOuxuewJbRRFeCXiFifHipwJKXzXKxvZaKqyCht/s', 'base64');

	// prettier-ignore
	const stubPrivateFileGetDataResult = Buffer.from(
		Uint8Array.from([
			202, 4, 129, 120, 14, 36, 57, 46, 185, 160, 207, 220, 169, 215, 183, 75, 203, 51, 40, 193, 40, 101, 20, 194,
			64, 105, 113, 153, 131, 14, 226, 214, 45, 123, 112, 93, 90, 74, 120, 111, 149, 45, 75, 41, 120, 129, 216,
			118, 200, 44, 4, 59, 27, 182, 144, 60, 245, 132, 39, 105, 239, 59, 204, 124, 141, 177, 75, 198, 82, 209, 74,
			110, 90, 62, 0, 161, 241, 40, 103, 135, 237, 133, 101, 187, 79, 75, 113, 30, 52, 186, 218, 181, 99, 8, 112,
			177, 174, 171, 63, 77, 105, 144, 20, 203, 253, 55, 233, 212, 71, 35, 119, 170, 238, 30, 1, 53, 42, 212, 69,
			218, 11, 171, 189, 46, 175, 5, 225, 92, 191, 158, 129, 183, 94, 188, 112, 3, 188, 63, 150, 18, 43, 218, 64,
			93, 83, 51, 174, 149, 8, 88, 33, 232, 102, 223, 48, 117, 160, 157, 62, 105, 226, 233, 249, 92, 4, 219, 255,
			68, 254, 183, 106, 116, 201, 153, 220, 103, 105, 168, 244, 191, 126, 173, 121, 208, 211, 204, 181, 7, 125,
			76, 92, 182, 144, 210, 28, 100, 160, 110, 222, 40, 53, 87, 71, 199, 81, 143, 235, 100, 149, 51, 211, 103,
			119, 112
		])
	);

	it('constructs expected file from node', async () => {
		const builder = ArFSPrivateFileBuilder.fromArweaveNode(
			stubPrivateFileGQLNode as GQLNodeInterface,
			fakeArweave,
			driveKeyForStubPrivateFile
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateFileGetDataResult);

		const fileMetaData = await builder.build(stubPrivateFileGQLNode as GQLNodeInterface);
		// Ensure GQL tags on metadata are consistent
		expect(fileMetaData.appName).to.equal('ArDrive-CLI');
		expect(fileMetaData.appVersion).to.equal('1.2.0');
		expect(fileMetaData.arFS).to.equal('0.11');
		expect(fileMetaData.contentType).to.equal('application/octet-stream');
		expect(`${fileMetaData.driveId}`).to.equal('5ca7ddfe-effa-4fc5-8796-8f3e0502854a');
		expect(fileMetaData.entityType).to.equal('file');
		expect(`${fileMetaData.fileId}`).to.equal('238e50a9-937b-4160-a3ac-5f8bb0325b70');
		expect(+fileMetaData.unixTime).to.equal(1639073649);

		// Expect stubbed transaction ID
		expect(`${fileMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field was successfully parsed
		expect(fileMetaData.name).to.equal('2');
		expect(+fileMetaData.size).to.equal(2048);
		expect(+fileMetaData.lastModifiedDate).to.equal(1639073634269);
		expect(fileMetaData.dataContentType).to.equal('unknown');
		expect(`${fileMetaData.parentFolderId}`).to.equal('dde0a0ef-6cd2-45d1-a9b0-97350d9fec21');
	});

	it('fromArweaveNode method throws an error File-Id tag is missing', () => {
		const stubNodeWithoutFileId = {
			...stubPrivateFileGQLNode,
			tags: stubPrivateFileGQLNode.tags?.filter((t) => t.name !== 'File-Id')
		};

		expect(() =>
			ArFSPrivateFileBuilder.fromArweaveNode(
				stubNodeWithoutFileId as GQLNodeInterface,
				fakeArweave,
				driveKeyForStubPrivateFile
			)
		).to.throw(Error, 'File-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPrivateFileGQLNode,
			tags: stubPrivateFileGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = ArFSPrivateFileBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			fakeArweave,
			driveKeyForStubPrivateFile
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid file state'
		});
	});
});
