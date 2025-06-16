import { expect } from 'chai';
import { stub, SinonStub, restore } from 'sinon';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { stubArweaveAddress, getStubDriveKey } from '../../tests/stubs';
import {
	createMockDriveNode,
	createMockFolderNode,
	createMockFileNode,
	createMockGQLResponse,
	createMockEdge
} from '../../tests/mocks/gql_mock_responses';
import { EID, TxID, DriveKey } from '../types';
import { ArFSDAO } from './arfsdao';
import axios from 'axios';
import * as crypto from '../utils/crypto';
import { PrivateKeyData } from './private_key_data';
import { JWKWallet } from '../jwk_wallet';

const fakeArweave = Arweave.init({
	host: 'localhost',
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Mock JWK for testing
const mockJWK: JWKInterface = {
	kty: 'RSA',
	n: 'test-n',
	e: 'test-e',
	d: 'test-d',
	p: 'test-p',
	q: 'test-q',
	dp: 'test-dp',
	dq: 'test-dq',
	qi: 'test-qi'
};

describe('ArFSDAO - Private Drive Incremental Sync Tests', () => {
	let arfsDao: ArFSDAO;
	let gatewayApiStub: SinonStub;
	let axiosGetStub: SinonStub;
	let deriveFileKeyStub: SinonStub;
	const testDriveId = EID('test-drive-123');
	const testOwner = stubArweaveAddress();
	const rootFolderId = EID('root-folder-123');
	const fileId = EID('file-123');
	let driveKey: DriveKey;

	beforeEach(async () => {
		// Get drive key
		driveKey = await getStubDriveKey();

		// Create wallet instance
		const mockWallet = new JWKWallet(mockJWK);

		// Create DAO instance with mock wallet
		arfsDao = new ArFSDAO(mockWallet, fakeArweave, false, 'test_app', '0.0');

		// Stub axios for metadata fetching
		axiosGetStub = stub(axios, 'get');

		// Stub file key derivation
		deriveFileKeyStub = stub(crypto, 'deriveFileKey').resolves(driveKey);
	});

	afterEach(() => {
		restore();
	});

	describe('getPrivateDriveIncrementalSync', () => {
		beforeEach(() => {
			// Stub the gateway API
			gatewayApiStub = stub(arfsDao['gatewayApi'], 'gqlRequest');

			// Create a proper stub for getPrivateKeyForDriveId
			stub(arfsDao as never, 'getPrivateKeyForDriveId').resolves({
				driveId: testDriveId,
				driveKey,
				driveKeyCache: new Map(),
				unverifiedDriveKeys: [],
				safelyDecryptToJson: async () => ({}),
				decryptToJson: async () => ({}),
				driveKeyForDriveId: async () => driveKey
			} as unknown as PrivateKeyData);
		});

		it('should perform initial sync and decrypt private entities', async () => {
			// Mock encrypted metadata
			const encryptedDriveMetadata = {
				name: 'encrypted-name',
				rootFolderId: 'encrypted-root-id',
				cipher: 'AES256-GCM',
				cipherIV: 'test-iv'
			};
			const encryptedFolderMetadata = {
				name: 'encrypted-folder-name',
				cipher: 'AES256-GCM',
				cipherIV: 'test-iv'
			};
			const encryptedFileMetadata = {
				name: 'encrypted-file-name',
				size: 1024,
				lastModifiedDate: 1234567890,
				dataTxId: 'data-tx-123',
				dataContentType: 'text/plain',
				cipher: 'AES256-GCM',
				cipherIV: 'test-iv'
			};

			// Mock nodes for private entities
			const driveNode = createMockDriveNode(testDriveId.toString(), 1000000);
			driveNode.tags.find((t) => t.name === 'Drive-Privacy')!.value = 'private';
			driveNode.tags.push({ name: 'Drive-Auth-Mode', value: 'password' });
			driveNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			driveNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			const folderNode = createMockFolderNode(rootFolderId.toString(), testDriveId.toString(), '', 1000001);
			folderNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			folderNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			const fileNode = createMockFileNode(
				fileId.toString(),
				testDriveId.toString(),
				rootFolderId.toString(),
				1000002
			);
			fileNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			fileNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			// Mock GraphQL responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([createMockEdge(driveNode)], false));
			gatewayApiStub.onCall(1).resolves(createMockGQLResponse([createMockEdge(folderNode)], false));
			gatewayApiStub.onCall(2).resolves(createMockGQLResponse([createMockEdge(fileNode)], false));

			// Mock encrypted metadata responses
			axiosGetStub.onCall(0).resolves({
				data: Buffer.from(JSON.stringify(encryptedDriveMetadata)),
				status: 200,
				statusText: 'OK'
			});
			axiosGetStub.onCall(1).resolves({
				data: Buffer.from(JSON.stringify(encryptedFolderMetadata)),
				status: 200,
				statusText: 'OK'
			});
			axiosGetStub.onCall(2).resolves({
				data: Buffer.from(JSON.stringify(encryptedFileMetadata)),
				status: 200,
				statusText: 'OK'
			});

			// Perform initial sync
			const result = await arfsDao.getPrivateDriveIncrementalSync(testDriveId, driveKey, testOwner);

			// Verify results
			expect(result.entities).to.have.length(3);
			expect(result.changes.added).to.have.length(3);
			expect(result.changes.modified).to.have.length(0);
			expect(result.changes.possiblyDeleted).to.have.length(0);

			// Verify entities are private types
			const [drive, folder, file] = result.entities;
			expect(drive.entityType).to.equal('drive');
			expect(folder.entityType).to.equal('folder');
			expect(file.entityType).to.equal('file');
		});

		it('should derive file keys correctly for private files', async () => {
			// Mock file node
			const fileNode = createMockFileNode(
				fileId.toString(),
				testDriveId.toString(),
				rootFolderId.toString(),
				1000001
			);
			fileNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			fileNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			// Mock GraphQL responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(1).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(2).resolves(createMockGQLResponse([createMockEdge(fileNode)], false));

			// Mock encrypted metadata
			axiosGetStub.resolves({
				data: Buffer.from(
					JSON.stringify({
						name: 'encrypted-file-name',
						size: 1024,
						lastModifiedDate: 1234567890,
						dataTxId: 'data-tx-123',
						dataContentType: 'text/plain',
						cipher: 'AES256-GCM',
						cipherIV: 'test-iv'
					})
				),
				status: 200,
				statusText: 'OK'
			});

			// Perform sync
			await arfsDao.getPrivateDriveIncrementalSync(testDriveId, driveKey, testOwner);

			// Verify deriveFileKey was called with correct parameters
			expect(deriveFileKeyStub.called).to.be.true;
			expect(deriveFileKeyStub.firstCall.args[0]).to.equal(fileId.toString());
			expect(deriveFileKeyStub.firstCall.args[1]).to.equal(driveKey);
		});

		it('should handle mixed public and private entities correctly', async () => {
			// This shouldn't happen in practice, but test error handling
			const publicFolderNode = createMockFolderNode('public-folder', testDriveId.toString(), '', 1000001);
			// No cipher tags - this is a public folder in a private drive (invalid)

			// Mock GraphQL responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(1).resolves(createMockGQLResponse([createMockEdge(publicFolderNode)], false));
			gatewayApiStub.onCall(2).resolves(createMockGQLResponse([], false));

			// Mock metadata
			axiosGetStub.resolves({
				data: { name: 'Public Folder' },
				status: 200,
				statusText: 'OK'
			});

			// Perform sync - should skip the invalid entity
			const result = await arfsDao.getPrivateDriveIncrementalSync(testDriveId, driveKey, testOwner);

			// Verify the public entity was skipped
			expect(result.entities).to.have.length(0);
			expect(result.stats.totalProcessed).to.equal(0);
		});

		it('should track entity states correctly for private entities', async () => {
			// Create previous sync state
			const previousSyncState = {
				driveId: testDriveId,
				lastSyncedBlockHeight: 1000000,
				lastSyncedTimestamp: Date.now() - 3600000,
				entityStates: new Map([
					[
						rootFolderId.toString(),
						{
							entityId: rootFolderId,
							txId: TxID('folder-tx-1000000'),
							blockHeight: 1000000,
							parentFolderId: undefined,
							name: 'Root Folder'
						}
					]
				])
			};

			// Modified folder
			const modifiedFolderNode = createMockFolderNode(
				rootFolderId.toString(),
				testDriveId.toString(),
				'',
				1000002
			);
			modifiedFolderNode.id = 'folder-tx-1000002';
			modifiedFolderNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			modifiedFolderNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			// Mock responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(1).resolves(createMockGQLResponse([createMockEdge(modifiedFolderNode)], false));
			gatewayApiStub.onCall(2).resolves(createMockGQLResponse([], false));

			// Mock encrypted metadata
			axiosGetStub.resolves({
				data: Buffer.from(
					JSON.stringify({
						name: 'encrypted-modified-name',
						cipher: 'AES256-GCM',
						cipherIV: 'test-iv'
					})
				),
				status: 200,
				statusText: 'OK'
			});

			// Perform incremental sync
			const result = await arfsDao.getPrivateDriveIncrementalSync(testDriveId, driveKey, testOwner, {
				syncState: previousSyncState
			});

			// Verify modification detected
			expect(result.changes.modified).to.have.length(1);
			expect(result.newSyncState.entityStates.get(rootFolderId.toString())?.txId.toString()).to.equal(
				'folder-tx-1000002'
			);
		});

		it('should handle decryption failures gracefully', async () => {
			// Create a private file node
			const fileNode = createMockFileNode(
				fileId.toString(),
				testDriveId.toString(),
				rootFolderId.toString(),
				1000001
			);
			fileNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			fileNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			// Mock GraphQL responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(1).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(2).resolves(createMockGQLResponse([createMockEdge(fileNode)], false));

			// Mock metadata that will fail decryption
			axiosGetStub.resolves({
				data: Buffer.from('invalid-encrypted-data'),
				status: 200,
				statusText: 'OK'
			});

			// Perform sync
			const result = await arfsDao.getPrivateDriveIncrementalSync(testDriveId, driveKey, testOwner);

			// Verify entity was skipped due to decryption failure
			expect(result.entities).to.have.length(0);
			expect(result.stats.totalProcessed).to.equal(0);
		});

		it('should respect all sync options for private drives', async () => {
			let progressCalled = false;
			const onProgress = () => {
				progressCalled = true;
			};

			// Create nodes
			const driveNode = createMockDriveNode(testDriveId.toString(), 1000000);
			driveNode.tags.find((t) => t.name === 'Drive-Privacy')!.value = 'private';
			driveNode.tags.push({ name: 'Drive-Auth-Mode', value: 'password' });
			driveNode.tags.push({ name: 'Cipher', value: 'AES256-GCM' });
			driveNode.tags.push({ name: 'Cipher-IV', value: 'test-iv' });

			// Mock responses
			gatewayApiStub.onCall(0).resolves(createMockGQLResponse([createMockEdge(driveNode)], false));
			gatewayApiStub.onCall(1).resolves(createMockGQLResponse([], false));
			gatewayApiStub.onCall(2).resolves(createMockGQLResponse([], false));

			// Mock metadata
			axiosGetStub.resolves({
				data: Buffer.from(
					JSON.stringify({
						name: 'encrypted-name',
						rootFolderId: 'encrypted-root-id',
						cipher: 'AES256-GCM',
						cipherIV: 'test-iv'
					})
				),
				status: 200,
				statusText: 'OK'
			});

			// Perform sync with options
			const result = await arfsDao.getPrivateDriveIncrementalSync(testDriveId, driveKey, testOwner, {
				includeRevisions: true,
				onProgress,
				batchSize: 50,
				stopAfterKnownCount: 5
			});

			// Verify options were respected
			expect(progressCalled).to.be.true;
			expect(result.entities).to.have.length(1);
		});
	});
});
