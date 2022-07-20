/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Transaction from 'arweave/node/lib/transaction';
import { expect } from 'chai';
import { FileMetaDataTransactionData } from '../../src/arfs/arfs_builders/arfs_file_builders';
import {
	ArFSEntity,
	ArFSPrivateDrive,
	ArFSPrivateFile,
	ArFSPrivateFileWithPaths,
	ArFSPrivateFolder,
	ArFSPrivateFolderWithPaths,
	ArFSPublicDrive,
	ArFSPublicFile,
	ArFSPublicFileWithPaths,
	ArFSPublicFolder,
	ArFSPublicFolderWithPaths
} from '../../src/arfs/arfs_entities';
import {
	DriveID,
	TransactionID,
	CustomMetaDataGqlTags,
	UnixTime,
	FolderID,
	FileID,
	DataContentType,
	ByteCount,
	EntityMetaDataTransactionData,
	GQLTagInterface
} from '../../src/types';
import { getDecodedTags } from '../test_helpers';

interface AssertEntityExpectationsParams<T = ArFSEntity> {
	entity: T;
	driveId: DriveID;
	metaDataTxId: TransactionID;
	entityName: string;
	customMetaData?: CustomMetaDataGqlTags;
}

function assertBaseArFSEntityExpectations({
	entity,
	driveId,
	entityName,
	metaDataTxId,
	customMetaData
}: AssertEntityExpectationsParams): void {
	expect(entity.appName).to.equal('ArLocal Integration Test');
	expect(entity.appVersion).to.equal('FAKE_VERSION');
	expect(entity.arFS).to.equal('0.11');
	expect(`${entity.driveId}`, 'drive ID').to.equal(`${driveId}`);
	expect(entity.unixTime).to.be.an.instanceOf(UnixTime);
	expect(entity.name).to.equal(entityName);
	expect(`${entity.txId}`).to.equal(`${metaDataTxId}`);

	if (customMetaData) {
		assertCustomMetaData(entity, customMetaData);
	}
}

function assertCustomMetaData(entity: ArFSEntity, customMetaData: CustomMetaDataGqlTags) {
	const customMetaDataEntries = Object.entries(customMetaData);
	for (const [key, value] of customMetaDataEntries) {
		// Without serialization, all custom metadata will be found on the customMetaData field
		expect(entity.customMetaData?.[key]).to.deep.equal(value);
	}

	const serializedEntity: Record<string, string | string[]> = JSON.parse(JSON.stringify(entity));
	for (const [key, value] of customMetaDataEntries) {
		// After serialization, all custom metadata will be adjacent to ArFS metadata
		expect(serializedEntity[key]).to.deep.equal(value);
	}
}

function assertArFSPublicExpectations(
	params: AssertEntityExpectationsParams<ArFSPublicDrive | ArFSPublicFolder | ArFSPublicFile>
): void {
	expect(params.entity.contentType).to.equal('application/json');
	assertBaseArFSEntityExpectations(params);
}

function assertArFSPrivateExpectations(
	params: AssertEntityExpectationsParams<ArFSPrivateDrive | ArFSPrivateFolder | ArFSPrivateFile>
): void {
	expect(params.entity.contentType).to.equal('application/octet-stream');
	expect(params.entity.cipher).to.equal('AES256-GCM');
	expect(params.entity.cipherIV.length).to.equal(16);
	assertBaseArFSEntityExpectations(params);
}

interface AssertDriveExpectationsParams {
	rootFolderId: FolderID;
}

function assertDriveExpectations(
	params: AssertEntityExpectationsParams<ArFSPublicDrive | ArFSPrivateDrive> & AssertDriveExpectationsParams
): void {
	expect(params.entity.entityType).to.equal('drive');
	expect(`${params.rootFolderId}`).to.equal(`${params.rootFolderId}`);
}

export function assertPublicDriveExpectations(
	params: AssertEntityExpectationsParams<ArFSPublicDrive> & AssertDriveExpectationsParams
): void {
	assertArFSPublicExpectations(params);
	assertDriveExpectations(params);

	expect(params.entity.drivePrivacy).to.equal('public');
	expect(params.entity.contentType).to.equal('application/json');
}

export function assertPrivateDriveExpectations(
	params: AssertEntityExpectationsParams<ArFSPrivateDrive> & AssertDriveExpectationsParams
): void {
	assertArFSPrivateExpectations(params);
	assertDriveExpectations(params);

	expect(params.entity.drivePrivacy).to.equal('private');
	expect(params.entity.driveAuthMode).to.equal('password');
	expect(params.entity.contentType).to.equal('application/octet-stream');
}

