import { test, expect } from '@playwright/test';
import { createServer, Server } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

/**
 * Drive State in a real browser: the web bundle reads ardrive-web's golden
 * fixtures with sql.js's browser wasm and @noble/ciphers, as a page would.
 */
const ROOT = join(__dirname, '../..');
const TYPES: Record<string, string> = {
	'.js': 'text/javascript',
	'.wasm': 'application/wasm',
	'.json': 'application/json',
	'.html': 'text/html'
};

let server: Server;
let base: string;

test.beforeAll(async () => {
	server = createServer(async (req, res) => {
		const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
		try {
			const body = await readFile(join(ROOT, path));
			res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
			res.end(body);
		} catch {
			res.writeHead(404);
			res.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

test.afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
});

for (const name of ['public-gzip', 'private-gzip', 'gzip-bomb', 'private-wrong-key']) {
	test(`reads the ${name} fixture as ardrive-web does`, async ({ page }) => {
		await page.goto(`${base}/tests/playwright/test-page.html`);

		const result = await page.evaluate(async (fixture) => {
			const web = await import('/dist/web/index.js');
			web.enableDriveState({ locateFile: (file: string) => `/node_modules/sql.js/dist/${file}` });

			const sidecar = await (await fetch(`/tests/fixtures/drive_state/${fixture}.json`)).json();
			const body = new Uint8Array(
				await (await fetch(`/tests/fixtures/drive_state/${sidecar.body}`)).arrayBuffer()
			);
			const tags: Record<string, string> = {};
			for (const tag of sidecar.transaction.tags) {
				tags[tag.name] ??= tag.value;
			}
			const b64 = (s: string) => {
				const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
				return Uint8Array.from(bin, (c) => c.charCodeAt(0));
			};
			try {
				const contents = await web.readDriveState(
					{ txId: sidecar.transaction.id, ownerAddress: sidecar.transaction.owner, tags },
					body,
					{
						expectedOwnerAddress: sidecar.reader.ownerAddress,
						protection:
							sidecar.reader.privacy === 'private'
								? { kind: 'private', driveKey: b64(sidecar.reader.driveKey) }
								: { kind: 'public' }
					}
				);
				return { outcome: 'used', files: contents.files.length, expected: sidecar.expected };
			} catch (e) {
				return { outcome: (e as { outcome?: string }).outcome ?? `threw: ${e}`, expected: sidecar.expected };
			}
		}, name);

		const kebab = result.expected.outcome.replace(/[A-Z]/g, (c: string) => `-${c.toLowerCase()}`);
		expect(result.outcome).toBe(kebab);
		if (result.outcome === 'used') {
			expect(result.files).toBe(result.expected.tables.file_entries.length);
		}
	});
}
