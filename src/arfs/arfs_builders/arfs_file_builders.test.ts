import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave, stubTxID } from '../../../tests/stubs';
import { expectAsyncErrorThrow } from '../../../tests/test_helpers';
import { EntityKey, GQLNodeInterface } from '../../types';
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
			{ name: 'Cipher-IV', value: 'nzpsVIcV1vymvT/h' },
			{ name: 'Extra-Tag', value: 'for coverage' }
		]
	};

	const driveKeyForStubPrivateFile = new EntityKey(
		Buffer.from('VTAOuxuewJbRRFeCXiFifHipwJKXzXKxvZaKqyCht/s', 'base64')
	);

	// prettier-ignore
	const stubPrivateFileGetDataResult = Buffer.from(Uint8Array.from([
		191, 33, 16, 68, 196, 236, 87, 215, 82, 142, 114, 45, 167, 253, 197, 161, 23, 85, 54, 148, 155, 255, 204, 0, 4,
		86, 52, 113, 88, 185, 50, 158, 169, 23, 118, 123, 120, 85, 233, 106, 227, 6, 71, 99, 254, 163, 237, 236, 237,
		199, 10, 37, 233, 120, 63, 81, 245, 93, 77, 246, 191, 226, 1, 83, 248, 194, 69, 62, 69, 72, 90, 47, 41, 32, 32,
		208, 183, 50, 17, 133, 246, 141, 120, 134, 135, 166, 76, 69, 84, 202, 166, 164, 255, 43, 225, 218, 153, 246,
		195, 178, 174, 168, 85, 129, 133, 220, 120, 129, 14, 222, 186, 134, 86, 1, 51, 15, 113, 156, 147, 216, 156, 15,
		11, 165, 204, 211, 204, 216, 138, 210, 74, 40, 117, 187, 160, 211, 161, 250, 132, 240, 122, 193, 166, 132, 139,
		125, 178, 34, 4, 33, 108, 187, 176, 191, 151, 146, 234, 138
	]));

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