interface AssertFolderExpectationsParams<T = ArFSPublicFolder | ArFSPrivateFolder>
	extends AssertEntityExpectationsParams<T> {
	folderId: FolderID;
	parentFolderId?: FolderID;
}

function assertFolderExpectations(params: AssertFolderExpectationsParams): void {
	const { entity, parentFolderId, folderId } = params;

	expect(`${entity.entityId}`).to.equal(`${folderId}`);
	expect(entity.entityType).to.equal('folder');

	if (parentFolderId) {
		// Root folders will have no parentFolderId defined
		expect(`${entity.parentFolderId}`).to.equal(`${parentFolderId}`);
	} else {
		expect(`${entity.parentFolderId}`).to.equal(`root folder`);
	}
}

export function assertPublicFolderExpectations(params: AssertFolderExpectationsParams<ArFSPublicFolder>): void {
	assertArFSPublicExpectations(params);
	assertFolderExpectations(params);
}

export function assertPrivateFolderExpectations(params: AssertFolderExpectationsParams<ArFSPrivateFolder>): void {
	assertArFSPrivateExpectations(params);
}

interface AssertFileExpectationsParams<T = ArFSPublicFile | ArFSPrivateFile> extends AssertEntityExpectationsParams<T> {
	fileId: FileID;
	parentFolderId: FolderID;
	dataContentType: DataContentType;
	dataTxId: TransactionID;
	size: ByteCount;
}

function assertFileExpectations({
	entity: file,
	fileId,
	dataTxId,
	dataContentType,
	size,
	parentFolderId
}: AssertFileExpectationsParams): void {
	expect(`${file.entityId}`).to.equal(`${fileId}`);
	expect(file.entityType).to.equal('file');
	expect(+file.size).to.equal(+size);
	expect(file.lastModifiedDate).to.be.instanceOf(UnixTime);
	expect(`${file.parentFolderId}`).to.equal(`${parentFolderId}`);
	expect(`${file.dataTxId}`).to.equal(`${dataTxId}`);
	expect(file.dataContentType).to.equal(dataContentType);
}

export function assertPublicFileExpectations(params: AssertFileExpectationsParams<ArFSPublicFile>): void {
	assertArFSPublicExpectations(params);
	assertFileExpectations(params);
}

export function assertPrivateFileExpectations(params: AssertFileExpectationsParams<ArFSPrivateFile>): void {
	assertArFSPrivateExpectations(params);
	assertFileExpectations(params);
}

interface AssertEntityWithPathsParams {
	expectedPath: string;
	expectedTxIdPath: string;
	expectedEntityIdPath: string;
	entity: ArFSPublicFileWithPaths | ArFSPrivateFileWithPaths | ArFSPublicFolderWithPaths | ArFSPrivateFolderWithPaths;
}

function assertPathExpectations({
	expectedPath,
	expectedTxIdPath,
	expectedEntityIdPath,
	entity
}: AssertEntityWithPathsParams): void {
	expect(entity.path).to.equal(expectedPath);
	expect(entity.entityIdPath).to.equal(expectedEntityIdPath);
	expect(entity.txIdPath).to.equal(expectedTxIdPath);
}

export function assertPublicFolderWithPathsExpectations(
	params: AssertFolderExpectationsParams<ArFSPublicFolderWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	assertPublicFolderExpectations({ ...params, entity: params.entity as ArFSPublicFolder });
}

export function assertPrivateFolderWithPathsExpectations(
	params: AssertFolderExpectationsParams<ArFSPrivateFolderWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	assertPrivateFolderExpectations({ ...params, entity: params.entity as ArFSPrivateFolder });
}

export function assertPublicFileWithPathsExpectations(
	params: AssertFileExpectationsParams<ArFSPublicFileWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	// eslint-disable-next-line prettier/prettier
	assertPublicFileExpectations({ ...params, entity: params.entity as unknown as ArFSPublicFile });
}

export function assertPrivateFileWithPathsExpectations(
	params: AssertFileExpectationsParams<ArFSPrivateFileWithPaths> & AssertEntityWithPathsParams
): void {
	assertPathExpectations(params);
	// eslint-disable-next-line prettier/prettier
	assertPrivateFileExpectations({ ...params, entity: params.entity as unknown as ArFSPrivateFile });
}

interface CustomMetaDataExpectation {
	customMetaData: CustomMetaDataGqlTags;
}

interface FileMetaDataJsonExpectations
	extends Omit<FileMetaDataTransactionData, 'lastModifiedDate'>,
		CustomMetaDataExpectation {}

