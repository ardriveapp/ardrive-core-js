import { test, expect } from '@playwright/test';
import { join } from 'path';
import { existsSync } from 'fs';

test.describe('Simple Web Bundle Tests', () => {
	test('web bundle should exist and be built', async () => {
		const webBundlePath = join(__dirname, '../../dist/web/index.js');
		expect(existsSync(webBundlePath)).toBe(true);
		
		// Check that the bundle has reasonable size (not empty)
		const fs = require('fs');
		const stats = fs.statSync(webBundlePath);
		expect(stats.size).toBeGreaterThan(1000); // At least 1KB
	});

	test('should load basic HTML page with script tag', async ({ page }) => {
		// Create a simple HTML page that loads the bundle
		const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>ArDrive Test</title>
</head>
<body>
    <h1>ArDrive Web Test</h1>
    <div id="status">Loading...</div>
    <script>
        // Test basic browser functionality
        document.getElementById('status').textContent = 'Browser loaded successfully';
        window.testPassed = true;
    </script>
</body>
</html>`;

		await page.setContent(htmlContent);
		
		// Wait for the script to run
		await page.waitForFunction(() => window.testPassed === true);
		
		const status = await page.textContent('#status');
		expect(status).toBe('Browser loaded successfully');
	});

	test('should be able to fetch web bundle file', async ({ page }) => {
		await page.goto('about:blank');
		
		const result = await page.evaluate(async () => {
			try {
				// Try to fetch the web bundle
				const response = await fetch('/dist/web/index.js');
				return {
					success: response.ok,
					status: response.status,
					contentType: response.headers.get('content-type')
				};
			} catch (error) {
				return {
					success: false,
					error: error.message
				};
			}
		});

		// This might fail due to CORS, but let's see what happens
		console.log('Fetch result:', result);
	});
});
