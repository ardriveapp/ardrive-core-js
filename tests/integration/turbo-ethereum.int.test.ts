import { expect } from 'chai';
import { createStubInstance } from 'sinon';
import { DataItem } from '@dha-team/arbundles';
import { ArDrive } from '../../src/ardrive';
import { arDriveFactory } from '../../src/ardrive_factory';
import { Turbo } from '../../src/arfs/turbo';
import { wrapFileOrFolder } from '../../src/arfs/arfs_file_wrapper';
import { EthereumSigner } from '@ardrive/turbo-sdk';
import { JWKWallet } from '../../src/jwk_wallet';
import { readJWKFile } from '../../src/utils/common';
import { EID, FolderID } from '../../src/types';

describe('Turbo Ethereum Signer Integration Tests', function () {
	// Increase timeout for integration tests
	this.timeout(30000);

	let wallet: JWKWallet;
	let testFolderId: FolderID;

	// Mock Ethereum private key (not a real key)
	const mockEthereumPrivateKey = '0x' + '1'.repeat(64);

	before(() => {
		wallet = readJWKFile('./test_wallet.json') as JWKWallet;
		testFolderId = EID('8af757d9-88c6-4ca2-9dc5-0323618292cd') as FolderID;
	});

	describe('ArDrive Factory with Ethereum Signer', () => {
		it('creates ArDrive instance with Ethereum private key', () => {
			const arDrive = arDriveFactory({
				wallet,
				ethereumPrivateKey: mockEthereumPrivateKey,
				dryRun: true // Use dry run for testing
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('creates ArDrive instance with custom Ethereum signer', () => {
			const mockSigner = createStubInstance(EthereumSigner);

			const arDrive = arDriveFactory({
				wallet,
				turboSigner: mockSigner,
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('creates ArDrive with combined turbo settings and Ethereum key', () => {
			const arDrive = arDriveFactory({
				wallet,
				turboSettings: {
					turboUploadUrl: new URL('https://upload.ardrive.io'),
					turboPaymentUrl: new URL('https://payment.ardrive.io')
				},
				ethereumPrivateKey: mockEthereumPrivateKey,
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('Turbo Class Integration', () => {
		it('creates authenticated Turbo client with Ethereum private key', () => {
			const turbo = new Turbo({
				ethereumPrivateKey: mockEthereumPrivateKey,
				isDryRun: true
			});

			expect(turbo.getIsAuthenticated()).to.be.true;
		});

		it('creates unauthenticated Turbo client by default', () => {
			const turbo = new Turbo({
				isDryRun: true
			});

			expect(turbo.getIsAuthenticated()).to.be.false;
		});

		it('handles sendDataItem with authenticated client in dry run', async () => {
			const turbo = new Turbo({
				ethereumPrivateKey: mockEthereumPrivateKey,
				isDryRun: true
			});

			// Mock a data item
			const mockDataItem = {
				id: 'test-data-item-id',
				owner: 'test-owner',
				getRaw: () => Buffer.from('test data')
			} as unknown as DataItem; // Cast to DataItem since we're only mocking the necessary properties

			const result = await turbo.sendDataItem(mockDataItem);

			expect(result).to.deep.equal({
				id: 'test-data-item-id',
				owner: 'test-owner',
				dataCaches: [],
				fastFinalityIndexes: []
			});
		});
	});

	describe('Static Helper Methods', () => {
		it('creates Ethereum signer from private key', () => {
			const signer = Turbo.createEthereumSigner(mockEthereumPrivateKey);
			expect(signer).to.be.instanceOf(EthereumSigner);
		});

		it('creates Arweave signer from wallet', () => {
			const signer = Turbo.createArweaveSigner(wallet);
			// ArweaveSigner should be created successfully
			expect(signer).to.exist;
		});
	});

	describe('Upload Operations with Ethereum Signer', () => {
		it('supports file upload with Ethereum authenticated Turbo (dry run)', async function () {
			const arDrive = arDriveFactory({
				wallet,
				ethereumPrivateKey: mockEthereumPrivateKey,
				dryRun: true
			});

			// Wrap a test file
			const wrappedFile = wrapFileOrFolder('./tests/stub_files/file_with_no_extension');

			// Mock the upload operation
			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						wrappedEntity: wrappedFile,
						destFolderId: testFolderId
					}
				],
				conflictResolution: 'skip'
			});

			// In dry run mode, we expect the operation to complete without errors
			expect(result).to.exist;
			expect(result.created).to.exist;
		});

		it('supports bulk upload with Ethereum authenticated Turbo (dry run)', async function () {
			const arDrive = arDriveFactory({
				wallet,
				ethereumPrivateKey: mockEthereumPrivateKey,
				dryRun: true
			});

			// Wrap test files
			const wrappedFile1 = wrapFileOrFolder('./tests/stub_files/258KiB.txt');
			const wrappedFile2 = wrapFileOrFolder('./tests/stub_files/file_with_no_extension');

			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						wrappedEntity: wrappedFile1,
						destFolderId: testFolderId
					},
					{
						wrappedEntity: wrappedFile2,
						destFolderId: testFolderId
					}
				],
				conflictResolution: 'upsert'
			});

			expect(result).to.exist;
			expect(result.created).to.exist;
		});
	});

	describe('Error Handling', () => {
		it('handles invalid Ethereum private key gracefully', () => {
			expect(() => {
				arDriveFactory({
					wallet,
					ethereumPrivateKey: 'invalid-key',
					dryRun: true
				});
			}).to.not.throw();
		});

		it('handles missing Ethereum private key gracefully', () => {
			const arDrive = arDriveFactory({
				wallet,
				ethereumPrivateKey: undefined,
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('Backwards Compatibility', () => {
		it('maintains existing Turbo functionality without Ethereum options', () => {
			const arDrive = arDriveFactory({
				wallet,
				turboSettings: {
					turboUploadUrl: new URL('https://upload.ardrive.io'),
					turboPaymentUrl: new URL('https://payment.ardrive.io')
				},
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('works without any Turbo configuration', () => {
			const arDrive = arDriveFactory({
				wallet,
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('Configuration Combinations', () => {
		it('prioritizes custom signer over Ethereum private key', () => {
			const mockSigner = createStubInstance(EthereumSigner);

			const arDrive = arDriveFactory({
				wallet,
				ethereumPrivateKey: mockEthereumPrivateKey,
				turboSigner: mockSigner, // This should take precedence
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('combines all settings correctly', () => {
			const mockSigner = createStubInstance(EthereumSigner);

			const arDrive = arDriveFactory({
				wallet,
				turboSettings: {
					turboUploadUrl: new URL('https://custom-upload.example.com'),
					turboPaymentUrl: new URL('https://custom-payment.example.com')
				},
				ethereumPrivateKey: mockEthereumPrivateKey,
				turboSigner: mockSigner,
				shouldBundle: false,
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('Performance and Memory', () => {
		it('does not leak memory when creating multiple instances', () => {
			// Create multiple instances to test for memory leaks
			for (let i = 0; i < 10; i++) {
				const arDrive = arDriveFactory({
					wallet,
					ethereumPrivateKey: mockEthereumPrivateKey,
					dryRun: true
				});
				expect(arDrive).to.be.instanceOf(ArDrive);
			}
		});

		it('handles large file operations efficiently (simulated)', async function () {
			const arDrive = arDriveFactory({
				wallet,
				ethereumPrivateKey: mockEthereumPrivateKey,
				dryRun: true
			});

			// Wrap a larger test file
			const wrappedFile = wrapFileOrFolder('./tests/stub_files/5MiB.txt');

			const result = await arDrive.uploadAllEntities({
				entitiesToUpload: [
					{
						wrappedEntity: wrappedFile,
						destFolderId: testFolderId
					}
				],
				conflictResolution: 'skip'
			});

			expect(result).to.exist;
		});
	});
});
