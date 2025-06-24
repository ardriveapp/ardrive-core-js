import { expect } from 'chai';
import { stub } from 'sinon';
import { fakeArweave, stubTxID } from '../../../tests/stubs';
import { expectAsyncErrorThrow } from '../../../tests/test_helpers';
import { ArFSPrivateDrive, DriveSignatureType } from '../../exports';
import { VersionedDriveKey } from '../../types/entity_key';
import { EID, GQLNodeInterface, GQLTransactionsResultInterface } from '../../types';
import { gatewayUrlForArweave } from '../../utils/common';
import { GatewayAPI } from '../../utils/gateway_api';
import { PrivateKeyData } from '../private_key_data';
import { ArFSPrivateDriveBuilder, ArFSPublicDriveBuilder, SafeArFSDriveBuilder } from './arfs_drive_builders';

const stubPublicDriveGQLNode: Partial<GQLNodeInterface> = {
	id: `${stubTxID}`,
	tags: [
		{ name: 'App-Name', value: 'ArDrive-CLI' },
		{ name: 'App-Version', value: '1.1.4' },
		{ name: 'ArFS', value: '0.15' },
		{ name: 'Content-Type', value: 'application/json' },
		{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
		{ name: 'Entity-Type', value: 'drive' },
		{ name: 'Unix-Time', value: '1638220563' },
		{ name: 'Drive-Privacy', value: 'public' },
		{ name: 'Extra-Tag', value: 'for coverage' }
	]
};

// prettier-ignore
const stubPublicDriveGetDataResult = Buffer.from(Uint8Array.from([
	123, 34, 110, 97, 109, 101, 34, 58, 34, 116, 104, 101, 45, 109, 97, 110, 105, 102, 101, 115, 116, 45, 122, 111,
	110, 101, 34, 44, 34, 114, 111, 111, 116, 70, 111, 108, 100, 101, 114, 73, 100, 34, 58, 34, 98, 52, 54, 53, 56,
	56, 51, 102, 45, 98, 52, 48, 48, 45, 52, 52, 57, 54, 45, 57, 100, 99, 53, 45, 55, 99, 100, 50, 97, 54, 102, 102,
	50, 51, 52, 99, 34, 125
]));

const gatewayApi = new GatewayAPI({
	gatewayUrl: gatewayUrlForArweave(fakeArweave),
	maxRetriesPerRequest: 1,
	initialErrorDelayMS: 1
});

describe('ArFSPublicDriveBuilder', () => {
	it('handles empty app version when building from node', async () => {
		const nodeWithEmptyAppVersion = {
			...stubPublicDriveGQLNode,
			tags: stubPublicDriveGQLNode.tags?.map((tag) => (tag.name === 'App-Version' ? { ...tag, value: '' } : tag))
		};

		const builder = ArFSPublicDriveBuilder.fromArweaveNode(nodeWithEmptyAppVersion as GQLNodeInterface, gatewayApi);
		stub(builder, 'getDataForTxID').resolves(stubPublicDriveGetDataResult);
		const driveMetaData = await builder.build(nodeWithEmptyAppVersion as GQLNodeInterface);

		expect(driveMetaData.appVersion).to.equal('');
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(`${driveMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
	});

	it('constructs expected drive from node', async () => {
		const builder = ArFSPublicDriveBuilder.fromArweaveNode(stubPublicDriveGQLNode as GQLNodeInterface, gatewayApi);
		stub(builder, 'getDataForTxID').resolves(stubPublicDriveGetDataResult);
		const driveMetaData = await builder.build(stubPublicDriveGQLNode as GQLNodeInterface);

		// Ensure GQL tags on metadata are consistent
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(driveMetaData.appVersion).to.equal('1.1.4');
		expect(driveMetaData.arFS).to.equal('0.15');
		expect(driveMetaData.contentType).to.equal('application/json');
		expect(`${driveMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
		expect(driveMetaData.entityType).to.equal('drive');
		expect(+driveMetaData.unixTime).to.equal(1638220563);
		expect(driveMetaData.drivePrivacy).to.equal('public');

		// Expect stubbed transaction ID
		expect(`${driveMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field were successfully parsed
		expect(driveMetaData.name).to.equal('the-manifest-zone');
		expect(`${driveMetaData.rootFolderId}`).to.equal('b465883f-b400-4496-9dc5-7cd2a6ff234c');
	});

	it('returns the expected gql tags', () => {
		const builder = ArFSPublicDriveBuilder.fromArweaveNode(stubPublicDriveGQLNode as GQLNodeInterface, gatewayApi);
		expect(builder.getGqlQueryParameters()).to.deep.equal([
			{ name: 'Drive-Id', value: 'e93cf9c4-5f20-4d7a-87c4-034777cbb51e' },
			{ name: 'Entity-Type', value: 'drive' },
			{ name: 'Drive-Privacy', value: 'public' }
		]);
	});

	it('constructs the expected public drive when stubbing graph gql post result', async () => {
		stub(gatewayApi, 'gqlRequest').resolves({
			edges: [{ node: stubPublicDriveGQLNode }]
		} as GQLTransactionsResultInterface);

		const builder = new ArFSPublicDriveBuilder({
			entityId: EID('e93cf9c4-5f20-4d7a-87c4-034777cbb51e'),
			gatewayApi
		});
		stub(builder, 'getDataForTxID').resolves(stubPublicDriveGetDataResult);

		const driveMetaData = await builder.build();

		expect(`${driveMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
		expect(driveMetaData.entityType).to.equal('drive');
	});

	it('throws an error when no edges are found in the gql response', async () => {
		// prettier-ignore
		stub(gatewayApi, 'gqlRequest').resolves({
				edges: []
			} as unknown as GQLTransactionsResultInterface);

		const builder = new ArFSPublicDriveBuilder({
			entityId: EID('e93cf9c4-5f20-4d7a-87c4-034777cbb51e'),
			gatewayApi
		});
		stub(builder, 'getDataForTxID').resolves(stubPublicDriveGetDataResult);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(),
			errorMessage: 'Entity with ID e93cf9c4-5f20-4d7a-87c4-034777cbb51e not found!'
		});
	});

	it('fromArweaveNode method throws an error Drive-Id tag is missing', () => {
		const stubNodeWithoutDriveId = {
			...stubPublicDriveGQLNode,
			tags: stubPublicDriveGQLNode.tags?.filter((t) => t.name !== 'Drive-Id')
		};

		expect(() =>
			ArFSPublicDriveBuilder.fromArweaveNode(stubNodeWithoutDriveId as GQLNodeInterface, gatewayApi)
		).to.throw(Error, 'Drive-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPublicDriveGQLNode,
			tags: stubPublicDriveGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = ArFSPublicDriveBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			gatewayApi
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid drive state'
		});
	});
});

const stubPrivateDriveGQLNode: Partial<GQLNodeInterface> = {
	id: `${stubTxID}`,
	tags: [
		{ name: 'App-Name', value: 'ArDrive-CLI' },
		{ name: 'App-Version', value: '1.1.2' },
		{ name: 'ArFS', value: '0.15' },
		{ name: 'Content-Type', value: 'application/octet-stream' },
		{ name: 'Drive-Id', value: '5ca7ddfe-effa-4fc5-8796-8f3e0502854a' },
		{ name: 'Entity-Type', value: 'drive' },
		{ name: 'Unix-Time', value: '1637266840' },
		{ name: 'Cipher', value: 'AES256-GCM' },
		{ name: 'Cipher-IV', value: 'bJxvzEia87agj770' },
		{ name: 'Drive-Privacy', value: 'private' },
		{ name: 'Drive-Auth-Mode', value: 'password' },
		{ name: 'Extra-Tag', value: 'for coverage' }
	]
};

const driveKeyForStubPrivateDrive = new VersionedDriveKey(
	Buffer.from('VTAOuxuewJbRRFeCXiFifHipwJKXzXKxvZaKqyCht/s', 'base64'),
	DriveSignatureType.v1
);

// prettier-ignore
const stubPrivateDriveGetDataResult = Buffer.from(Uint8Array.from([
	233, 129, 16, 177, 200, 130, 75, 210, 22, 62, 0, 84, 34, 208, 19, 112, 9, 67, 233, 86, 158, 0, 239, 24, 54, 182, 81,
	146, 70, 148, 76, 123, 4, 31, 129, 79, 5, 133, 218, 94, 200, 54, 254, 235, 93, 164, 118, 112, 61, 162, 31, 149, 135,
	129, 71, 121, 242, 251, 103, 24, 103, 126, 234, 173, 111, 250, 68, 22, 253, 19, 183, 79, 210, 239, 145, 124, 18,
	114, 123, 249, 169, 92, 37, 217, 64, 84, 226, 121
]));

describe('ArFSPrivateDriveBuilder', () => {
	it('handles empty app version when building from node', async () => {
		const nodeWithEmptyAppVersion = {
			...stubPrivateDriveGQLNode,
			tags: stubPrivateDriveGQLNode.tags?.map((tag) => (tag.name === 'App-Version' ? { ...tag, value: '' } : tag))
		};

		const builder = ArFSPrivateDriveBuilder.fromArweaveNode(
			nodeWithEmptyAppVersion as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateDrive
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateDriveGetDataResult);

		const driveMetaData = await builder.build(nodeWithEmptyAppVersion as GQLNodeInterface);

		expect(driveMetaData.appVersion).to.equal('');
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(`${driveMetaData.driveId}`).to.equal('5ca7ddfe-effa-4fc5-8796-8f3e0502854a');
	});

	it('constructs expected drive from node', async () => {
		const builder = ArFSPrivateDriveBuilder.fromArweaveNode(
			stubPrivateDriveGQLNode as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateDrive
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateDriveGetDataResult);

		const driveMetaData = await builder.build(stubPrivateDriveGQLNode as GQLNodeInterface);

		// Ensure GQL tags on metadata are consistent
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(driveMetaData.appVersion).to.equal('1.1.2');
		expect(driveMetaData.arFS).to.equal('0.15');
		expect(driveMetaData.contentType).to.equal('application/octet-stream');
		expect(`${driveMetaData.driveId}`).to.equal('5ca7ddfe-effa-4fc5-8796-8f3e0502854a');
		expect(driveMetaData.entityType).to.equal('drive');
		expect(+driveMetaData.unixTime).to.equal(1637266840);
		expect(driveMetaData.drivePrivacy).to.equal('private');
		expect(driveMetaData.driveAuthMode).to.equal('password');

		// Expect stubbed transaction ID
		expect(`${driveMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field was successfully parsed
		expect(driveMetaData.name).to.equal('drive-1');
		expect(`${driveMetaData.rootFolderId}`).to.equal('dde0a0ef-6cd2-45d1-a9b0-97350d9fec21');
	});

	it('fromArweaveNode method throws an error Drive-Id tag is missing', () => {
		const stubNodeWithoutDriveId = {
			...stubPrivateDriveGQLNode,
			tags: stubPrivateDriveGQLNode.tags?.filter((t) => t.name !== 'Drive-Id')
		};

		expect(() =>
			ArFSPrivateDriveBuilder.fromArweaveNode(
				stubNodeWithoutDriveId as GQLNodeInterface,
				gatewayApi,
				driveKeyForStubPrivateDrive
			)
		).to.throw(Error, 'Drive-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPrivateDriveGQLNode,
			tags: stubPrivateDriveGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = ArFSPrivateDriveBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateDrive
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid drive state'
		});
	});

	it('returns the expected gql tags', () => {
		const builder = ArFSPrivateDriveBuilder.fromArweaveNode(
			stubPrivateDriveGQLNode as GQLNodeInterface,
			gatewayApi,
			driveKeyForStubPrivateDrive
		);
		expect(builder.getGqlQueryParameters()).to.deep.equal([
			{ name: 'Drive-Id', value: '5ca7ddfe-effa-4fc5-8796-8f3e0502854a' },
			{ name: 'Entity-Type', value: 'drive' },
			{ name: 'Drive-Privacy', value: 'private' }
		]);
	});
});

describe('SafeArFSDriveBuilder', () => {
	const stubPrivateKeyData = new PrivateKeyData({ driveKeys: [driveKeyForStubPrivateDrive] });
	const emptyPrivateKeyData = new PrivateKeyData({});

	it('handles empty app version when building public drive', async () => {
		const nodeWithEmptyAppVersion = {
			...stubPublicDriveGQLNode,
			tags: stubPublicDriveGQLNode.tags?.map((tag) => (tag.name === 'App-Version' ? { ...tag, value: '' } : tag))
		};

		stub(gatewayApi, 'gqlRequest').resolves({
			edges: [{ node: nodeWithEmptyAppVersion }]
		} as GQLTransactionsResultInterface);

		const builder = new SafeArFSDriveBuilder({
			entityId: EID('e93cf9c4-5f20-4d7a-87c4-034777cbb51e'),
			gatewayApi,
			privateKeyData: emptyPrivateKeyData
		});

		stub(builder, 'getDataForTxID').resolves(stubPublicDriveGetDataResult);

		const driveMetaData = await builder.build();

		expect(driveMetaData.appVersion).to.equal('');
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(`${driveMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
	});

	it('handles empty app version when building private drive', async () => {
		const nodeWithEmptyAppVersion = {
			...stubPrivateDriveGQLNode,
			tags: stubPrivateDriveGQLNode.tags?.map((tag) => (tag.name === 'App-Version' ? { ...tag, value: '' } : tag))
		};

		stub(gatewayApi, 'gqlRequest').resolves({
			edges: [{ node: nodeWithEmptyAppVersion }]
		} as GQLTransactionsResultInterface);

		const builder = new SafeArFSDriveBuilder({
			entityId: EID('5ca7ddfe-effa-4fc5-8796-8f3e0502854a'),
			gatewayApi,
			privateKeyData: stubPrivateKeyData
		});

		stub(builder, 'getDataForTxID').resolves(stubPrivateDriveGetDataResult);

		const driveMetaData = (await builder.build()) as ArFSPrivateDrive;

		expect(driveMetaData.appVersion).to.equal('');
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(`${driveMetaData.driveId}`).to.equal('5ca7ddfe-effa-4fc5-8796-8f3e0502854a');
	});

	it('constructs expected public drive from node', async () => {
		const builder = SafeArFSDriveBuilder.fromArweaveNode(
			stubPublicDriveGQLNode as GQLNodeInterface,
			gatewayApi,
			emptyPrivateKeyData
		);
		stub(builder, 'getDataForTxID').resolves(stubPublicDriveGetDataResult);

		const driveMetaData = await builder.build(stubPublicDriveGQLNode as GQLNodeInterface);

		// Ensure GQL tags on metadata are consistent
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(driveMetaData.appVersion).to.equal('1.1.4');
		expect(driveMetaData.arFS).to.equal('0.15');
		expect(driveMetaData.contentType).to.equal('application/json');
		expect(`${driveMetaData.driveId}`).to.equal('e93cf9c4-5f20-4d7a-87c4-034777cbb51e');
		expect(driveMetaData.entityType).to.equal('drive');
		expect(+driveMetaData.unixTime).to.equal(1638220563);
		expect(driveMetaData.drivePrivacy).to.equal('public');

		// Expect stubbed transaction ID
		expect(`${driveMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field were successfully parsed
		expect(driveMetaData.name).to.equal('the-manifest-zone');
		expect(`${driveMetaData.rootFolderId}`).to.equal('b465883f-b400-4496-9dc5-7cd2a6ff234c');
	});

	it('constructs and decrypts expected private drive from node', async () => {
		const builder = SafeArFSDriveBuilder.fromArweaveNode(
			stubPrivateDriveGQLNode as GQLNodeInterface,
			gatewayApi,
			stubPrivateKeyData
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateDriveGetDataResult);

		const driveMetaData = (await builder.build(stubPrivateDriveGQLNode as GQLNodeInterface)) as ArFSPrivateDrive;

		// Ensure GQL tags on metadata are consistent
		expect(driveMetaData.appName).to.equal('ArDrive-CLI');
		expect(driveMetaData.appVersion).to.equal('1.1.2');
		expect(driveMetaData.arFS).to.equal('0.15');
		expect(driveMetaData.contentType).to.equal('application/octet-stream');
		expect(`${driveMetaData.driveId}`).to.equal('5ca7ddfe-effa-4fc5-8796-8f3e0502854a');
		expect(driveMetaData.entityType).to.equal('drive');
		expect(+driveMetaData.unixTime).to.equal(1637266840);
		expect(driveMetaData.drivePrivacy).to.equal('private');
		expect(driveMetaData.driveAuthMode).to.equal('password');

		// Expect stubbed transaction ID
		expect(`${driveMetaData.txId}`).to.equal('0000000000000000000000000000000000000000001');

		// Verify that the data JSON field were successfully decrypted
		expect(driveMetaData.name).to.equal('drive-1');
		expect(`${driveMetaData.rootFolderId}`).to.equal('dde0a0ef-6cd2-45d1-a9b0-97350d9fec21');

		// Assert no keys are displayed with the safe builder
		expect(driveMetaData.driveKey).to.be.undefined;
	});

	it('gracefully fails decrypting private drives, replacing values with "ENCRYPTED"', async () => {
		const builder = SafeArFSDriveBuilder.fromArweaveNode(
			stubPrivateDriveGQLNode as GQLNodeInterface,
			gatewayApi,
			emptyPrivateKeyData
		);
		stub(builder, 'getDataForTxID').resolves(stubPrivateDriveGetDataResult);

		const driveMetaData = await builder.build(stubPrivateDriveGQLNode as GQLNodeInterface);

		// Verify that the data JSON field were successfully decrypted
		expect(driveMetaData.name).to.equal('ENCRYPTED');
		expect(`${driveMetaData.rootFolderId}`).to.equal('ENCRYPTED');
	});

	it('fromArweaveNode method throws an error Drive-Id tag is missing', () => {
		const stubNodeWithoutDriveId = {
			...stubPrivateDriveGQLNode,
			tags: stubPrivateDriveGQLNode.tags?.filter((t) => t.name !== 'Drive-Id')
		};

		expect(() =>
			SafeArFSDriveBuilder.fromArweaveNode(
				stubNodeWithoutDriveId as GQLNodeInterface,
				gatewayApi,
				stubPrivateKeyData
			)
		).to.throw(Error, 'Drive-ID tag missing!');
	});

	it('fails to build if GQL tags are missing', async () => {
		const stubNodeWithoutEntityType = {
			...stubPrivateDriveGQLNode,
			tags: stubPrivateDriveGQLNode.tags?.filter((t) => t.name !== 'Entity-Type')
		};
		const builder = SafeArFSDriveBuilder.fromArweaveNode(
			stubNodeWithoutEntityType as GQLNodeInterface,
			gatewayApi,
			stubPrivateKeyData
		);

		await expectAsyncErrorThrow({
			promiseToError: builder.build(stubNodeWithoutEntityType as GQLNodeInterface),
			errorMessage: 'Invalid drive state'
		});
	});

	it('returns the expected gql tags', () => {
		const builder = SafeArFSDriveBuilder.fromArweaveNode(
			stubPrivateDriveGQLNode as GQLNodeInterface,
			gatewayApi,
			stubPrivateKeyData
		);

		expect(builder.getGqlQueryParameters()).to.deep.equal([
			{ name: 'Drive-Id', value: '5ca7ddfe-effa-4fc5-8796-8f3e0502854a' },
			{ name: 'Entity-Type', value: 'drive' }
		]);
	});
});
