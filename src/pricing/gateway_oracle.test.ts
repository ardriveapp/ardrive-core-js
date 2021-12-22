import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { expect } from 'chai';
import Sinon, { stub } from 'sinon';
import { ByteCount } from '../types';
import { byteCountPerChunk } from '../utils/constants';
import { CachedGatewayOracle, GatewayOracle } from './gateway_oracle';

describe('GatewayOracle class', () => {
	it('getWinstonForByteCount returns the expected winston value', async () => {
		const stubbedAxiosRequest = stub(axios, 'get').callsFake(async () => {
			return { data: 1337 };
		});
		const gatewayOracle = new GatewayOracle((url) => stubbedAxiosRequest(url) as Promise<AxiosResponse<any>>);

		const response = await gatewayOracle.getWinstonPriceForByteCount(new ByteCount(5));

		expect(+response).to.equal(1337);
		expect(stubbedAxiosRequest.callCount).to.equal(1);
	});
});

describe('CachedGatewayOracle class', () => {
	let cachedGatewayOracle: CachedGatewayOracle;
	let stubbedAxiosRequest: Sinon.SinonStub<[url: string, config?: AxiosRequestConfig | undefined], Promise<unknown>>;

	beforeEach(() => {
		stubbedAxiosRequest = stub(axios, 'get').callsFake(async () => {
			return { data: 1337 };
		});
		cachedGatewayOracle = new CachedGatewayOracle((url) => stubbedAxiosRequest(url) as Promise<AxiosResponse<any>>);
	});

	describe('getWinstonForByteCount', () => {
		it('initial request for one chunk will fire off axios calls for both 0 chunks and 1 chunk to cache the results', async () => {
			const response = await cachedGatewayOracle.getWinstonPriceForByteCount(new ByteCount(5));

			expect(+response).to.equal(1337);

			expect(stubbedAxiosRequest.firstCall.firstArg).to.equal('https://arweave.net/price/0');
			expect(stubbedAxiosRequest.secondCall.firstArg).to.equal('https://arweave.net/price/1');
			expect(stubbedAxiosRequest.callCount).to.equal(2);
		});

		it('initial request for two chunks will fire off axios calls for 0 chunks, 1 chunk, and two chunks', async () => {
			const response = await cachedGatewayOracle.getWinstonPriceForByteCount(
				new ByteCount(+byteCountPerChunk + 1)
			);

			expect(+response).to.equal(1337);

			expect(stubbedAxiosRequest.firstCall.firstArg).to.equal('https://arweave.net/price/0');
			expect(stubbedAxiosRequest.secondCall.firstArg).to.equal('https://arweave.net/price/1');
			expect(stubbedAxiosRequest.thirdCall.firstArg).to.equal('https://arweave.net/price/262145');
			expect(stubbedAxiosRequest.callCount).to.equal(3);
		});

		it('subsequent requests for cached chunk result will not fire off axios calls', async () => {
			const response = await cachedGatewayOracle.getWinstonPriceForByteCount(
				new ByteCount(+byteCountPerChunk * 4) // 4 chunks, 1 MiB
			);

			expect(+response).to.equal(1337);

			expect(stubbedAxiosRequest.firstCall.firstArg).to.equal('https://arweave.net/price/0');
			expect(stubbedAxiosRequest.secondCall.firstArg).to.equal('https://arweave.net/price/1');
			expect(stubbedAxiosRequest.thirdCall.firstArg).to.equal('https://arweave.net/price/1048576');
			expect(stubbedAxiosRequest.callCount).to.equal(3);

			await cachedGatewayOracle.getWinstonPriceForByteCount(
				new ByteCount(+byteCountPerChunk * 4 - 5000) // still 4 chunks, 1 MiB - 5000 bytes
			);

			// Expect axios to not be called for subsequent 4 chunk request
			expect(stubbedAxiosRequest.callCount).to.equal(3);
		});
	});
});
