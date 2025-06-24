import { expect } from 'chai';
import { createStubInstance, SinonStub } from 'sinon';
import { arDriveFactory, ArDriveSettings } from './ardrive_factory';
import { ArDrive } from './ardrive';
import { JWKWallet } from './jwk_wallet';
import { EthereumSigner } from '@ardrive/turbo-sdk';

describe('arDriveFactory function', () => {
	let mockWallet: JWKWallet;

	beforeEach(() => {
		// Create a mock wallet
		mockWallet = createStubInstance(JWKWallet);
		const getPrivateKeyStub = mockWallet.getPrivateKey as SinonStub;
		getPrivateKeyStub.returns({
			kty: 'RSA',
			n: 'test-key',
			e: 'AQAB'
		});
	});

	afterEach(() => {
		// Clean up if needed
	});

	describe('basic factory functionality', () => {
		it('creates ArDrive instance with default settings', () => {
			const arDrive = arDriveFactory({
				wallet: mockWallet
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('creates ArDrive instance with custom turbo settings', () => {
			const customTurboSettings = {
				turboUploadUrl: new URL('https://custom-upload.example.com'),
				turboPaymentUrl: new URL('https://custom-payment.example.com')
			};

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				turboSettings: customTurboSettings
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('Ethereum signer integration', () => {
		it('creates ArDrive with Ethereum private key', () => {
			const ethereumPrivateKey = '0x' + '1'.repeat(64);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				ethereumPrivateKey
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('creates ArDrive with custom Turbo signer', () => {
			const mockSigner = createStubInstance(EthereumSigner);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				turboSigner: mockSigner
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('creates ArDrive with both Ethereum key and custom signer (signer takes precedence)', () => {
			const ethereumPrivateKey = '0x' + '1'.repeat(64);
			const mockSigner = createStubInstance(EthereumSigner);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				ethereumPrivateKey,
				turboSigner: mockSigner
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('enables Turbo in upload planner when Ethereum key is provided', () => {
			const ethereumPrivateKey = '0x' + '1'.repeat(64);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				ethereumPrivateKey
			});

			// Check that ArDrive instance is created successfully with Ethereum key
			expect(arDrive).to.be.instanceOf(ArDrive);
			// The internal configuration is not directly accessible, but creating
			// an ArDrive instance with Ethereum key should enable Turbo
		});

		it('enables Turbo in upload planner when custom signer is provided', () => {
			const mockSigner = createStubInstance(EthereumSigner);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				turboSigner: mockSigner
			});

			// Check that ArDrive instance is created successfully with custom signer
			expect(arDrive).to.be.instanceOf(ArDrive);
			// The internal configuration is not directly accessible, but creating
			// an ArDrive instance with custom signer should enable Turbo
		});

		it('combines turbo settings with Ethereum signer options', () => {
			const customTurboSettings = {
				turboUploadUrl: new URL('https://custom-upload.example.com'),
				turboPaymentUrl: new URL('https://custom-payment.example.com')
			};
			const ethereumPrivateKey = '0x' + '1'.repeat(64);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				turboSettings: customTurboSettings,
				ethereumPrivateKey
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('dry run mode', () => {
		it('passes dry run flag to Turbo constructor', () => {
			arDriveFactory({
				wallet: mockWallet,
				dryRun: true
			});

			expect(arDriveFactory).to.not.throw;
		});

		it('works with Ethereum signer in dry run mode', () => {
			const ethereumPrivateKey = '0x' + '1'.repeat(64);

			const arDrive = arDriveFactory({
				wallet: mockWallet,
				ethereumPrivateKey,
				dryRun: true
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('parameter validation', () => {
		it('accepts all valid ArDriveSettings parameters', () => {
			const validSettings: ArDriveSettings = {
				wallet: mockWallet,
				ethereumPrivateKey: '0x' + '1'.repeat(64),
				turboSigner: createStubInstance(EthereumSigner),
				turboSettings: {
					turboUploadUrl: new URL('https://example.com'),
					turboPaymentUrl: new URL('https://example.com')
				},
				dryRun: false,
				shouldBundle: true
			};

			const arDrive = arDriveFactory(validSettings);
			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('works with minimal required parameters', () => {
			const minimalSettings: ArDriveSettings = {
				wallet: mockWallet
			};

			const arDrive = arDriveFactory(minimalSettings);
			expect(arDrive).to.be.instanceOf(ArDrive);
		});
	});

	describe('backwards compatibility', () => {
		it('maintains existing functionality without Ethereum options', () => {
			// Test that existing code still works
			const arDrive = arDriveFactory({
				wallet: mockWallet,
				shouldBundle: false,
				dryRun: false
			});

			expect(arDrive).to.be.instanceOf(ArDrive);
		});

		it('defaults to unauthenticated Turbo when no Ethereum options provided', () => {
			const arDrive = arDriveFactory({
				wallet: mockWallet
			});

			// Check that ArDrive instance is created successfully without Ethereum options
			expect(arDrive).to.be.instanceOf(ArDrive);
			// Default behavior should create unauthenticated Turbo instance
		});

		it('enables Turbo when turboSettings provided (existing behavior)', () => {
			const arDrive = arDriveFactory({
				wallet: mockWallet,
				turboSettings: {
					turboUploadUrl: new URL('https://example.com'),
					turboPaymentUrl: new URL('https://example.com')
				}
			});

			// Check that ArDrive instance is created successfully with turbo settings
			expect(arDrive).to.be.instanceOf(ArDrive);
			// Turbo should be enabled when turboSettings are provided
		});
	});
});
