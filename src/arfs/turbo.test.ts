import { expect } from 'chai';
import { stub, createStubInstance, SinonStub } from 'sinon';
import { DataItem } from '@dha-team/arbundles';
import { Readable } from 'node:stream';

import {
	TurboUnauthenticatedClient,
	TurboAuthenticatedClient,
	TurboFactory,
	EthereumSigner,
	ArweaveSigner,
	TurboUploadDataItemResponse
} from '@ardrive/turbo-sdk';

import { Turbo, TurboSettings } from './turbo';
import { JWKWallet } from '../jwk_wallet';
import { defaultTurboPaymentUrl, defaultTurboUploadUrl } from '../utils/constants';
import { Wallet } from '../wallet';

describe('Turbo class', () => {
	let turboFactoryUnauthenticatedStub: SinonStub;
	let turboFactoryAuthenticatedStub: SinonStub;
	let mockUnauthenticatedClient: TurboUnauthenticatedClient;
	let mockAuthenticatedClient: TurboAuthenticatedClient;

	beforeEach(() => {
		// Mock clients
		mockUnauthenticatedClient = createStubInstance(TurboUnauthenticatedClient);
		mockAuthenticatedClient = createStubInstance(TurboAuthenticatedClient);

		// Stub factory methods
		turboFactoryUnauthenticatedStub = stub(TurboFactory, 'unauthenticated');
		turboFactoryAuthenticatedStub = stub(TurboFactory, 'authenticated');

		turboFactoryUnauthenticatedStub.returns(mockUnauthenticatedClient);
		turboFactoryAuthenticatedStub.returns(mockAuthenticatedClient);
	});

	afterEach(() => {
		turboFactoryUnauthenticatedStub.restore();
		turboFactoryAuthenticatedStub.restore();
	});

	describe('constructor', () => {
		it('creates unauthenticated client by default', () => {
			const turbo = new Turbo({});

			expect(turboFactoryUnauthenticatedStub.calledOnce).to.be.true;
			expect(turboFactoryAuthenticatedStub.called).to.be.false;
			expect(turbo.getIsAuthenticated()).to.be.false;
		});

		it('creates unauthenticated client with custom settings', () => {
			const customSettings: TurboSettings = {
				turboUploadUrl: new URL('https://custom-upload.example.com'),
				turboPaymentUrl: new URL('https://custom-payment.example.com')
			};

			const turbo = new Turbo(customSettings);

			expect(
				turboFactoryUnauthenticatedStub.calledOnceWith({
					uploadServiceConfig: {
						url: 'https://custom-upload.example.com'
					},
					paymentServiceConfig: {
						url: 'https://custom-payment.example.com'
					}
				})
			).to.be.true;
			expect(turbo.getIsAuthenticated()).to.be.false;
		});

		it('creates authenticated client when ethereumPrivateKey is provided', () => {
			const ethereumPrivateKey = '0x' + '1'.repeat(64);
			const turbo = new Turbo({ ethereumPrivateKey });

			expect(turboFactoryAuthenticatedStub.calledOnce).to.be.true;
			expect(turboFactoryUnauthenticatedStub.called).to.be.false;
			expect(turbo.getIsAuthenticated()).to.be.true;

			const callArgs = turboFactoryAuthenticatedStub.getCall(0).args[0];
			expect(callArgs.privateKey).to.equal(ethereumPrivateKey);
			expect(callArgs.uploadServiceConfig.url).to.equal(defaultTurboUploadUrl.origin);
			expect(callArgs.paymentServiceConfig.url).to.equal(defaultTurboPaymentUrl.origin);
		});

		it('creates authenticated client when custom signer is provided', () => {
			const mockSigner = createStubInstance(EthereumSigner);
			const turbo = new Turbo({ signer: mockSigner });

			expect(turboFactoryAuthenticatedStub.calledOnce).to.be.true;
			expect(turboFactoryUnauthenticatedStub.called).to.be.false;
			expect(turbo.getIsAuthenticated()).to.be.true;

			const callArgs = turboFactoryAuthenticatedStub.getCall(0).args[0];
			expect(callArgs.signer).to.equal(mockSigner);
		});

		it('creates authenticated client when useAuthenticated is true', () => {
			const turbo = new Turbo({ useAuthenticated: true });

			expect(turboFactoryAuthenticatedStub.calledOnce).to.be.true;
			expect(turboFactoryUnauthenticatedStub.called).to.be.false;
			expect(turbo.getIsAuthenticated()).to.be.true;
		});

		it('prioritizes custom signer over ethereum private key', () => {
			const ethereumPrivateKey = '0x' + '1'.repeat(64);
			const mockSigner = createStubInstance(EthereumSigner);

			new Turbo({
				ethereumPrivateKey,
				signer: mockSigner
			});

			const callArgs = turboFactoryAuthenticatedStub.getCall(0).args[0];
			expect(callArgs.signer).to.equal(mockSigner);
			expect(callArgs.privateKey).to.be.undefined;
		});

		it('sets dry run mode correctly', () => {
			new Turbo({ isDryRun: true });
			// Test passes if no errors are thrown during construction
		});

		it('validates Ethereum private key format', () => {
			// Valid formats
			expect(() => new Turbo({ ethereumPrivateKey: '0x' + '1'.repeat(64) })).to.not.throw();
			expect(() => new Turbo({ ethereumPrivateKey: '1'.repeat(64) })).to.not.throw();

			// Invalid formats
			expect(() => new Turbo({ ethereumPrivateKey: '0x' + '1'.repeat(63) })).to.throw(
				'Invalid Ethereum private key format'
			);
			expect(() => new Turbo({ ethereumPrivateKey: '0x' + 'g'.repeat(64) })).to.throw(
				'Invalid Ethereum private key format'
			);
			expect(() => new Turbo({ ethereumPrivateKey: 'not-a-key' })).to.throw(
				'Invalid Ethereum private key format'
			);
		});

		it('handles Turbo client creation errors', () => {
			// Stub the factory to throw an error
			turboFactoryAuthenticatedStub.throws(new Error('Network error'));

			expect(() => new Turbo({ ethereumPrivateKey: '0x' + '1'.repeat(64) })).to.throw(
				'Failed to create authenticated Turbo client: Network error'
			);
		});
	});

	describe('sendDataItem', () => {
		let mockDataItem: DataItem;
		let turbo: Turbo;

		beforeEach(() => {
			// Create a mock DataItem
			mockDataItem = {
				id: 'test-data-item-id',
				owner: 'test-owner',
				getRaw: () => Buffer.from('test data')
			} as DataItem;

			turbo = new Turbo({});
		});

		it('returns dry run response when isDryRun is true', async () => {
			const dryRunTurbo = new Turbo({ isDryRun: true });

			const result = await dryRunTurbo.sendDataItem(mockDataItem);

			expect(result).to.deep.equal({
				id: 'test-data-item-id',
				owner: 'test-owner',
				dataCaches: [],
				fastFinalityIndexes: [],
				winc: '0'
			});
		});

		it('calls uploadSignedDataItem on unauthenticated client', async () => {
			const mockResponse: TurboUploadDataItemResponse = {
				id: 'test-upload-id',
				owner: 'test-owner',
				dataCaches: ['cache1'],
				fastFinalityIndexes: ['index1'],
				winc: '100'
			};

			(mockUnauthenticatedClient.uploadSignedDataItem as SinonStub).resolves(mockResponse);

			const result = await turbo.sendDataItem(mockDataItem);

			const uploadSpy = mockUnauthenticatedClient.uploadSignedDataItem as SinonStub;
			expect(uploadSpy.calledOnce).to.be.true;
			expect(result).to.deep.equal(mockResponse);

			// Verify the stream factory and size factory
			const callArgs = (mockUnauthenticatedClient.uploadSignedDataItem as SinonStub).getCall(0).args[0];
			expect(callArgs.dataItemStreamFactory).to.be.a('function');
			expect(callArgs.dataItemSizeFactory).to.be.a('function');
			expect(callArgs.dataItemSizeFactory()).to.equal(9); // 'test data'.length
		});

		it('calls uploadSignedDataItem on authenticated client', async () => {
			const authenticatedTurbo = new Turbo({ useAuthenticated: true });
			const mockResponse: TurboUploadDataItemResponse = {
				id: 'test-upload-id',
				owner: 'test-owner',
				dataCaches: ['cache1'],
				fastFinalityIndexes: ['index1'],
				winc: '200'
			};

			(mockAuthenticatedClient.uploadSignedDataItem as SinonStub).resolves(mockResponse);

			const result = await authenticatedTurbo.sendDataItem(mockDataItem);

			const uploadSpy = mockAuthenticatedClient.uploadSignedDataItem as SinonStub;
			expect(uploadSpy.calledOnce).to.be.true;
			expect(result).to.deep.equal(mockResponse);
		});

		it('handles upload errors properly', async () => {
			const uploadError = new Error('Upload failed');
			(mockUnauthenticatedClient.uploadSignedDataItem as SinonStub).rejects(uploadError);

			try {
				await turbo.sendDataItem(mockDataItem);
				expect.fail('Expected error to be thrown');
			} catch (error) {
				expect(error).to.be.instanceOf(Error);
				expect((error as Error).message).to.equal('Upload failed');
			}
		});
	});

	describe('static helper methods', () => {
		describe('createEthereumSigner', () => {
			it('creates an EthereumSigner with provided private key', () => {
				const privateKey = '0x' + '1'.repeat(64);
				const signer = Turbo.createEthereumSigner(privateKey);

				expect(signer).to.be.instanceOf(EthereumSigner);
			});

			it('validates private key format', () => {
				// Valid formats
				expect(() => Turbo.createEthereumSigner('0x' + '1'.repeat(64))).to.not.throw();
				expect(() => Turbo.createEthereumSigner('1'.repeat(64))).to.not.throw();

				// Invalid formats
				expect(() => Turbo.createEthereumSigner('invalid')).to.throw('Invalid Ethereum private key format');
				expect(() => Turbo.createEthereumSigner('0x' + '1'.repeat(63))).to.throw(
					'Invalid Ethereum private key format'
				);
			});
		});

		describe('createArweaveSigner', () => {
			it('creates an ArweaveSigner from JWK wallet', () => {
				const mockWallet = createStubInstance(JWKWallet);
				const mockJWK = { kty: 'RSA', n: 'test', e: 'AQAB' };
				mockWallet.getPrivateKey.returns(mockJWK);

				const signer = Turbo.createArweaveSigner(mockWallet);

				expect(signer).to.be.instanceOf(ArweaveSigner);
				const getPrivateKeySpy = mockWallet.getPrivateKey as SinonStub;
				expect(getPrivateKeySpy.calledOnce).to.be.true;
			});

			it('throws error for wallet without getPrivateKey method', () => {
				// Create a mock wallet without getPrivateKey
				const invalidWallet = {
					getPublicKey: async () => 'public-key',
					getAddress: async () => 'address',
					sign: async () => new Uint8Array()
				};

				expect(() => Turbo.createArweaveSigner(invalidWallet as unknown as Wallet)).to.throw(
					'Wallet must be a JWKWallet instance with getPrivateKey method'
				);
			});
		});
	});

	describe('getClient', () => {
		it('returns unauthenticated client for unauthenticated instance', () => {
			const turbo = new Turbo({});
			const client = turbo.getClient();

			expect(client).to.equal(mockUnauthenticatedClient);
		});

		it('returns authenticated client for authenticated instance', () => {
			const turbo = new Turbo({ useAuthenticated: true });
			const client = turbo.getClient();

			expect(client).to.equal(mockAuthenticatedClient);
		});
	});

	describe('getIsAuthenticated', () => {
		it('returns false for unauthenticated instance', () => {
			const turbo = new Turbo({});
			expect(turbo.getIsAuthenticated()).to.be.false;
		});

		it('returns true for authenticated instance', () => {
			const turbo = new Turbo({ useAuthenticated: true });
			expect(turbo.getIsAuthenticated()).to.be.true;
		});
	});

	describe('stream handling', () => {
		it('properly converts DataItem buffer to readable stream', async () => {
			const turbo = new Turbo({});
			const testData = Buffer.from('test stream data');

			const mockDataItem = {
				id: 'stream-test-id',
				owner: 'stream-test-owner',
				getRaw: () => testData
			} as DataItem;

			(mockUnauthenticatedClient.uploadSignedDataItem as SinonStub).resolves({
				id: 'response-id',
				owner: 'response-owner',
				dataCaches: [],
				fastFinalityIndexes: []
			});

			await turbo.sendDataItem(mockDataItem);

			const callArgs = (mockUnauthenticatedClient.uploadSignedDataItem as SinonStub).getCall(0).args[0];
			const stream = callArgs.dataItemStreamFactory();

			expect(stream).to.be.instanceOf(Readable);

			// Test stream content
			const chunks: Buffer[] = [];
			stream.on('data', (chunk: Buffer) => chunks.push(chunk));

			await new Promise<void>((resolve) => {
				stream.on('end', () => {
					const result = Buffer.concat(chunks);
					expect(result.equals(testData)).to.be.true;
					resolve();
				});
			});
		});
	});
});
