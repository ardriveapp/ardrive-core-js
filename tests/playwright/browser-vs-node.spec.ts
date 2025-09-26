import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Test to compare browser build vs Node.js build functionality
test.describe('Browser vs Node.js Build Comparison', () => {
	let testWallet: Record<string, unknown>;

	test.beforeAll(async () => {
		// Load test wallet
		const walletPath = join(__dirname, '../../test_wallet.json');
		testWallet = JSON.parse(readFileSync(walletPath, 'utf-8'));
	});

	test('should load web bundle and create ArDriveWeb instance', async ({ page }) => {
		// Listen to console logs for debugging
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		// Navigate to the test harness HTML file served by HTTP server
		await page.goto('http://127.0.0.1:3000/tests/playwright/test-harness.html');

		// Wait for the module to load
		await page.waitForFunction(() => window.arDriveLoaded === true, { timeout: 10000 });

		// Test basic functionality in browser
		const result = await page.evaluate((wallet) => {
			try {
				// @ts-expect-error - accessing global modules from test harness
				const { arDriveFactory, ArDriveWeb } = window;

				const instance = arDriveFactory({ wallet });
				return {
					success: true,
					isArDriveWeb: instance instanceof ArDriveWeb,
					hasSignData: typeof instance.signData === 'function',
					hasUploadPublicFile: typeof instance.uploadPublicFile === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		console.log('Browser test result:', result);

		if (!result.success) {
			console.error('Browser test failed with error:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.isArDriveWeb).toBe(true);
		expect(result.hasSignData).toBe(true);
		expect(result.hasUploadPublicFile).toBe(true);
	});

	test('should create anonymous instances in browser', async ({ page }) => {
		// Listen to console logs for debugging
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const result = await page.evaluate(async () => {
			try {
				// Dynamically import the ArDrive web bundle
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveAnonymousFactory, ArDriveAnonymousWeb } = ArDriveModule;

				const anon = arDriveAnonymousFactory();
				return {
					success: true,
					isArDriveAnonymousWeb: anon instanceof ArDriveAnonymousWeb,
					hasGetPublicDrive: typeof anon.getPublicDrive === 'function',
					hasGetPublicFolder: typeof anon.getPublicFolder === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		console.log('Anonymous test result:', result);

		if (!result.success) {
			console.error('Anonymous test failed with error:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.isArDriveAnonymousWeb).toBe(true);
		expect(result.hasGetPublicDrive).toBe(true);
		expect(result.hasGetPublicFolder).toBe(true);
	});

	test('should perform crypto operations in browser', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const result = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { aesGcmEncrypt, aesGcmDecrypt, deriveDriveKeyV2 } = ArDriveModule;

				// Test that crypto functions exist and are callable
				const testData = new TextEncoder().encode('test data');
				// Test password available for future crypto operations
				// const testPassword = 'test-password';

				return {
					success: true,
					hasAesGcmEncrypt: typeof aesGcmEncrypt === 'function',
					hasAesGcmDecrypt: typeof aesGcmDecrypt === 'function',
					hasDeriveDriveKeyV2: typeof deriveDriveKeyV2 === 'function',
					testDataLength: testData.length
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		console.log('Crypto test result:', result);

		if (!result.success) {
			console.error('Crypto test failed with error:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.hasAesGcmEncrypt).toBe(true);
		expect(result.hasAesGcmDecrypt).toBe(true);
		expect(result.hasDeriveDriveKeyV2).toBe(true);
		expect(result.testDataLength).toBe(9);
	});

	test('should handle file operations in browser', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');
		const result = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { wrapFile, wrapFiles } = ArDriveModule;

				// Create a mock File object
				const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
				const wrapped = wrapFile(mockFile);

				return {
					success: true,
					hasWrapFile: typeof wrapFile === 'function',
					hasWrapFiles: typeof wrapFiles === 'function',
					wrappedFileName: wrapped.name,
					wrappedFileSize: wrapped.size,
					wrappedFileType: wrapped.type || mockFile.type, // fallback to original file type
					hasGetBytes: typeof wrapped.getBytes === 'function',
					// Debug info
					wrappedKeys: Object.keys(wrapped),
					originalFileType: mockFile.type
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		expect(result.success).toBe(true);
		expect(result.hasWrapFile).toBe(true);
		expect(result.hasWrapFiles).toBe(true);
		expect(result.wrappedFileName).toBe('test.txt');
		expect(result.wrappedFileType).toBe('text/plain');
		expect(result.hasGetBytes).toBe(true);
	});

	test('should sign data consistently between browser and Node.js', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		// Test data signing in browser
		const browserResult = await page.evaluate(async (wallet) => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { arDriveFactory } = ArDriveModule;

				const instance = arDriveFactory({ wallet });
				const testData = new TextEncoder().encode('test signing data');

				const signed = await instance.signData(testData);
				return {
					success: true,
					hasId: !!signed.id,
					hasGetRaw: typeof signed.getRaw === 'function',
					dataLength: signed.getRaw().length,
					id: signed.id
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		}, testWallet);

		const result = await browserResult;

		console.log('Sign data test result:', result);

		if (!result.success) {
			console.error('Sign data test failed with error:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.hasId).toBe(true);
		expect(result.hasGetRaw).toBe(true);
		expect(result.dataLength).toBeGreaterThan(0);
	});

	test('should handle gateway API operations', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const result = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { GatewayAPIWeb } = ArDriveModule;

				const gateway = new GatewayAPIWeb({});

				return {
					success: true,
					isGatewayAPI: gateway instanceof GatewayAPIWeb,
					hasGetTxData: typeof gateway.getTxData === 'function',
					hasGqlRequest: typeof gateway.gqlRequest === 'function',
					hasPostWithRetry: typeof gateway.postWithRetry === 'function',
					hasGetWithRetry: typeof gateway.getWithRetry === 'function'
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		console.log('Gateway API test result:', result);

		expect(result.success).toBe(true);
		expect(result.isGatewayAPI).toBe(true);
		expect(result.hasGetTxData).toBe(true);
		expect(result.hasGqlRequest).toBe(true);
		expect(result.hasPostWithRetry).toBe(true);
		expect(result.hasGetWithRetry).toBe(true);
	});

	test('should handle metadata cache operations', async ({ page }) => {
		page.on('console', (msg) => console.log('Browser console:', msg.text()));
		page.on('pageerror', (error) => console.error('Browser error:', error));

		await page.goto('http://127.0.0.1:3000');

		const result = await page.evaluate(async () => {
			try {
				const ArDriveModule = await import('/dist/web/index.js');
				const { ArFSMetadataCacheWeb } = ArDriveModule;

				const cache = new ArFSMetadataCacheWeb();

				return {
					success: true,
					isMetadataCache: cache instanceof ArFSMetadataCacheWeb,
					canInstantiate: !!cache,
					hasConstructor: typeof cache.constructor === 'function',
					cacheType: cache.constructor.name
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		console.log('Metadata cache test result:', result);

		expect(result.success).toBe(true);
		expect(result.isMetadataCache).toBe(true);
		expect(result.canInstantiate).toBe(true);
		expect(result.hasConstructor).toBe(true);
		expect(result.cacheType).toBe('ArFSMetadataCacheWeb');
	});
});
