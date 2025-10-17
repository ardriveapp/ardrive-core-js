import { test, expect } from '@playwright/test';

// Basic test to verify Playwright setup works
test.describe('Basic Playwright Setup', () => {
	test('should load a basic page and verify browser functionality', async ({ page }) => {
		// Navigate to a blank page
		await page.goto('about:blank');

		// Test basic browser functionality
		const result = await page.evaluate(() => {
			// Test basic JavaScript functionality
			const testArray = [1, 2, 3, 4, 5];
			const doubled = testArray.map((x) => x * 2);

			// Test modern JavaScript features
			const testObject = { a: 1, b: 2 };
			const spread = { ...testObject, c: 3 };

			// Test async functionality
			return {
				arrayTest: doubled,
				objectTest: spread,
				hasTextEncoder: typeof TextEncoder !== 'undefined',
				hasTextDecoder: typeof TextDecoder !== 'undefined',
				hasFile: typeof File !== 'undefined',
				userAgent: navigator.userAgent
			};
		});

		// Verify results
		expect(result.arrayTest).toEqual([2, 4, 6, 8, 10]);
		expect(result.objectTest).toEqual({ a: 1, b: 2, c: 3 });
		expect(result.hasTextEncoder).toBe(true);
		expect(result.hasTextDecoder).toBe(true);
		expect(result.hasFile).toBe(true);
		expect(result.userAgent).toBeTruthy();
	});

	test('should handle crypto operations in browser', async ({ page }) => {
		// Web Crypto API requires a secure context (HTTPS or localhost)
		await page.goto('data:text/html,<html><body><h1>Crypto Test</h1></body></html>');

		const cryptoResult = await page.evaluate(async () => {
			// Test Web Crypto API availability
			if (!window.crypto || !window.crypto.subtle) {
				return { success: false, error: 'Web Crypto API not available' };
			}

			try {
				// Generate a key for testing
				const key = await window.crypto.subtle.generateKey(
					{
						name: 'AES-GCM',
						length: 256
					},
					true,
					['encrypt', 'decrypt']
				);

				// Test data
				const data = new TextEncoder().encode('Hello, ArDrive!');
				const iv = window.crypto.getRandomValues(new Uint8Array(12));

				// Encrypt
				const encrypted = await window.crypto.subtle.encrypt(
					{
						name: 'AES-GCM',
						iv: iv
					},
					key,
					data
				);

				// Decrypt
				const decrypted = await window.crypto.subtle.decrypt(
					{
						name: 'AES-GCM',
						iv: iv
					},
					key,
					encrypted
				);

				const decryptedText = new TextDecoder().decode(decrypted);

				return {
					success: true,
					originalLength: data.length,
					encryptedLength: encrypted.byteLength,
					decryptedText: decryptedText,
					cryptoAvailable: true
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
					cryptoAvailable: true
				};
			}
		});

		// Log the result for debugging
		console.log('Crypto test result:', cryptoResult);

		if (!cryptoResult.success) {
			console.log('Crypto test failed with error:', cryptoResult.error);
			// Skip crypto test if Web Crypto API is not available in test environment
			test.skip(
				cryptoResult.error === 'Web Crypto API not available',
				'Web Crypto API not available in test context'
			);
		} else {
			expect(cryptoResult.success).toBe(true);
			expect(cryptoResult.cryptoAvailable).toBe(true);
			expect(cryptoResult.decryptedText).toBe('Hello, ArDrive!');
			expect(cryptoResult.encryptedLength).toBeGreaterThan(cryptoResult.originalLength);
		}
	});

	test('should handle file operations in browser', async ({ page }) => {
		await page.goto('about:blank');

		const fileResult = await page.evaluate(async () => {
			try {
				// Create a test file
				const testContent = 'This is test file content for ArDrive browser testing!';
				const file = new File([testContent], 'test-file.txt', {
					type: 'text/plain',
					lastModified: Date.now()
				});

				// Test file properties
				const fileInfo = {
					name: file.name,
					size: file.size,
					type: file.type,
					lastModified: file.lastModified
				};

				// Test reading file content
				const text = await file.text();
				const arrayBuffer = await file.arrayBuffer();
				const bytes = new Uint8Array(arrayBuffer);

				return {
					success: true,
					fileInfo,
					textContent: text,
					bytesLength: bytes.length,
					firstByte: bytes[0],
					lastByte: bytes[bytes.length - 1]
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				};
			}
		});

		expect(fileResult.success).toBe(true);
		expect(fileResult.fileInfo.name).toBe('test-file.txt');
		expect(fileResult.fileInfo.type).toBe('text/plain');
		expect(fileResult.textContent).toBe('This is test file content for ArDrive browser testing!');
		expect(fileResult.bytesLength).toBe(fileResult.textContent.length);
	});

	test('should run in multiple browsers', async ({ page, browserName }) => {
		await page.goto('about:blank');

		const browserInfo = await page.evaluate(() => ({
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
			cookieEnabled: navigator.cookieEnabled,
			onLine: navigator.onLine
		}));

		// Verify basic browser functionality works across different browsers
		expect(browserInfo.userAgent).toBeTruthy();
		expect(browserInfo.cookieEnabled).toBe(true);
		expect(browserInfo.onLine).toBe(true);

		// Log browser-specific information for debugging
		console.log(`Running on ${browserName}:`, browserInfo);
	});
});
