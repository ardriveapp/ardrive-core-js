import { expect } from 'chai';
import { createServer, Server } from 'http';
import { GatewayAPI } from './gateway_api';
import { TxID } from '../types';

describe('GatewayAPI.getTxDataBounded', () => {
	let server: Server;
	let gateway: GatewayAPI;
	const hits: Record<string, number> = {};
	const TX = (c: string) => TxID(c.repeat(43));

	before(async () => {
		server = createServer((req, res) => {
			const id = (req.url ?? '').slice(1);
			hits[id] = (hits[id] ?? 0) + 1;
			if (id.startsWith('b')) {
				res.end(Buffer.alloc(2048, 1));
			} else if (id.startsWith('n')) {
				res.writeHead(404);
				res.end();
			} else if (id.startsWith('e')) {
				res.writeHead(hits[id] < 2 ? 502 : 200);
				res.end(Buffer.alloc(10, 2));
			} else {
				res.end(Buffer.alloc(100, 3));
			}
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		const port = typeof address === 'object' && address ? address.port : 0;
		gateway = new GatewayAPI({ gatewayUrl: new URL(`http://127.0.0.1:${port}/`), initialErrorDelayMS: 1 });
	});

	after(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	it('returns a body within the bound', async () => {
		expect((await gateway.getTxDataBounded(TX('a'), 1024)).byteLength).to.equal(100);
	});

	it('refuses a body past the bound, without retrying', async () => {
		let error = '';
		try {
			await gateway.getTxDataBounded(TX('b'), 1024);
		} catch (e) {
			error = `${e}`;
		}
		expect(error).to.match(/maxContentLength/);
		expect(hits['b'.repeat(43)]).to.equal(1);
	});

	it('does not retry a 404, and retries a server error', async () => {
		let error = '';
		try {
			await gateway.getTxDataBounded(TX('n'), 1024);
		} catch (e) {
			error = `${e}`;
		}
		expect(error).to.match(/404/);
		expect(hits['n'.repeat(43)]).to.equal(1);

		expect((await gateway.getTxDataBounded(TX('e'), 1024)).byteLength).to.equal(10);
		expect(hits['e'.repeat(43)]).to.equal(2);
	});
});
