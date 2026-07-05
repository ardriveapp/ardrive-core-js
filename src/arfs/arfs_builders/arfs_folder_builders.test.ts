import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave, stubTxID } from '../../../tests/stubs';
import { expectAsyncErrorThrow } from '../../../tests/test_helpers';
import { DriveSignatureType, GQLNodeInterface } from '../../types';
import { VersionedDriveKey } from '../../types/entity_key';
import { gatewayUrlForArweave } from '../../utils/common';
import { GatewayAPI } from '../../utils/gateway_api';
import { ArFSPrivateFolderBuilder, ArFSPublicFolderBuilder } from './arfs_folder_builders';

const gatewayApi = new GatewayAPI({
	gatewayUrl: gatewayUrlForArweave(fakeArweave),
	maxRetriesPerRequest: 1,
	initialErrorDelayMS: 1
});

describe('ArFSPublicFolderBuilder', () => {
	const stubPublicFolderGQLNode: Partial<GQLNodeInterface> = {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.1.4' },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Unix-Time', value: '1638240951' },
			{ name: 'Parent-Folder-Id', value: 'b465883f-b400-4496-9dc5-7cd2a6ff234c' },
			{ name: 'Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
			{ name: 'Extra-Tag', value: 'for coverage' }
		]
	};

	// prettier-ignore
	const stubPublicFolderGetDataResult = Buffer.from(Uint8Array.from([
		123, 34, 110, 97, 109, 101, 34, 58, 34, 98, 117, 105, 108,
		100, 45, 114, 101, 97, 99, 116, 45, 97, 112, 112, 34, 125
	]));

	it('constructs expected folder from node', async () => {
		const builder = ArFSPublicFolderBuilder.fromArweaveNode(
			stubPublicFolderGQLNode as GQLNodeInterface,
			gatewayApi
		);
		stub(builder, 'getDataForTxID').resolves(stubPublicFolderGetDataResult);

		const folderMetaData = await builder.build(stubPublicFolderGQLNode as GQLNodeInterface);

		// Ensure GQL tags on metadata are consistent
		expect(folderMetaData.appName).to.equal('ArDrive-CLI');
		expect(folderMetaData.appVersion).to.equal('1.1.4');
		expect(folderMetaData.arFS).to.equal('0.15');
		expect(folderMetaData.contentType).to.equal('application/json');
		expect(`${folderMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
		expect(folderMetaData.entityType).to.equal('folder');
		expect(`${folderMetaData.entityId}`).to.equal('6c312b3e-4778-4a18-8243-f2b346f5e7cb');
		expect(+folderMetaData.unixTime).to.equal(1638240951);

		// Expect stubbed transaction ID
		expect(`${folderMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field were successfully parsed
		expect(folderMetaData.name).to.equal('build-react-app');
		expect(`${folderMetaData.parentFolderId}`).to.equal('b465883f-b400-4496-9dc5-7cd2a6ff234c');
	});

	// CORE-5: a real owner's public drive failed to list entirely, throwing
	// "Unix time must be a positive integer!" because one folder entity carried a
	// malformed Unix-Time tag. Building must degrade gracefully (clamp to epoch)
	// so the entity still lists instead of aborting the whole drive reconstruction.
	['-1638240951', '1.5', 'not-a-number', 'Infinity'].forEach((badUnixTime) => {
		it(`builds a folder with clamped epoch time when Unix-Time tag is invalid ("${badUnixTime}")`, async () => {
			const stubNodeWithBadUnixTime = {
				...stubPublicFolderGQLNode,
				tags: stubPublicFolderGQLNode.tags?.map((t) =>
					t.name === 'Unix-Time' ? { name: 'Unix-Time', value: badUnixTime } : t
				)
			};
			const builder = ArFSPublicFolderBuilder.fromArweaveNode(
				stubNodeWithBadUnixTime as GQLNodeInterface,
				gatewayApi
			);
			stub(builder, 'getDataForTxID').resolves(stubPublicFolderGetDataResult);

			// Must NOT throw — the listing should complete for this entity
			const folderMetaData = await builder.build(stubNodeWithBadUnixTime as GQLNodeInterface);

			// Entity is preserved with a clamped epoch timestamp
			expect(+folderMetaData.unixTime).to.equal(0);
			// Other fields still parse correctly, proving the entity is not dropped
			expect(`${folderMetaData.entityId}`).to.equal('6c312b3e-4778-4a18-8243-f2b346f5e7cb');
			expect(folderMetaData.name).to.equal('build-react-app');
		});
	});

	it('returns the expected gql tags', () => {
		const builder = ArFSPublicFolderBuilder.fromArweaveNode(
			stubPublicFolderGQLNode as GQLNodeInterface,
			gatewayApi
		);
		expect(builder.getGqlQueryParameters()).to.deep.equal([
			{ name: 'Folder-Id', value: '6c312b3e-4778-4a18-8243-f2b346f5e7cb' },
			{ name: 'Entity-Type', value: 'folder' }
		]);
	});

	it('fromArweaveNode method throws an error Folder-Id tag is missing', () => {
		const stubNodeWithoutFolderId = {
			...stubPublicFolderGQLNode,
			tags: stubPublicFolderGQLNode.tags?.filter((t) => t.name !== 'Folder-Id')
		};

		expect(() =>
			ArFSPublicFolderBuilder.fromArweaveNode(stubNodeWithoutFolderId as GQLNodeInterface, gatewayApi)
		).to.throw(Error, 'Folder-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPublicFolderGQLNode,
			tags: stubPublicFolderGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = ArFSPublicFolderBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			gatewayApi
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid public folder state'
		});
	});
});