export function assertFileMetaDataJson(
	dataJson: EntityMetaDataTransactionData,
	expectations: FileMetaDataJsonExpectations
): void {
	const { name, size, dataTxId, dataContentType, customMetaData } = expectations;

	// We filter last modified date from deep equal check because we cannot
	// consistently predict when the file is created on separate systems
	delete dataJson.lastModifiedDate;

	expect(dataJson).to.deep.equal({
		...customMetaData,
		name,
		size,
		dataTxId: `${dataTxId}`,
		dataContentType: dataContentType
	});
}

interface FolderMetaDataJsonExpectations extends CustomMetaDataExpectation {
	name: string;
}

export function assertFolderMetaDataJson(
	dataJson: EntityMetaDataTransactionData,
	expectations: FolderMetaDataJsonExpectations
): void {
	const { name, customMetaData } = expectations;
	expect(dataJson).to.deep.equal({
		...customMetaData,
		name
	});
}

export function mapMetaDataTagInterfaceToGqlTagInterface(customMetaData: CustomMetaDataGqlTags): GQLTagInterface[] {
	const gqlTagInterfaceArray = [];
	const metaDataEntries = Object.entries(customMetaData);

	for (const [name, value] of metaDataEntries) {
		if (Array.isArray(value)) {
			for (const val of value) {
				gqlTagInterfaceArray.push({ name, value: val });
			}
		} else {
			gqlTagInterfaceArray.push({ name, value });
		}
	}
	return gqlTagInterfaceArray;
}

export function assertFileMetaDataGqlTags(
	metaDataTx: Transaction,
	expectations: {
		driveId: DriveID;
		fileId: FileID;
		parentFolderId: DriveID;
		customMetaData: CustomMetaDataGqlTags;
	}
): void {
	const { driveId, fileId, parentFolderId, customMetaData } = expectations;
	const expectedMetaData: GQLTagInterface[] = mapMetaDataTagInterfaceToGqlTagInterface(customMetaData);

	const metaDataTags = getDecodedTags(metaDataTx.tags);

	// We filter Unix Time from deep equal check because we cannot consistently predict the exact time of Tx creation
	expect(metaDataTags.filter((t) => t.name !== 'Unix-Time')).to.deep.equal([
		...expectedMetaData,
		{ name: 'Content-Type', value: 'application/json' },
		{ name: 'Entity-Type', value: 'file' },
		{ name: 'Drive-Id', value: `${driveId}` },
		{ name: 'File-Id', value: `${fileId}` },
		{ name: 'Parent-Folder-Id', value: `${parentFolderId}` },
		{ name: 'App-Name', value: 'ArLocal Integration Test' },
		{ name: 'App-Version', value: 'FAKE_VERSION' },
		{ name: 'ArFS', value: '0.11' }
	]);
}

export function assertFolderMetaDataGqlTags(
	metaDataTx: Transaction,
	expectations: {
		driveId: DriveID;
		folderId: FolderID;
		parentFolderId: DriveID;
		customMetaData: CustomMetaDataGqlTags;
	}
): void {
	const { driveId, folderId, parentFolderId, customMetaData } = expectations;
	const expectedMetaData: GQLTagInterface[] = mapMetaDataTagInterfaceToGqlTagInterface(customMetaData);

	const metaDataTags = getDecodedTags(metaDataTx.tags);

	// We filter Unix Time from deep equal check because we cannot consistently predict the exact time of Tx creation
	expect(metaDataTags.filter((t) => t.name !== 'Unix-Time')).to.deep.equal([
		...expectedMetaData,
		{ name: 'Content-Type', value: 'application/json' },
		{ name: 'Entity-Type', value: 'folder' },
		{ name: 'Drive-Id', value: `${driveId}` },
		{ name: 'Folder-Id', value: `${folderId}` },
		{ name: 'Parent-Folder-Id', value: `${parentFolderId}` },
		{ name: 'App-Name', value: 'ArLocal Integration Test' },
		{ name: 'App-Version', value: 'FAKE_VERSION' },
		{ name: 'ArFS', value: '0.11' }
	]);
}

export function assertFileDataTxGqlTags(
	dataTx: Transaction,
	expectations: {
		contentType: DataContentType;
	}
): void {
	const { contentType } = expectations;
	const dataTxTags = getDecodedTags(dataTx.tags);

	expect(dataTxTags).to.deep.equal([
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: 'ArLocal Integration Test' },
		{ name: 'App-Version', value: 'FAKE_VERSION' },
		{ name: 'Tip-Type', value: 'data upload' }
	]);
}
