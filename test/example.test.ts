// The `test` directory is where the integration tests will be

import { expect } from 'chai';
import { mock, spy, stub } from 'sinon';
import * as gateway from '../src/gateway';

/**
 * This is just a placeholder example test to ensure the following are functional:
 *
 * Asynchronous mocha testing
 * Sinon -- spies / stubs / mocks
 * Power-assert
 */
describe('The getTransactionData function', () => {
	// prettier-ignore
	const expectedOutput = new Uint8Array([
    // 'ArConnect Archives' transaction data
    123,  34, 110,  97, 109, 101,  34,  58,  34,  65, 114,  67, 111, 110, 110, 101,  99,
    116,  32,  65, 114,  99, 104, 105, 118, 101, 115,  34,  44,  34, 114, 111, 111, 116,
     70, 111, 108, 100, 101, 114,  73, 100,  34,  58,  34,  49,  51, 100,  53,  99,  57,
    102,  49,  45,  50, 100,  49,  56,  45,  52,  98,  48,  97,  45,  97,  52, 102,  49,
     45,  99,  57, 101,  54, 102,  98,  57,  99,  53,  98, 101,  98,  34, 125,
  ]);

	// 'ArConnect Archives' transaction id
	const arConnectArchivesTxId = 'rsRzKeNeQUdgOaG4SYyRAcB8cnnOp_E4uo56DtKon8E';

	it('returns transaction data checked by Sinon spy', async () => {
		// Sinon spy
		const sinonSpy = spy(gateway, 'getTransactionData');
		const transaction = await gateway.getTransactionData(arConnectArchivesTxId);

		expect(transaction).to.deep.equal(expectedOutput);

		// Returning anything to a Mocha test will conclude an async test
		return expect(sinonSpy.calledOnce).to.be.ok;
	});

	it('can be stubbed by a Sinon stub', async () => {
		// Sinon stub
		stub(gateway, 'getTransactionData').callsFake(async () => 'a sinon stub');
		const stubbedTransaction = await gateway.getTransactionData(arConnectArchivesTxId);

		return expect(stubbedTransaction).to.equal('a sinon stub');
	});

	it('can be used in a Sinon mock', async () => {
		// Sinon mock
		const sinonMock = mock(gateway);
		sinonMock.expects('getTransactionData').once().returns('a sinon mock');
		const mockedTransaction = await gateway.getTransactionData(arConnectArchivesTxId);

		expect(mockedTransaction).to.equal('a sinon mock');
		return sinonMock.verify();
	});
});