describe('ArFSPrivateFolderBuilder', () => {
	const stubPrivateFolderGQLNode: Partial<GQLNodeInterface> = {
		id: `${stubTxID}`,
		tags: [
			{ name: 'App-Name', value: 'ArDrive-CLI' },
			{ name: 'App-Version', value: '1.1.2' },
			{ name: 'ArFS', value: '0.15' },
			{ name: 'Content-Type', value: 'application/octet-stream' },
			{ name: 'Drive-Id', value: '5ca7ddfe-effa-4fc5-8796-8f3e0502854a' },
			{ name: 'Entity-Type', value: 'folder' },
			{ name: 'Unix-Time', value: '1637266839' },
			{ name: 'Folder-Id', value: 'dde0a0ef-6cd2-45d1-a9b0-97350d9fec21' },
			{ name: 'Cipher', value: 'AES256-GCM' },
			{ name: 'Cipher-IV', value: 'reHa0/wqVXM8cZMV' },
			{ name: 'Extra-Tag', value: 'for coverage' }
		]
	};

	const driveKeyForStubPrivateFolder = new VersionedDriveKey(
		Buffer.from('VTAOuxuewJbRRFeCXiFifHipwJKXzXKxvZaKqyCht/s', 'base64'),
		DriveSignatureType.v1
	);

	// prettier-ignore
	const stubPrivateFolderGetDataResult = Buffer.from(Uint8Array.from([
		162,  27, 165,  86, 125, 152,  27,
		194, 169, 118, 237, 181, 104, 108,
		241, 209,  78, 150, 182,  23, 128,
		 60, 158, 248, 149, 205,  62, 203,
		105, 144, 222, 188, 176,  29
	  ]));

	it('constructs expected folder from node', async () => {
		const builder = ArFSPrivateFolderBuilder.fromArweaveNode(
			stubPrivateFolderGQLNode as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateFolder
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateFolderGetDataResult);

		const folderMetaData = await builder.build(stubPrivateFolderGQLNode as GQLNodeInterface);

		// Ensure GQL tags on metadata are consistent
		expect(folderMetaData.appName).to.equal('ArDrive-CLI');
		expect(folderMetaData.appVersion).to.equal('1.1.2');
		expect(folderMetaData.arFS).to.equal('0.15');
		expect(folderMetaData.contentType).to.equal('application/octet-stream');
		expect(`${folderMetaData.driveId}`).to.equal('5ca7ddfe-effa-4fc5-8796-8f3e0502854a');
		expect(folderMetaData.entityType).to.equal('folder');
		expect(`${folderMetaData.entityId}`).to.equal('dde0a0ef-6cd2-45d1-a9b0-97350d9fec21');
		expect(+folderMetaData.unixTime).to.equal(1637266839);

		// Expect stubbed transaction ID
		expect(`${folderMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field was successfully parsed
		expect(folderMetaData.name).to.equal('drive-1');
		expect(`${folderMetaData.parentFolderId}`).to.equal('root folder');
	});

	// CORE-5: same tolerance for private drives — one entity with a malformed
	// Unix-Time tag must not abort the whole private drive listing.
	it('builds a private folder with clamped epoch time when Unix-Time tag is invalid', async () => {
		const stubNodeWithBadUnixTime = {
			...stubPrivateFolderGQLNode,
			tags: stubPrivateFolderGQLNode.tags?.map((t) =>
				t.name === 'Unix-Time' ? { name: 'Unix-Time', value: '-1637266839' } : t
			)
		};
		const builder = ArFSPrivateFolderBuilder.fromArweaveNode(
			stubNodeWithBadUnixTime as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateFolder
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateFolderGetDataResult);

		// Must NOT throw — the entity is preserved with a clamped epoch timestamp
		const folderMetaData = await builder.build(stubNodeWithBadUnixTime as GQLNodeInterface);

		expect(+folderMetaData.unixTime).to.equal(0);
		expect(`${folderMetaData.entityId}`).to.equal('dde0a0ef-6cd2-45d1-a9b0-97350d9fec21');
		expect(folderMetaData.name).to.equal('drive-1');
	});

	it('fromArweaveNode method throws an error Folder-Id tag is missing', () => {
		const stubNodeWithoutFolderId = {
			...stubPrivateFolderGQLNode,
			tags: stubPrivateFolderGQLNode.tags?.filter((t) => t.name !== 'Folder-Id')
		};

		expect(() =>
			ArFSPrivateFolderBuilder.fromArweaveNode(
				stubNodeWithoutFolderId as GQLNodeInterface,
				gatewayApi,
				driveKeyForStubPrivateFolder
			)
		).to.throw(Error, 'Folder-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPrivateFolderGQLNode,
			tags: stubPrivateFolderGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = ArFSPrivateFolderBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateFolder
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid private folder state'
		});
	});
});
