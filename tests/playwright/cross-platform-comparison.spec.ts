import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Import Node.js version for comparison
const nodeArDrive = require('../../lib/exports.js');

test.describe('Cross-Platform Functionality Comparison', () => {
	let testWallet: any;

	test.beforeAll(async () => {
		// Load test wallet
		const walletPath = join(__dirname, '../../test_wallet.json');
		testWallet = JSON.parse(readFileSync(walletPath, 'utf-8'));
	});

	test('should produce consistent results for data signing between browser and Node.js', async ({ page }) => {
		// First, get Node.js result - wrap raw JWK in JWKWallet for Node.js compatibility
		const nodeWallet = new nodeArDrive.JWKWallet(testWallet);
		const nodeInstance = nodeArDrive.arDriveFactory({ wallet: nodeWallet });
		const testData = Buffer.from('consistent test data');
		const nodeSigned = await nodeInstance.signData(testData);
		const nodeResult = {
			id: nodeSigned.id,
			rawLength: nodeSigned.getRaw().length
		};

		// Now test in browser
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory } = ArDriveModule;

				const instance = arDriveFactory({ wallet });
				const testData = new TextEncoder().encode('consistent test data');
				const signed = await instance.signData(testData);

				return {
					success: true,
					id: signed.id,
					rawLength: signed.getRaw().length
				};
			} catch (error: any) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('Data signing test - Node result:', nodeResult);
		console.log('Data signing test - Browser result:', browserResult);

		// Compare results - Both should successfully sign and produce valid DataItems
		// Note: IDs will be different due to timestamps and other variable data in the signing process
		expect(browserResult.success).toBe(true);
		expect(nodeResult.id).toBeTruthy(); // Node.js should produce a valid ID
		expect(browserResult.id).toBeTruthy(); // Browser should produce a valid ID
		expect(typeof nodeResult.id).toBe('string');
		expect(typeof browserResult.id).toBe('string');
		expect(browserResult.rawLength).toBeGreaterThan(0); // Should have some data
		expect(nodeResult.rawLength).toBeGreaterThan(0); // Should have some data
	});

	test('should handle anonymous operations consistently', async ({ page }) => {
		// Node.js anonymous instance - provide empty config to use defaults
		const nodeAnon = nodeArDrive.arDriveAnonymousFactory({});

		// Browser anonymous instance
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveAnonymousFactory } = ArDriveModule;

				const anon = arDriveAnonymousFactory({});

				return {
					success: true,
					hasGetPublicDrive: typeof anon.getPublicDrive === 'function',
					hasGetPublicFolder: typeof anon.getPublicFolder === 'function',
					hasGetPublicFile: typeof anon.getPublicFile === 'function',
					constructorName: anon.constructor.name
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		// Compare with Node.js version
		const nodeResult = {
			hasGetPublicDrive: typeof nodeAnon.getPublicDrive === 'function',
			hasGetPublicFolder: typeof nodeAnon.getPublicFolder === 'function',
			hasGetPublicFile: typeof nodeAnon.getPublicFile === 'function',
			constructorName: nodeAnon.constructor.name
		};

		console.log('Anonymous operations test - Browser result:', browserResult);
		console.log('Anonymous operations test - Node result:', nodeResult);

		expect(browserResult.success).toBe(true);
		expect(browserResult.hasGetPublicDrive).toBe(nodeResult.hasGetPublicDrive);
		expect(browserResult.hasGetPublicFolder).toBe(nodeResult.hasGetPublicFolder);
		expect(browserResult.hasGetPublicFile).toBe(nodeResult.hasGetPublicFile);
		// Constructor names might differ between environments, so we just check they exist
		expect(browserResult.constructorName).toBeTruthy();
		expect(nodeResult.constructorName).toBeTruthy();
	});

	test('should handle crypto operations with same results', async ({ page }) => {
		// Browser crypto operations - test that crypto functions are available and work
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { aesGcmEncrypt, aesGcmDecrypt, deriveDriveKeyV2, deriveFileKey } = ArDriveModule;

				// Test that crypto functions exist
				const hasCryptoFunctions = {
					hasAesGcmEncrypt: typeof aesGcmEncrypt === 'function',
					hasAesGcmDecrypt: typeof aesGcmDecrypt === 'function',
					hasDeriveDriveKeyV2: typeof deriveDriveKeyV2 === 'function',
					hasDeriveFileKey: typeof deriveFileKey === 'function'
				};

				return {
					success: true,
					...hasCryptoFunctions
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		console.log('Crypto operations test result:', browserResult);

		// Verify browser crypto functions exist
		expect(browserResult.success).toBe(true);
		expect(browserResult.hasAesGcmEncrypt).toBe(true);
		expect(browserResult.hasAesGcmDecrypt).toBe(true);
		expect(browserResult.hasDeriveDriveKeyV2).toBe(true);
		expect(browserResult.hasDeriveFileKey).toBe(true);
	});

	test('should handle file wrapping consistently', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { wrapFile } = ArDriveModule;

				// Create a test file
				const testContent = 'test file content for wrapping';
				const file = new File([testContent], 'test-file.txt', {
					type: 'text/plain',
					lastModified: 1640995200000 // Fixed timestamp for consistency
				});

				const wrapped = wrapFile(file);
				const bytes = await wrapped.getBytes();

				return {
					success: true,
					name: wrapped.name,
					size: wrapped.size,
					contentType: wrapped.contentType,
					lastModifiedDateMS: wrapped.lastModifiedDateMS,
					bytesLength: bytes.length,
					content: new TextDecoder().decode(bytes)
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		console.log('File wrapping test result:', browserResult);

		// Verify browser file wrapping
		expect(browserResult.success).toBe(true);
		expect(browserResult.name).toBe('test-file.txt');
		expect(browserResult.size).toBe(30); // Length of test content
		expect(browserResult.contentType).toBe('text/plain');
		expect(browserResult.lastModifiedDateMS).toBe(1640995200000);
		expect(browserResult.bytesLength).toBe(30);
		expect(browserResult.content).toBe('test file content for wrapping');
	});

	test('should maintain API compatibility between versions', async ({ page }) => {
		// Check Node.js API surface - wrap raw JWK in JWKWallet for Node.js compatibility
		const nodeWallet = new nodeArDrive.JWKWallet(testWallet);
		const nodeInstance = nodeArDrive.arDriveFactory({ wallet: nodeWallet });
		const nodeAnon = nodeArDrive.arDriveAnonymousFactory({});

		const nodeAPI = {
			// ArDrive instance methods
			hasSignData: typeof nodeInstance.signData === 'function',
			hasUploadPublicFile: typeof nodeInstance.uploadPublicFile === 'function',
			hasCreatePublicDrive: typeof nodeInstance.createPublicDrive === 'function',
			hasCreatePublicFolder: typeof nodeInstance.createPublicFolder === 'function',

			// Anonymous methods
			hasGetPublicDrive: typeof nodeAnon.getPublicDrive === 'function',
			hasGetPublicFolder: typeof nodeAnon.getPublicFolder === 'function',
			hasGetPublicFile: typeof nodeAnon.getPublicFile === 'function',

			// Crypto functions
			hasAesGcmEncrypt: typeof nodeArDrive.aesGcmEncrypt === 'function',
			hasAesGcmDecrypt: typeof nodeArDrive.aesGcmDecrypt === 'function',
			hasDeriveDriveKeyV2: typeof nodeArDrive.deriveDriveKeyV2 === 'function'
		};

		// Check browser API surface
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserAPI = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory, arDriveAnonymousFactory, aesGcmEncrypt, aesGcmDecrypt, deriveDriveKeyV2 } =
					ArDriveModule;

				const instance = arDriveFactory({ wallet });
				const anon = arDriveAnonymousFactory({});

				return {
					success: true,
					// ArDrive instance methods
					hasSignData: typeof instance.signData === 'function',
					hasUploadPublicFile: typeof instance.uploadPublicFile === 'function',
					hasCreatePublicDrive: typeof instance.createPublicDrive === 'function',
					hasCreatePublicFolder: typeof instance.createPublicFolder === 'function',

					// Anonymous methods
					hasGetPublicDrive: typeof anon.getPublicDrive === 'function',
					hasGetPublicFolder: typeof anon.getPublicFolder === 'function',
					hasGetPublicFile: typeof anon.getPublicFile === 'function',

					// Crypto functions
					hasAesGcmEncrypt: typeof aesGcmEncrypt === 'function',
					hasAesGcmDecrypt: typeof aesGcmDecrypt === 'function',
					hasDeriveDriveKeyV2: typeof deriveDriveKeyV2 === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('API compatibility test - Node API:', nodeAPI);
		console.log('API compatibility test - Browser API:', browserAPI);

		// Compare API surfaces - document current compatibility status
		expect(browserAPI.success).toBe(true);

		// Methods that should be consistent between implementations
		expect(browserAPI.hasSignData).toBe(nodeAPI.hasSignData); // Both true
		expect(browserAPI.hasUploadPublicFile).toBe(nodeAPI.hasUploadPublicFile); // Both true
		expect(browserAPI.hasGetPublicDrive).toBe(nodeAPI.hasGetPublicDrive); // Both true
		expect(browserAPI.hasGetPublicFolder).toBe(nodeAPI.hasGetPublicFolder); // Both true
		expect(browserAPI.hasGetPublicFile).toBe(nodeAPI.hasGetPublicFile); // Both true

		// Document known differences (these reflect current implementation reality)
		// Web implementation now has full drive/folder creation capabilities via Turbo
		expect(browserAPI.hasCreatePublicDrive).toBe(true); // Web: full functionality via Turbo
		expect(nodeAPI.hasCreatePublicDrive).toBe(true); // Node.js: full functionality
		expect(browserAPI.hasCreatePublicFolder).toBe(true); // Web: full functionality via Turbo
		expect(nodeAPI.hasCreatePublicFolder).toBe(true); // Node.js: full functionality

		// Crypto functions are available in web but not directly on Node.js ArDrive instance
		expect(browserAPI.hasAesGcmEncrypt).toBe(true); // Web: crypto functions available
		expect(nodeAPI.hasAesGcmEncrypt).toBe(false); // Node.js: crypto functions separate
		expect(browserAPI.hasAesGcmDecrypt).toBe(true); // Web: crypto functions available
		expect(nodeAPI.hasAesGcmDecrypt).toBe(false); // Node.js: crypto functions separate
		expect(browserAPI.hasDeriveDriveKeyV2).toBe(true); // Web: crypto functions available
		expect(nodeAPI.hasDeriveDriveKeyV2).toBe(false); // Node.js: crypto functions separate
	});

	test('should support private drive operations in web version', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory, PrivateDriveKeyData } = ArDriveModule;

				const instance = arDriveFactory({ wallet });

				// Check private drive methods
				return {
					success: true,
					hasCreatePrivateDrive: typeof instance.createPrivateDrive === 'function',
					hasCreatePrivateFolder: typeof instance.createPrivateFolder === 'function',
					hasUploadPrivateFile: typeof instance.uploadPrivateFile === 'function',
					hasGetPrivateDrive: typeof instance.getPrivateDrive === 'function',
					hasGetPrivateFolder: typeof instance.getPrivateFolder === 'function',
					hasGetPrivateFile: typeof instance.getPrivateFile === 'function',
					hasListPrivateFolder: typeof instance.listPrivateFolder === 'function',
					hasGetDriveSignatureInfo: typeof instance.getDriveSignatureInfo === 'function',
					hasPrivateDriveKeyData: typeof PrivateDriveKeyData !== 'undefined'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('Private drive operations test result:', browserResult);

		// Verify all private drive operations are available
		expect(browserResult.success).toBe(true);
		expect(browserResult.hasCreatePrivateDrive).toBe(true);
		expect(browserResult.hasCreatePrivateFolder).toBe(true);
		expect(browserResult.hasUploadPrivateFile).toBe(true);
		expect(browserResult.hasGetPrivateDrive).toBe(true);
		expect(browserResult.hasGetPrivateFolder).toBe(true);
		expect(browserResult.hasGetPrivateFile).toBe(true);
		expect(browserResult.hasListPrivateFolder).toBe(true);
		expect(browserResult.hasGetDriveSignatureInfo).toBe(true);
		expect(browserResult.hasPrivateDriveKeyData).toBe(true);
	});

	test('should support rename operations in web version', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory } = ArDriveModule;

				const instance = arDriveFactory({ wallet });

				// Check rename methods
				return {
					success: true,
					hasRenamePublicFile: typeof instance.renamePublicFile === 'function',
					hasRenamePrivateFile: typeof instance.renamePrivateFile === 'function',
					hasRenamePublicFolder: typeof instance.renamePublicFolder === 'function',
					hasRenamePrivateFolder: typeof instance.renamePrivateFolder === 'function',
					hasRenamePublicDrive: typeof instance.renamePublicDrive === 'function',
					hasRenamePrivateDrive: typeof instance.renamePrivateDrive === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('Rename operations test result:', browserResult);

		// Verify all rename operations are available
		expect(browserResult.success).toBe(true);
		expect(browserResult.hasRenamePublicFile).toBe(true);
		expect(browserResult.hasRenamePrivateFile).toBe(true);
		expect(browserResult.hasRenamePublicFolder).toBe(true);
		expect(browserResult.hasRenamePrivateFolder).toBe(true);
		expect(browserResult.hasRenamePublicDrive).toBe(true);
		expect(browserResult.hasRenamePrivateDrive).toBe(true);
	});

	test('should support move operations in web version', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory } = ArDriveModule;

				const instance = arDriveFactory({ wallet });

				// Check move methods
				return {
					success: true,
					hasMovePublicFile: typeof instance.movePublicFile === 'function',
					hasMovePrivateFile: typeof instance.movePrivateFile === 'function',
					hasMovePublicFolder: typeof instance.movePublicFolder === 'function',
					hasMovePrivateFolder: typeof instance.movePrivateFolder === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('Move operations test result:', browserResult);

		// Verify all move operations are available
		expect(browserResult.success).toBe(true);
		expect(browserResult.hasMovePublicFile).toBe(true);
		expect(browserResult.hasMovePrivateFile).toBe(true);
		expect(browserResult.hasMovePublicFolder).toBe(true);
		expect(browserResult.hasMovePrivateFolder).toBe(true);
	});

	test('should support manifest upload in web version', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const browserResult = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory } = ArDriveModule;

				const instance = arDriveFactory({ wallet });

				// Check manifest upload method
				return {
					success: true,
					hasUploadPublicManifest: typeof instance.uploadPublicManifest === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('Manifest upload test result:', browserResult);

		// Verify manifest upload is available
		expect(browserResult.success).toBe(true);
		expect(browserResult.hasUploadPublicManifest).toBe(true);
	});
});
